import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  GatewayHealthSnapshot,
  GatewaySettings,
  PendingApproval,
  ReclaimFiredPayload,
} from '../types/gateway';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import { storage } from '../services/storage';
import { secureCredentials } from '../services/secureCredentials';
import {
  AgentLeashApiError,
  enqueuedEventToPendingApproval,
  fetchAgentLeashHealth,
  fetchQueue,
  requestTestIntercept,
  submitVerdict,
  completePairing,
} from '../services/agentLeashClient';
import {
  buildDemoGateBlockedEvent,
  buildEventsWebSocketUrl,
  buildGateActionMessage,
  fetchGatewayHealth,
  gateBlockedToPending,
  parseGatewayEvent,
  parseReclaimEvent,
} from '../services/gatewayClient';
import { haptics } from '../services/haptics';
import { getPackagerHostIp } from '../services/discover';

const AGENTLEASH_POLL_MS = 2000;

interface GatewayContextValue {
  settings: GatewaySettings;
  apiKey: string;
  mobileToken: string;
  isPaired: boolean;
  isLoaded: boolean;
  health: GatewayHealthSnapshot | null;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  pendingApprovals: PendingApproval[];
  recentReclaims: ReclaimFiredPayload[];
  lastEventError?: string;
  refreshHealth: () => Promise<void>;
  saveSettings: (settings: GatewaySettings, apiKey: string) => Promise<void>;
  connectEvents: () => void;
  disconnectEvents: () => void;
  completePair: (code: string) => Promise<void>;
  disconnectPair: () => Promise<void>;
  requestTestIntercept: () => Promise<void>;
  injectDemoApproval: () => void;
  resolveApproval: (actionId: string, decision: 'approve' | 'reject') => void;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<GatewaySettings>(DEFAULT_GATEWAY_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [mobileToken, setMobileToken] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [health, setHealth] = useState<GatewayHealthSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<GatewayContextValue['connectionState']>('disconnected');
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [recentReclaims, setRecentReclaims] = useState<ReclaimFiredPayload[]>([]);
  const [lastEventError, setLastEventError] = useState<string | undefined>();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectEventsRef = useRef<() => void>(() => {});
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mobileTokenRef = useRef('');
  const settingsRef = useRef(settings);

  useEffect(() => {
    mobileTokenRef.current = mobileToken;
  }, [mobileToken]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const savedSettings = await storage.loadGatewaySettings();
      const savedKey = await secureCredentials.loadApiKey();
      const savedMobileToken = await secureCredentials.loadMobileToken();
      if (!mounted) return;
      setSettings(savedSettings);
      setApiKey(savedKey ?? '');
      setMobileToken(savedMobileToken ?? '');
      setIsLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshHealth = useCallback(async () => {
    const currentSettings = settingsRef.current;
    const token = mobileTokenRef.current;

    if (currentSettings.connectionMode === 'agentleash') {
      try {
        const relay = await fetchAgentLeashHealth(currentSettings.cloudUrl);
        setHealth({
          level: relay.ok ? 'green' : 'amber',
          status: relay.ok ? 'ok' : 'degraded',
          gatewayState: token ? 'paired' : 'unpaired',
          checkedAt: new Date().toISOString(),
        });
      } catch (error) {
        setHealth({
          level: 'red',
          checkedAt: new Date().toISOString(),
          errorMessage: error instanceof Error ? error.message : 'AgentLeash relay unreachable',
        });
      }
      return;
    }

    const snapshot = await fetchGatewayHealth(currentSettings.gatewayUrl, apiKey);
    setHealth(snapshot);
  }, [apiKey]);

  const stopAgentLeashPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollAgentLeashQueue = useCallback(async () => {
    const token = mobileTokenRef.current;
    const currentSettings = settingsRef.current;
    if (!token || currentSettings.demoMode) {
      return;
    }

    try {
      const queue = await fetchQueue(currentSettings.cloudUrl, token);
      setPendingApprovals(queue.events.map(enqueuedEventToPendingApproval));
      setConnectionState('connected');
      setLastEventError(undefined);
    } catch (error) {
      if (error instanceof AgentLeashApiError && error.status === 401) {
        await secureCredentials.clearMobileToken();
        setMobileToken('');
        setConnectionState('disconnected');
        setLastEventError('Pairing expired — enter a new code from agentleash pair.');
        stopAgentLeashPolling();
        return;
      }
      setConnectionState('disconnected');
      setLastEventError(
        error instanceof Error ? error.message : 'AgentLeash relay poll failed',
      );
    }
  }, [stopAgentLeashPolling]);

  const startAgentLeashPolling = useCallback(() => {
    stopAgentLeashPolling();
    if (!mobileTokenRef.current || settingsRef.current.demoMode) {
      setConnectionState('disconnected');
      return;
    }
    setConnectionState('connecting');
    pollAgentLeashQueue();
    pollIntervalRef.current = setInterval(() => {
      pollAgentLeashQueue();
    }, AGENTLEASH_POLL_MS);
  }, [pollAgentLeashQueue, stopAgentLeashPolling]);

  useEffect(() => {
    if (!isLoaded) return;
    refreshHealth();
    const interval = setInterval(() => {
      refreshHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, [isLoaded, refreshHealth]);

  const disconnectEvents = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    stopAgentLeashPolling();
    if (!settingsRef.current.demoMode && !mobileTokenRef.current) {
      setConnectionState('disconnected');
    }
  }, [stopAgentLeashPolling]);

  const handleGatewayMessage = useCallback((raw: string) => {
    const event = parseGatewayEvent(raw);
    if (!event) return;

    const pending = gateBlockedToPending(event);
    if (pending) {
      haptics.warning();
      setPendingApprovals((prev) => {
        if (prev.some((item) => item.actionId === pending.actionId)) {
          return prev;
        }
        return [pending, ...prev];
      });
      return;
    }

    const reclaim = parseReclaimEvent(event);
    if (reclaim) {
      setRecentReclaims((prev) => [reclaim, ...prev].slice(0, 20));
    }
  }, []);

  const autoDiscoverGateway = useCallback(async (): Promise<string> => {
    const candidates: string[] = ['http://127.0.0.1:8642', 'http://10.0.2.2:8642'];
    const packagerIp = getPackagerHostIp();
    if (packagerIp) {
      candidates.push(`http://${packagerIp}:8642`);
    }

    const currentUrl = settingsRef.current.gatewayUrl;
    if (currentUrl && !candidates.includes(currentUrl)) {
      candidates.push(currentUrl);
    }

    const probe = async (url: string): Promise<string> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1500);
      try {
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        if (res.ok) {
          const body = await res.json();
          if (body && body.status === 'ok') {
            clearTimeout(id);
            return url;
          }
        }
      } catch (_) {
        // Ignore
      }
      clearTimeout(id);
      throw new Error('failed');
    };

    try {
      const successfulUrl = await new Promise<string>((resolve, reject) => {
        let rejectedCount = 0;
        candidates.forEach((c) => {
          probe(c)
            .then(resolve)
            .catch(() => {
              rejectedCount++;
              if (rejectedCount === candidates.length) {
                reject(new Error('All failed'));
              }
            });
        });
      });

      if (successfulUrl !== currentUrl) {
        const nextSettings = { ...settingsRef.current, gatewayUrl: successfulUrl };
        await storage.saveGatewaySettings(nextSettings);
        setSettings(nextSettings);
      }
      return successfulUrl;
    } catch (_) {
      return currentUrl;
    }
  }, []);

  const connectGatewayWebSocket = useCallback(async () => {
    disconnectEvents();
    setLastEventError(undefined);

    const currentSettings = settingsRef.current;
    if (currentSettings.demoMode) {
      setConnectionState('demo');
      return;
    }

    setConnectionState('connecting');

    const activeUrl = await autoDiscoverGateway();
    const wsUrl = buildEventsWebSocketUrl(activeUrl);

    try {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionState('connected');
        setLastEventError(undefined);
      };

      socket.onmessage = (message) => {
        if (typeof message.data === 'string') {
          handleGatewayMessage(message.data);
        }
      };

      socket.onerror = () => {
        setLastEventError('WebSocket error — /v1/events may not be enabled on this gateway yet.');
        setConnectionState('disconnected');
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
          setConnectionState('disconnected');

          if (!settingsRef.current.demoMode) {
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              connectEventsRef.current();
            }, 5000);
          }
        }
      };
    } catch (error) {
      setLastEventError(error instanceof Error ? error.message : 'Failed to open WebSocket');
      setConnectionState('disconnected');
    }
  }, [disconnectEvents, handleGatewayMessage, autoDiscoverGateway]);

  const connectEvents = useCallback(() => {
    const currentSettings = settingsRef.current;
    const token = mobileTokenRef.current;

    if (currentSettings.demoMode) {
      disconnectEvents();
      setConnectionState('demo');
      return;
    }

    if (currentSettings.connectionMode === 'agentleash') {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (token) {
        startAgentLeashPolling();
      } else {
        stopAgentLeashPolling();
        setConnectionState('disconnected');
        setLastEventError('Not paired — run agentleash pair on your Mac and enter the code in Settings.');
      }
      return;
    }

    stopAgentLeashPolling();
    connectGatewayWebSocket();
  }, [
    connectGatewayWebSocket,
    disconnectEvents,
    startAgentLeashPolling,
    stopAgentLeashPolling,
  ]);

  useEffect(() => {
    connectEventsRef.current = connectEvents;
  }, [connectEvents]);

  useEffect(() => {
    if (!isLoaded) return;
    connectEvents();
    return () => disconnectEvents();
  }, [isLoaded, connectEvents, disconnectEvents, mobileToken, settings.connectionMode]);

  const saveSettings = useCallback(
    async (nextSettings: GatewaySettings, nextApiKey: string) => {
      await storage.saveGatewaySettings(nextSettings);
      await secureCredentials.saveApiKey(nextApiKey);
      setSettings(nextSettings);
      setApiKey(nextApiKey);
      settingsRef.current = nextSettings;
      await refreshHealth();
      connectEvents();
    },
    [connectEvents, refreshHealth],
  );

  const completePair = useCallback(
    async (code: string) => {
      const token = await completePairing(settings.cloudUrl, code);
      await secureCredentials.saveMobileToken(token);
      setMobileToken(token);
      mobileTokenRef.current = token;
      setLastEventError(undefined);
      haptics.success();
      await refreshHealth();
      connectEvents();
    },
    [connectEvents, refreshHealth, settings.cloudUrl],
  );

  const disconnectPair = useCallback(async () => {
    await secureCredentials.clearMobileToken();
    setMobileToken('');
    mobileTokenRef.current = '';
    setPendingApprovals([]);
    stopAgentLeashPolling();
    setConnectionState('disconnected');
    await refreshHealth();
  }, [refreshHealth, stopAgentLeashPolling]);

  const triggerTestIntercept = useCallback(async () => {
    const token = mobileTokenRef.current;
    if (!token) {
      throw new Error('Pair with AgentLeash before requesting a test intercept.');
    }
    await requestTestIntercept(settings.cloudUrl, token);
    await pollAgentLeashQueue();
  }, [pollAgentLeashQueue, settings.cloudUrl]);

  const injectDemoApproval = useCallback(() => {
    const event = buildDemoGateBlockedEvent();
    const pending = gateBlockedToPending(event);
    if (pending) {
      haptics.warning();
      setPendingApprovals((prev) => [pending, ...prev]);
    }
    setConnectionState('demo');
  }, []);

  const resolveApproval = useCallback(
    (actionId: string, decision: 'approve' | 'reject') => {
      setPendingApprovals((prev) => prev.filter((item) => item.actionId !== actionId));

      if (settingsRef.current.connectionMode === 'agentleash' && mobileTokenRef.current) {
        const verdict = decision === 'approve' ? 'allow' : 'block';
        const reason = decision === 'reject' ? 'Rejected from Hermes Mobile' : undefined;
        submitVerdict(
          settingsRef.current.cloudUrl,
          mobileTokenRef.current,
          actionId,
          verdict,
          reason,
        ).catch((error) => {
          setLastEventError(error instanceof Error ? error.message : 'Failed to submit verdict');
        });
        return;
      }

      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        const message = buildGateActionMessage(actionId, decision);
        socket.send(JSON.stringify(message));
      }
    },
    [],
  );

  const value = useMemo<GatewayContextValue>(
    () => ({
      settings,
      apiKey,
      mobileToken,
      isPaired: Boolean(mobileToken),
      isLoaded,
      health,
      connectionState,
      pendingApprovals,
      recentReclaims,
      lastEventError,
      refreshHealth,
      saveSettings,
      connectEvents,
      disconnectEvents,
      completePair,
      disconnectPair,
      requestTestIntercept: triggerTestIntercept,
      injectDemoApproval,
      resolveApproval,
    }),
    [
      settings,
      apiKey,
      mobileToken,
      isLoaded,
      health,
      connectionState,
      pendingApprovals,
      recentReclaims,
      lastEventError,
      refreshHealth,
      saveSettings,
      connectEvents,
      disconnectEvents,
      completePair,
      disconnectPair,
      triggerTestIntercept,
      injectDemoApproval,
      resolveApproval,
    ],
  );

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}

export function useGateway(): GatewayContextValue {
  const ctx = useContext(GatewayContext);
  if (!ctx) {
    throw new Error('useGateway must be used within GatewayProvider');
  }
  return ctx;
}
