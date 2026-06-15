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
  buildDemoGateBlockedEvent,
  buildEventsWebSocketUrl,
  buildGateActionMessage,
  fetchGatewayHealth,
  gateBlockedToPending,
  parseGatewayEvent,
  parseReclaimEvent,
} from '../services/gatewayClient';
import { haptics } from '../services/haptics';

interface GatewayContextValue {
  settings: GatewaySettings;
  apiKey: string;
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
  injectDemoApproval: () => void;
  resolveApproval: (actionId: string, decision: 'approve' | 'reject') => void;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<GatewaySettings>(DEFAULT_GATEWAY_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [health, setHealth] = useState<GatewayHealthSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<GatewayContextValue['connectionState']>('disconnected');
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [recentReclaims, setRecentReclaims] = useState<ReclaimFiredPayload[]>([]);
  const [lastEventError, setLastEventError] = useState<string | undefined>();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const savedSettings = await storage.loadGatewaySettings();
      const savedKey = await secureCredentials.loadApiKey();
      if (!mounted) return;
      setSettings(savedSettings);
      setApiKey(savedKey ?? '');
      setIsLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshHealth = useCallback(async () => {
    const snapshot = await fetchGatewayHealth(settings.gatewayUrl, apiKey);
    setHealth(snapshot);
  }, [settings.gatewayUrl, apiKey]);

  useEffect(() => {
    if (!isLoaded) return;
    refreshHealth();
    const interval = setInterval(() => {
      refreshHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, [isLoaded, refreshHealth]);

  const disconnectEvents = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnectionState('disconnected');
  }, []);

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

  const connectEvents = useCallback(() => {
    disconnectEvents();
    setLastEventError(undefined);

    if (settings.demoMode) {
      setConnectionState('demo');
      return;
    }

    const wsUrl = buildEventsWebSocketUrl(settings.gatewayUrl);
    setConnectionState('connecting');

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
        }
      };
    } catch (error) {
      setLastEventError(error instanceof Error ? error.message : 'Failed to open WebSocket');
      setConnectionState('disconnected');
    }
  }, [disconnectEvents, handleGatewayMessage, settings.demoMode, settings.gatewayUrl]);

  useEffect(() => {
    if (!isLoaded) return;
    connectEvents();
    return () => disconnectEvents();
  }, [isLoaded, connectEvents, disconnectEvents]);

  const saveSettings = useCallback(async (nextSettings: GatewaySettings, nextApiKey: string) => {
    await storage.saveGatewaySettings(nextSettings);
    await secureCredentials.saveApiKey(nextApiKey);
    setSettings(nextSettings);
    setApiKey(nextApiKey);
    await refreshHealth();
    connectEvents();
  }, [connectEvents, refreshHealth]);

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
      injectDemoApproval,
      resolveApproval,
    }),
    [
      settings,
      apiKey,
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
