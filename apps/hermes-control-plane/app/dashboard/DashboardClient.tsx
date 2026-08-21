"use client";

import { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrandMark } from "../BrandMark";
import { FormattedMessage } from "../FormattedMessage";
import { SignOutForm } from "../SignOutForm";
import {
  DASHBOARD_CACHE_KEYS,
  type CachedIdentity,
  type CachedThreadDetails,
  isThreadDetailFresh,
  pruneThreadDetailStorage,
  readJsonSessionStorage,
  selectPreheatThreadIds,
  threadDetailsStorageKey,
  writeJsonSessionStorage,
} from "@/lib/dashboard-nav-cache";
import { resolveComposerRunCta } from "@/lib/composer-run-cta";
import { scheduleOneShotErrorRetry, startActiveTaskRefresh, startDashboardRefresh } from "@/lib/dashboard-refresh";
import { orderTasksChronologically } from "@/lib/dashboard-task-order";
import {
  snapshotMessageMeta,
  taskOutputMeta,
  taskPromptMeta,
  type ConversationMessageMeta,
} from "@/lib/conversation-message-meta";
import {
  hasPendingConversationTasks,
  mergeConversationTasks,
  mergeTasksForTaskList,
  pruneResolvedOptimistic,
  scrollConversationHistoryToLatest,
  type ConversationTask,
  type TaskLike,
} from "@/lib/conversation-send-visibility";
import {
  HOSTED_NOT_COMPUTER_HISTORY,
  hostedConnectionCopy,
  hostedResourceLabel,
  type HostedResourceState,
  type HostedResourceStatus,
} from "@/lib/hosted-apphost";

type User = { id: string; email: string; name: string; avatarUrl: string | null };
type Organization = { id: string; plan: string; trialEndsAt: number | null; cloudAccess: boolean };
/** CoreWeave-style capacity snapshot from /api/me (enforced governance caps). */
type HostedResourceView = HostedResourceStatus;
type ContinuityUsage = {
  cloudTasks30d: number;
  cloudTaskLimit: number;
  cloudTasksRemaining: number;
  activeTasks: number;
  maxActiveTasks: number;
  plan: string;
  purchaseMode?: string;
  windowDays: number;
  percentUsed?: number;
  exhausted?: boolean;
  upgradeHint?: string | null;
};
type Device = {
  id: string;
  name: string;
  fingerprint: string;
  failoverMode: "disabled" | "manual" | "auto";
  lastSeenAt: number | null;
  online: boolean;
  stale?: boolean;
  presence?: "online" | "stale" | "offline";
};
type Thread = { id: string; title: string; taskCount: number; updatedAt: number; source: string; model: string | null; preview: string | null; messageCount: number; sourceSessionId: string | null; syncedAt: number | null; deviceName: string | null };
type Task = { id: string; threadId: string; threadTitle: string; prompt: string; status: string; route: string; result: string | null; error: string | null; createdAt: number; updatedAt: number; completedAt: number | null; deviceName: string | null };
type ThreadDetails = {
  syncedAt?: number | null;
  snapshot: Array<{ role: string; content: string; createdAt?: number | null }>;
  tasks: Array<{ id: string; prompt: string; result: string | null; error: string | null; route: string; status: string; createdAt: number; completedAt?: number | null; deviceName?: string | null }>;
};
type Feedback = { taskId: string; signal: "up" | "down"; note: string | null; updatedAt: number };
type ChatDialog = { kind: "rename" | "delete"; thread: Thread } | { kind: "clear" };

const terminal = new Set(["completed", "failed"]);
const pairingCodePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const connectorInstallCommand = "curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-connector.sh | bash";
const chatRailPreferenceKey = "thumbgate.chatRailExpanded";
const sidebarWidthPreferenceKey = "thumbgate.sidebarWidth";
const threadSortPreferenceKey = "thumbgate.threadSortOrder";
const preferredDevicePreferenceKey = "thumbgate.preferredDeviceId";
const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 480;
type ThreadSortOrder = "newest" | "oldest" | "alphabetical";

function Mark() { return <BrandMark title="" size={26} />; }
function age(timestamp: number | null) {
  if (!timestamp) return "never connected";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function deviceStatusLabel(device: Device) {
  if (device.online || device.presence === "online") return "Online";
  if (device.stale || device.presence === "stale") return `Stale · last seen ${age(device.lastSeenAt)}`;
  return `Last seen ${age(device.lastSeenAt)}`;
}

/** Prefer the real paired hostname; never invent "Mac" for unknown platforms. */
function machineDisplayName(device: Device | null | undefined, fallback = "your computer"): string {
  const name = device?.name?.trim();
  return name || fallback;
}

function shortMachineLabel(name: string, max = 12): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * Empty-task copy must not blame pairing when machines exist (Buzz lesson 2026-07-28:
 * shared-room honesty — chats/synced messages ≠ unpaired).
 */
function taskListEmptyCopy(input: {
  taskFilter: "all" | "completed" | "unrated";
  hasSelectedThread: boolean;
  syncedMessageCount: number;
}): { title: string; body: string; compact: boolean } {
  if (input.taskFilter === "unrated") {
    return {
      title: "No unrated answers",
      body: "Every completed web answer already has a thumbs rating, or none have finished yet.",
      compact: false,
    };
  }
  if (input.taskFilter === "completed") {
    return {
      title: "No completed answers",
      body: "No completed web answers in this workspace yet. Run a task until it finishes.",
      compact: false,
    };
  }
  if (input.hasSelectedThread && input.syncedMessageCount > 0) {
    return {
      title: "No web tasks in this chat yet",
      body: "Conversation is synced above. Type below to run the next step on the hosted VPS (fenced runner, 90s lease).",
      compact: true,
    };
  }
  if (input.hasSelectedThread) {
    return {
      title: "No web tasks in this chat yet",
      body: "Type below to run work on the hosted VPS. Synced messages appear here when active.",
      compact: false,
    };
  }
  return {
    title: "No tasks yet",
    body: "Type below to run on the hosted VPS, or open a chat from the list.",
    compact: false,
  };
}

function taskReceiptLabel(task: { route: string; deviceName?: string | null; status: string }): string {
  if (task.route === "cloud") return "☁ hosted Hermes · fenced · 90s lease";
  if (task.route === "local") {
    const host = task.deviceName?.trim() || "Hermes machine";
    return `⌘ ${host} · fenced · 90s lease`;
  }
  return "Ⅱ Awaiting route · fenced when claimed";
}

/** Prefer online machines, then most recently seen — only when the user has no saved pick. */
function pickDefaultDeviceId(nextDevices: Device[], preferredId: string | null | undefined): string {
  if (!nextDevices.length) return "";
  if (preferredId && nextDevices.some((device) => device.id === preferredId)) return preferredId;
  const sorted = [...nextDevices].sort((left, right) => {
    const leftOnline = left.online || left.presence === "online" ? 1 : 0;
    const rightOnline = right.online || right.presence === "online" ? 1 : 0;
    if (rightOnline !== leftOnline) return rightOnline - leftOnline;
    return (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0) || left.name.localeCompare(right.name);
  });
  return sorted[0]?.id ?? "";
}

function latency(milliseconds: number | null) {
  if (milliseconds === null) return "—";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`;
  return `${Math.round(milliseconds / 60_000)}m`;
}

function formatDateTime(timestamp: number) {
  try {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function ConversationMeta({ meta }: { meta: ConversationMessageMeta }) {
  const statusStr = typeof meta?.status === "string" ? meta.status : "unknown";
  let isoStr: string | null = null;
  if (meta?.timestamp && Number.isFinite(meta.timestamp) && meta.timestamp > 0) {
    try {
      const d = new Date(meta.timestamp);
      if (!isNaN(d.getTime())) isoStr = d.toISOString();
    } catch {
      isoStr = null;
    }
  }

  return (
    <div
      className="task-top"
      data-testid="conversation-message-meta"
      data-timestamp-source={meta?.timestampSource ?? "none"}
    >
      <span className={`task-status status-${statusStr}`}>{statusStr.replaceAll("_", " ")}</span>
      {isoStr && meta?.timestamp ? (
        <time dateTime={isoStr}>
          {meta.timestampSource === "sync" ? "Synced " : ""}{formatDateTime(meta.timestamp)}
        </time>
      ) : (
        <time>Time unavailable</time>
      )}
    </div>
  );
}

function sortThreadsNewestFirst(nextThreads: Thread[]) {
  return [...nextThreads].sort((left, right) =>
    Number(right.updatedAt) - Number(left.updatedAt) || right.id.localeCompare(left.id)
  );
}

/** Reorders an already newest-first list for display; fetch/auto-select logic always uses newest-first internally. */
function orderThreadsForDisplay(nextThreads: Thread[], order: ThreadSortOrder) {
  if (order === "alphabetical") {
    return [...nextThreads].sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id)
    );
  }
  if (order === "oldest") return [...nextThreads].reverse();
  return nextThreads;
}

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export default function DashboardClient() {
  /** Shell-first: hydrate from sessionStorage so revisits paint before network. */
  const [user, setUser] = useState<User | null>(() => {
    const cached = readJsonSessionStorage<CachedIdentity<User, Organization>>(DASHBOARD_CACHE_KEYS.me);
    return cached?.user ?? null;
  });
  const [organization, setOrganization] = useState<Organization | null>(() => {
    const cached = readJsonSessionStorage<CachedIdentity<User, Organization>>(DASHBOARD_CACHE_KEYS.me);
    return cached?.organization ?? null;
  });
  /** CoreWeave-style remaining capacity from /api/me (governance-enforced caps). */
  const [continuityUsage, setContinuityUsage] = useState<ContinuityUsage | null>(null);
  const [hostedRunner, setHostedRunner] = useState<HostedResourceView | null>(null);
  const [hostedModel, setHostedModel] = useState<HostedResourceView | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [threads, setThreads] = useState<Thread[]>(() => readJsonSessionStorage<Thread[]>(DASHBOARD_CACHE_KEYS.threads) ?? []);
  const [tasks, setTasks] = useState<Task[]>(() => readJsonSessionStorage<Task[]>(DASHBOARD_CACHE_KEYS.tasks) ?? []);
  const [selectedThread, setSelectedThread] = useState<string | null>(() => {
    // Lessons deep-links: list/filter modes must not auto-open a sticky thread.
    if (typeof window !== "undefined") {
      if (window.location.hash === "#chats") return null;
      const filter = new URLSearchParams(window.location.search).get("filter");
      if (filter === "completed" || filter === "unrated") return null;
    }
    const stored = readJsonSessionStorage<string>(DASHBOARD_CACHE_KEYS.selectedThread);
    if (stored) return stored;
    const cachedThreads = readJsonSessionStorage<Thread[]>(DASHBOARD_CACHE_KEYS.threads) ?? [];
    return cachedThreads[0]?.id ?? null;
  });
  /** Lessons → Hermes deep-link: ?filter=completed|unrated shows task receipts across chats. */
  const [taskFilter, setTaskFilter] = useState<"all" | "completed" | "unrated">(() => {
    if (typeof window === "undefined") return "all";
    const filter = new URLSearchParams(window.location.search).get("filter");
    if (filter === "completed" || filter === "unrated") return filter;
    return "all";
  });
  const [threadDetails, setThreadDetails] = useState<ThreadDetails | null>(null);
  const [prompt, setPrompt] = useState("");
  /**
   * Explicit user override for which hosted runner runs the next task.
   * Resolved selection is derived (useMemo) so we never setState inside an effect (eslint react-hooks/set-state-in-effect).
   */
  const [deviceOverrideId, setDeviceOverrideId] = useState<string | null>(null);
  /** True once first network load finishes (or fails auth). */
  // "loading" until a workspace fetch actually completes. Empty states in this view assert a
  // FACT about the user's setup ("no tasks — start a hosted run"); rendering them from an
  // unloaded [] turns "we don't know yet" into "your setup is broken". Absence of data is not
  // evidence of absence, so the empty state waits for "loaded" and failures show "error".
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const workspaceHydrated = loadState === "loaded";
  /** In-memory thread detail cache for instant switch + hover preheat. */
  const threadCacheRef = useRef<Map<string, ThreadDetails>>(new Map());
  const preheatInflightRef = useRef<Set<string>>(new Set());

  const selectedDeviceId = useMemo(() => {
    if (!devices.length) return "";
    if (deviceOverrideId && devices.some((device) => device.id === deviceOverrideId)) {
      return deviceOverrideId;
    }
    let stored: string | null = null;
    if (typeof window !== "undefined") {
      try {
        stored = window.localStorage.getItem(preferredDevicePreferenceKey);
      } catch {
        stored = null;
      }
    }
    return pickDefaultDeviceId(devices, stored);
  }, [devices, deviceOverrideId]);

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  /** Real paired hostname when present — never a vague placeholder. */
  const selectedDeviceLabel = machineDisplayName(selectedDevice, "hosted VPS");
  const hasCloudAccess = Boolean(organization?.cloudAccess);
  const [pairCode, setPairCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installCopied, setInstallCopied] = useState(false);
  const [chatRailExpanded, setChatRailExpanded] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [threadSortOrder, setThreadSortOrder] = useState<ThreadSortOrder>("newest");
  const [resizing, setResizing] = useState(false);
  /** Anchored ••• menu: fixed coords so sidebar overflow cannot detach it. */
  const [threadMenu, setThreadMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const threadMenuRef = useRef<HTMLDivElement | null>(null);
  const [chatDialog, setChatDialog] = useState<ChatDialog | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [chatOperationBusy, setChatOperationBusy] = useState(false);
  const [safetyExpanded, setSafetyExpanded] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [feedbackDialog, setFeedbackDialog] = useState<{ taskId: string; note: string } | null>(null);
  const [feedbackBusyTask, setFeedbackBusyTask] = useState<string | null>(null);
  /** Bottom-tab highlight on phone: path + hash, not always-Hermes. */
  const [mobileTab, setMobileTab] = useState<"hermes" | "leash" | "lessons" | "settings">("hermes");
  /**
   * Leash and Settings are two panes rendered inside ONE scrolling element
   * (.right-rail). Switching tabs only swaps which children are visible, so the
   * scroll offset carried over: scroll down in Settings, tap Leash, and Leash
   * opened partway down with its heading — and the machine picker — above the
   * fold, which reads as "there is no machine picker".
   */
  const rightRailRef = useRef<HTMLElement | null>(null);
  const conversationHistoryRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  /** Phone shell: hide route-explain blurb so it cannot cover the textarea (Genspark-style compact chrome). */
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  const scrollConversationToBottom = useCallback((smooth = false) => {
    const el = conversationHistoryRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, []);

  useEffect(() => {
    if (!selectedThread) return;
    scrollConversationToBottom(false);
    const timeout = setTimeout(() => scrollConversationToBottom(false), 50);
    return () => clearTimeout(timeout);
  }, [selectedThread, threadDetails, tasks, scrollConversationToBottom]);

  // Send the shared scrollport back to the top whenever the pane inside it
  // changes, so a tab always opens at its own heading rather than wherever the
  // previous tab happened to be scrolled to. Only Leash and Settings share this
  // element; the other tabs render elsewhere and must not be disturbed.
  useEffect(() => {
    if (mobileTab !== "leash" && mobileTab !== "settings") return;
    const rail = rightRailRef.current;
    if (!rail) return;
    // The pane swap is a CSS/display change; wait a frame so the new content is
    // laid out before resetting, otherwise the browser can restore the offset.
    const raf = window.requestAnimationFrame(() => {
      rail.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [mobileTab]);

  // Keep the ••• actions menu glued to its trigger; close on outside / Escape / scroll.
  useEffect(() => {
    if (!threadMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThreadMenu(null);
    };
    const onPointer = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (threadMenuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".thread-menu-trigger")) return;
      setThreadMenu(null);
    };
    const onRepositionClose = () => setThreadMenu(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", onRepositionClose);
    window.addEventListener("scroll", onRepositionClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onRepositionClose);
      window.removeEventListener("scroll", onRepositionClose, true);
    };
  }, [threadMenu]);
  const chatsListDeepLink =
    typeof window !== "undefined" && window.location.hash === "#chats";
  // True when we must not auto-pick nextThreads[0] (user already chose, or #chats list view).
  const autoSelectedThread = useRef(chatsListDeepLink || Boolean(selectedThread));
  const selectedThreadRef = useRef(selectedThread);
  /** One-shot deep link from lessons page: /dashboard?task=…&thread=…#task-activity */
  const focusedTaskFromUrl = useRef(false);
  /** One-shot: /dashboard#chats expands the rail and shows the thread list. */
  const openedChatsListFromUrl = useRef(false);
  const composerObserverRef = useRef<ResizeObserver | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  /** One restore per selected thread: a hard refresh opens at the newest output. */
  const restoredThreadBottomRef = useRef<string | null>(null);
  /** Optimistic web prompts waiting to appear in /api/thread-messages. */
  const pendingConversationTasksRef = useRef<ConversationTask[]>([]);
  // prefetchThreadDetails retries itself from a setTimeout inside its own
  // useCallback body; calling through this ref satisfies the react-compiler
  // access-before-declaration rule and keeps the retry on the latest instance.
  const prefetchThreadDetailsRef = useRef<((threadId: string, opts?: { force?: boolean }) => Promise<void>) | null>(null);
  /**
   * Composer is in-flow (desktop) / sticky above mobile tab bar (document scroll).
   * Keep a real form ref so empty-state CTAs can focus the textarea.
   * Also clear legacy --composer-dock-space so old cached CSS does not pad the thread.
   */
  const setComposerNode = useCallback((node: HTMLFormElement | null) => {
    composerObserverRef.current?.disconnect();
    composerObserverRef.current = null;
    composerFormRef.current = node;
    if (typeof document !== "undefined") {
      document.documentElement.style.removeProperty("--composer-dock-space");
    }
  }, []);

  const focusComposer = useCallback(() => {
    const form = composerFormRef.current;
    if (!form) return;
    form.scrollIntoView({ behavior: "smooth", block: "end" });
    const textarea = form.querySelector("textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      window.setTimeout(() => {
        textarea.focus({ preventScroll: true });
      }, 120);
    }
  }, []);


  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);

  /** Switch to Settings (mobile tab + hash) and focus the panel. Hash-only links do nothing in this shell. */
  function openSettingsPanel() {
    setMobileTab("settings");
    window.history.replaceState(null, "", "#web-settings");
    window.setTimeout(() => {
      const el = document.getElementById("web-settings");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (el instanceof HTMLElement) {
        el.focus({ preventScroll: true });
      }
    }, 50);
  }

  function chooseDevice(deviceId: string) {
    if (deviceId === "pair" || deviceId === "manage") {
      openSettingsPanel();
      return;
    }
    if (deviceId === "cloud") return;
    setDeviceOverrideId(deviceId);
    try {
      window.localStorage.setItem(preferredDevicePreferenceKey, deviceId);
    } catch {
      /* private mode */
    }
    const picked = devices.find((device) => device.id === deviceId);
    if (picked) {
      setNotice(`Tasks will run on ${machineDisplayName(picked)}.`);
    }
  }

  const persistThreadDetails = useCallback((threadId: string, details: ThreadDetails) => {
    threadCacheRef.current.set(threadId, details);
    writeJsonSessionStorage(threadDetailsStorageKey(threadId), {
      details,
      cachedAt: Date.now(),
    } satisfies CachedThreadDetails<ThreadDetails>);
    if (typeof sessionStorage !== "undefined") {
      pruneThreadDetailStorage(sessionStorage);
    }
  }, []);

  const readCachedThreadDetails = useCallback((threadId: string): ThreadDetails | null => {
    const mem = threadCacheRef.current.get(threadId);
    if (mem) return mem;
    const stored = readJsonSessionStorage<CachedThreadDetails<ThreadDetails>>(threadDetailsStorageKey(threadId));
    if (!stored?.details) return null;
    threadCacheRef.current.set(threadId, stored.details);
    return stored.details;
  }, []);

  const prefetchThreadDetails = useCallback(async (threadId: string, opts?: { force?: boolean }) => {
    if (!threadId) return;
    if (!opts?.force) {
      const existing = readCachedThreadDetails(threadId);
      const meta = readJsonSessionStorage<CachedThreadDetails<ThreadDetails>>(threadDetailsStorageKey(threadId));
      if (existing && meta && isThreadDetailFresh(meta.cachedAt)) return;
      if (preheatInflightRef.current.has(threadId)) return;
    }
    preheatInflightRef.current.add(threadId);
    try {
      const detailResponse = await fetch(
        `/api/thread-messages?thread_id=${encodeURIComponent(threadId)}`,
        { cache: "no-store" },
      );
      if (!detailResponse.ok) {
        // Never poison the whole workspace loadState for one thread detail miss.
        // That produced "Could not load this conversation" with 0 synced messages while
        // Manage plan / shell still worked (owner report 2026-08-17 mobile dashboard).
        threadCacheRef.current.delete(threadId);
        if (selectedThreadRef.current === threadId) {
          if (detailResponse.status === 404) {
            // A just-sent message creates a thread that may not be queryable at
            // /api/thread-messages for a few hundred ms (server-side propagation).
            // If there are pending optimistic tasks, retry instead of nuking the
            // view — otherwise the sent message vanishes (2026-08-20 user report).
            if (hasPendingConversationTasks(pendingConversationTasksRef.current)) {
              // Schedule a single retry. prefetchThreadDetails with {force:true}
              // will re-attempt; if it 404s again the pending check still
              // protects the user's optimistic bubble for one more cycle.
              window.setTimeout(() => {
                if (selectedThreadRef.current === threadId) {
                  void prefetchThreadDetailsRef.current?.(threadId, { force: true });
                }
              }, 500);
              return;
            }
            // Stale selection (deleted thread / wrong org id in sessionStorage).
            setSelectedThread(null);
            setThreadDetails(null);
            writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, null);
          } else {
            // Network/5xx: empty snapshot, not a global workspace error.
            setThreadDetails({ snapshot: [], tasks: [] });
          }
        }
        return;
      }
      const body = await detailResponse.json() as ThreadDetails & {
        thread?: { syncedAt?: number | null };
        snapshot?: ThreadDetails["snapshot"];
        tasks?: ThreadDetails["tasks"];
      };
      const serverTasks: ConversationTask[] = Array.isArray(body.tasks) ? body.tasks : [];
      pendingConversationTasksRef.current = pruneResolvedOptimistic(
        pendingConversationTasksRef.current,
        serverTasks,
      );
      const details: ThreadDetails = {
        syncedAt: body.thread?.syncedAt ?? null,
        snapshot: Array.isArray(body.snapshot) ? body.snapshot : [],
        tasks: mergeConversationTasks(serverTasks, pendingConversationTasksRef.current),
      };
      persistThreadDetails(threadId, details);
      if (selectedThreadRef.current === threadId) {
        setThreadDetails(details);
      }
    } catch {
      // Prefetch is best-effort; open path will revalidate.
      if (selectedThreadRef.current === threadId) {
        setThreadDetails((prev) => prev ?? { snapshot: [], tasks: [] });
      }
    } finally {
      preheatInflightRef.current.delete(threadId);
    }
  }, [persistThreadDetails, readCachedThreadDetails]);

  useEffect(() => {
    prefetchThreadDetailsRef.current = prefetchThreadDetails;
  }, [prefetchThreadDetails]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 700px)");
    const apply = () => setIsNarrowViewport(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    function openChatsListFromHash() {
      if (window.location.hash !== "#chats") return;
      if (openedChatsListFromUrl.current) return;
      openedChatsListFromUrl.current = true;
      autoSelectedThread.current = true;
      setSelectedThread(null);
      setThreadDetails(null);
      writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, null);
      setChatRailExpanded(true);
      window.localStorage.setItem(chatRailPreferenceKey, "true");
      setMobileTab("hermes");
      setNotice("Pick a chat from the list.");
      window.requestAnimationFrame(() => {
        document.getElementById("hermes-thread-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    function syncMobileTab() {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path.includes("/dashboard/lessons")) {
        setMobileTab("lessons");
        return;
      }
      if (hash === "#leash-control" || hash === "#execution-safety") {
        setMobileTab("leash");
        return;
      }
      if (hash === "#web-settings") {
        setMobileTab("settings");
        return;
      }
      if (hash === "#chats") {
        setMobileTab("hermes");
        // Allow re-opening the list if the user navigates away and back via hash.
        openedChatsListFromUrl.current = false;
        openChatsListFromHash();
        return;
      }
      setMobileTab("hermes");
    }
    syncMobileTab();
    window.addEventListener("hashchange", syncMobileTab);
    window.addEventListener("popstate", syncMobileTab);
    return () => {
      window.removeEventListener("hashchange", syncMobileTab);
      window.removeEventListener("popstate", syncMobileTab);
    };
  }, []);

  useEffect(() => {
    const storedPreference = window.localStorage.getItem(chatRailPreferenceKey);
    // #chats always expands the rail so the thread list is visible on mobile.
    const shouldExpand = window.location.hash === "#chats"
      ? true
      : storedPreference === null
        ? !window.matchMedia("(max-width: 700px)").matches
        : storedPreference === "true";
    const storedWidth = Number(window.localStorage.getItem(sidebarWidthPreferenceKey));
    const storedSort = window.localStorage.getItem(threadSortPreferenceKey) as ThreadSortOrder | null;
    const timer = window.setTimeout(() => {
      setChatRailExpanded(shouldExpand);
      if (Number.isFinite(storedWidth) && storedWidth > 0) setSidebarWidth(clampSidebarWidth(storedWidth));
      if (storedSort === "newest" || storedSort === "oldest" || storedSort === "alphabetical") setThreadSortOrder(storedSort);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!chatRailExpanded) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    setResizing(true);
    function onMove(moveEvent: PointerEvent) {
      setSidebarWidth(clampSidebarWidth(startWidth + (moveEvent.clientX - startX)));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizing(false);
      setSidebarWidth((width) => {
        window.localStorage.setItem(sidebarWidthPreferenceKey, String(width));
        return width;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [chatRailExpanded, sidebarWidth]);

  function changeThreadSort(order: ThreadSortOrder) {
    setThreadSortOrder(order);
    window.localStorage.setItem(threadSortPreferenceKey, order);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(DASHBOARD_CACHE_KEYS.devices);
        window.localStorage.removeItem(preferredDevicePreferenceKey);
      } catch {}
    }
    const pendingCode = new URLSearchParams(window.location.search).get("pair")?.toUpperCase() ?? "";
    if (!pairingCodePattern.test(pendingCode)) return;
    const timer = window.setTimeout(() => setPairCode(pendingCode), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadWorkspace = useCallback(async () => {
    const me = await fetch("/api/me", { cache: "no-store" });
    if (me.status === 401) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);
      return;
    }
    const identity = await me.json() as {
      authenticated?: boolean;
      user?: User;
      organization?: Organization;
      continuityUsage?: ContinuityUsage;
      hostedRunner?: HostedResourceView;
      hostedModel?: HostedResourceView;
    };
    // /api/me is 200 + authenticated:false (not 401) when the cookie is missing.
    // Do not stay on "Opening the control plane…" forever.
    if (identity.authenticated === false) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (!identity.user || !identity.organization) {
      setLoadState("error");
      return;
    }
    setUser(identity.user);
    setOrganization(identity.organization);
    if (identity.continuityUsage) setContinuityUsage(identity.continuityUsage);
    if (identity.hostedRunner) setHostedRunner(identity.hostedRunner);
    if (identity.hostedModel) setHostedModel(identity.hostedModel);
    writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.me, {
      user: identity.user,
      organization: identity.organization,
      cachedAt: Date.now(),
    } satisfies CachedIdentity<User, Organization>);

    const [deviceResponse, threadResponse, taskResponse] = await Promise.all([
      fetch("/api/devices", { cache: "no-store" }),
      fetch("/api/threads", { cache: "no-store" }),
      fetch("/api/tasks", { cache: "no-store" }),
    ]);
    if (deviceResponse.ok) {
      const nextDevices = (await deviceResponse.json() as { devices: Device[] }).devices;
      setDevices(nextDevices);
      writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.devices, nextDevices);
    }
    let activeSelected = selectedThreadRef.current;
    if (threadResponse.ok) {
      const nextThreads = sortThreadsNewestFirst((await threadResponse.json() as { threads: Thread[] }).threads);
      setThreads(nextThreads);
      writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.threads, nextThreads);
      const preferChatsList =
        typeof window !== "undefined" && window.location.hash === "#chats";
      if (preferChatsList) {
        // Stay on the chat list (no auto-open of newest / sticky cron thread).
        autoSelectedThread.current = true;
        if (activeSelected) {
          activeSelected = null;
          setSelectedThread(null);
          setThreadDetails(null);
          writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, null);
        }
      } else if (activeSelected && !nextThreads.some((t) => t.id === activeSelected)) {
        // Auto-heal stale selection: if cached thread ID was deleted or not found in nextThreads.
        // BUT: if there are pending optimistic tasks for this thread (just-sent
        // message still propagating server-side), preserve the selection and
        // threadDetails — nuking them makes the sent message vanish
        // (2026-08-20 user report: "don't see the message i inputted").
        if (hasPendingConversationTasks(pendingConversationTasksRef.current)) {
          // Thread likely just created — give it one more refresh cycle to appear.
          // Keep current selection + threadDetails so the optimistic bubble survives.
          void prefetchThreadDetails(activeSelected, { force: true });
        } else {
          autoSelectedThread.current = true;
          const fallbackId = nextThreads.length ? nextThreads[0].id : null;
          activeSelected = fallbackId;
          setSelectedThread(fallbackId);
          setThreadDetails(null);
          writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, fallbackId);
        }
      } else if (!autoSelectedThread.current && !activeSelected && nextThreads.length) {
        autoSelectedThread.current = true;
        activeSelected = nextThreads[0].id;
        setSelectedThread(nextThreads[0].id);
        writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, nextThreads[0].id);
      }
      const preheatIds = selectPreheatThreadIds(nextThreads, activeSelected);
      for (const id of preheatIds) void prefetchThreadDetails(id);
    }
    if (taskResponse.ok) {
      const nextTasks = (await taskResponse.json() as { tasks: Task[] }).tasks;
      // Merge in optimistic tasks not yet confirmed by the server so the
      // just-sent task row doesn't vanish from the list while loadWorkspace
      // races with the optimistic render (2026-08-20 user report).
      const mergedTasks = mergeTasksForTaskList(
        nextTasks,
        pendingConversationTasksRef.current,
        activeSelected ?? "",
      );
      setTasks(mergedTasks);
      writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.tasks, nextTasks);
      if (!focusedTaskFromUrl.current && typeof window !== "undefined") {
        const focusTaskId = new URLSearchParams(window.location.search).get("task");
        const focusThreadId = new URLSearchParams(window.location.search).get("thread");
        if (focusTaskId || focusThreadId) {
          focusedTaskFromUrl.current = true;
          const focusTask = focusTaskId ? nextTasks.find((task) => task.id === focusTaskId) : undefined;
          const threadId = focusTask?.threadId ?? focusThreadId;
          if (threadId) {
            autoSelectedThread.current = true;
            setSelectedThread(threadId);
            writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, threadId);
            const cached = readCachedThreadDetails(threadId);
            if (cached) setThreadDetails(cached);
          }
          window.setTimeout(() => {
            const el = focusTaskId
              ? document.getElementById(`task-${focusTaskId}`)
              : document.getElementById("task-activity");
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 120);
        }
      }
      const taskIds = nextTasks.filter((task) => task.result && task.status === "completed").map((task) => task.id);
      if (taskIds.length) {
        const feedbackResponse = await fetch(`/api/feedback?task_ids=${encodeURIComponent(taskIds.join(","))}`, { cache: "no-store" });
        if (feedbackResponse.ok) {
          const rows = (await feedbackResponse.json() as { feedback: Feedback[] }).feedback;
          setFeedback(Object.fromEntries(rows.map((row) => [row.taskId, row])));
        }
      } else setFeedback({});
    }
    setLoadState("loaded");
  }, [prefetchThreadDetails, readCachedThreadDetails]);

  // Async SWR only — no synchronous setState (eslint react-hooks/set-state-in-effect).
  const revalidateSelectedThread = useCallback(async (threadId: string) => {
    await prefetchThreadDetails(threadId, { force: true });
    const next = threadCacheRef.current.get(threadId);
    if (next && selectedThreadRef.current === threadId) setThreadDetails(next);
  }, [prefetchThreadDetails]);


  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const requestWorkspaceRefresh = useCallback(async () => {
    // One user click / one scheduled retry = one fetch. Never an interval.
    // Visible feedback + a freshness stamp so the click is never a no-op to the
    // user: the dashboard does not auto-poll (Workers quota), so this is the only
    // in-page way to pull fresh data.
    setIsRefreshing(true);
    setLoadState((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      await loadWorkspace();
      setLastRefreshedAt(Date.now());
    } catch {
      setLoadState("error");
    } finally {
      setIsRefreshing(false);
    }
  }, [loadWorkspace]);
  const errorRetryUsedRef = useRef(false);

  useEffect(() => {
    // One-shot workspace load. Recurring poll is OFF by default — the old
    // 5s/15s setInterval burned the Cloudflare Workers 100k free cap
    // (~17k requests/day per open tab; 2026-08-19 quota incident).
    // Opt-in only: ?poll=1 plus cursor/offset, or NEXT_PUBLIC_DASHBOARD_POLL=1
    // (not the default). Minimum 15 minutes; poll-without-cursor fails closed.
    const initial = window.setTimeout(requestWorkspaceRefresh, 0);
    const params = new URLSearchParams(window.location.search);
    const refresh = startDashboardRefresh({
      run: requestWorkspaceRefresh,
      search: window.location.search,
      envPoll: process.env.NEXT_PUBLIC_DASHBOARD_POLL,
      cursor: params.get("cursor") ?? params.get("offset"),
    });
    return () => {
      window.clearTimeout(initial);
      refresh.stop();
    };
    // Intentionally not re-binding when selectedThread flips — one loader, not one-per-thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shell-first: one loader, not one-per-thread
  }, []);

  // One delayed retry after an initial-load error, then stop. Not a loop.
  useEffect(() => {
    if (loadState !== "error" || errorRetryUsedRef.current) return;
    errorRetryUsedRef.current = true;
    const retry = scheduleOneShotErrorRetry({ run: requestWorkspaceRefresh });
    return () => retry.stop();
  }, [loadState, requestWorkspaceRefresh]);

  // Persist selection + background revalidate. Instant paint is in openThread / deep-link handlers.
  useEffect(() => {
    if (!selectedThread) return;
    writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, selectedThread);
    let cancelled = false;
    void (async () => {
      await revalidateSelectedThread(selectedThread);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedThread, revalidateSelectedThread]);

  useEffect(() => {
    if (loadState !== "loaded" || !selectedThread || !threadDetails) return;
    if (restoredThreadBottomRef.current === selectedThread) return;
    restoredThreadBottomRef.current = selectedThread;
    const raf = window.requestAnimationFrame(() => {
      scrollConversationHistoryToLatest(document, "auto");
    });
    return () => window.cancelAnimationFrame(raf);
  }, [loadState, selectedThread, threadDetails]);
  useEffect(() => {
    if (!user || !pairingCodePattern.test(pairCode)) return;
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("pair")?.toUpperCase() !== pairCode) return;
    currentUrl.searchParams.delete("pair");
    window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    // Hosted Hermes does not pair a laptop. Strip leftover ?pair= with no toast.
    return;
  }, [pairCode, user]);
  const visibleThreads = useMemo(() => orderThreadsForDisplay(threads, threadSortOrder), [threads, threadSortOrder]);
  const runnerStatus: HostedResourceState = hostedRunner?.status ?? "waiting";
  const modelStatus: HostedResourceState = hostedModel?.status ?? "waiting";
  const hostedCopy = hostedConnectionCopy({
    runnerStatus,
    modelStatus,
    runnerIdentity: hostedRunner?.identity,
    message: hostedModel?.status === "unhealthy"
      ? hostedModel.message
      : hostedRunner?.status === "unhealthy"
        ? hostedRunner.message
        : null,
  });
  const activeTasks = useMemo(() => tasks.filter((task) => !terminal.has(task.status)), [tasks]);
  const hasProgressingTasks = tasks.some((task) => autonomouslyProgressing.has(task.status));
  const hasProgressingTasksRef = useRef(hasProgressingTasks);
  useEffect(() => {
    hasProgressingTasksRef.current = hasProgressingTasks;
  }, [hasProgressingTasks]);
  const refreshActiveWork = useCallback(async () => {
    await refreshWorkspaceOnce();
    const activeThreadId = selectedThreadRef.current;
    if (activeThreadId) await revalidateSelectedThread(activeThreadId);
  }, [refreshWorkspaceOnce, revalidateSelectedThread]);
  useEffect(() => {
    const refresh = startActiveTaskRefresh({
      run: refreshActiveWork,
      isActive: () => hasProgressingTasksRef.current,
    });
    return () => refresh.stop();
  }, [hasProgressingTasks, refreshActiveWork]);
  const visibleTasks = useMemo(() => {
    let filtered: Task[];
    if (taskFilter === "completed") {
      filtered = tasks.filter((task) => task.status === "completed" && Boolean(task.result));
    } else if (taskFilter === "unrated") {
      filtered = tasks.filter(
        (task) => task.status === "completed" && Boolean(task.result) && !feedback[task.id],
      );
    } else {
      filtered = selectedThread ? tasks.filter((task) => task.threadId === selectedThread) : tasks;
    }
    return orderTasksChronologically(filtered);
  }, [tasks, selectedThread, taskFilter, feedback]);
  const onlineDevices = devices.filter((device) => device.online);
  const p95CompletionLatency = useMemo(() => {
    const durations = tasks
      .filter((task) => task.status === "completed" && task.completedAt)
      .map((task) => (task.completedAt as number) - task.createdAt)
      .sort((left, right) => left - right);
    if (!durations.length) return null;
    return durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)];
  }, [tasks]);
  const accountPlan = organization?.cloudAccess ? organization.plan : "free";

  async function pair(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    const response = await fetch("/api/pairing/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userCode: pairCode }) });
    const body = await response.json() as { device?: Device; error?: string };
    setNotice(response.ok && body.device ? `${body.device.name} paired. Recent Hermes chats are syncing now.` : body.error ?? "Pairing failed");
    if (response.ok) { setPairCode(""); await loadWorkspace(); }
    setBusy(false);
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget instanceof HTMLFormElement
      ? event.currentTarget
      : composerFormRef.current;
    const liveValue = form?.querySelector("textarea") instanceof HTMLTextAreaElement
      ? form.querySelector("textarea")!.value
      : prompt;
    const text = liveValue.trim();
    if (!text) {
      setNotice("Type a message first, then tap Run.");
      return;
    }
    const hasCloud = Boolean(organization?.cloudAccess);
    if (!hasCloud) {
      setNotice("A trial or Pro plan is required to run on the hosted VPS. Open Manage plan.");
      return;
    }
    if (continuityUsage?.exhausted) {
      setNotice(
        continuityUsage.upgradeHint
          ?? "Hosted VPS capacity exhausted for this 30-day window. Upgrade to continue.",
      );
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          threadId: selectedThread,
          deviceId: selectedDeviceId || undefined,
          idempotencyKey: crypto.randomUUID(),
          traceId: crypto.randomUUID(),
          routePreference: "cloud",
        }),
      });
      let body: {
        task?: { id?: string; route: string; threadId: string; status?: string; prompt?: string; createdAt?: number; preference?: string; deviceId?: string; traceId?: string };
        error?: string;
        code?: string;
        limit?: number | null;
        observed?: number | null;
        remaining?: number | null;
        traceId?: string;
      } = {};
      try {
        body = await response.json() as typeof body;
      } catch {
        setNotice(`Could not start task (HTTP ${response.status}). Try again.`);
        return;
      }
      if (response.ok && body.task) {
        const created = body.task;
        const now = Date.now();
        const optimistic: Task = {
          id: created.id ?? `pending-${now}`,
          threadId: created.threadId,
          threadTitle: text.replace(/\s+/g, " ").slice(0, 72),
          prompt: created.prompt ?? text,
          status: created.status ?? "pending",
          route: created.route ?? "cloud",
          result: null,
          error: null,
          createdAt: created.createdAt ?? now,
          updatedAt: created.createdAt ?? now,
          completedAt: null,
          deviceName: null,
        };
        setTasks((prev) => [optimistic, ...prev.filter((task) => task.id !== optimistic.id)]);
        const conversationTask: ConversationTask = {
          id: optimistic.id,
          prompt: optimistic.prompt,
          result: null,
          error: null,
          route: optimistic.route,
          status: optimistic.status,
          createdAt: optimistic.createdAt,
        };
        pendingConversationTasksRef.current = [
          ...pendingConversationTasksRef.current.filter((task) => task.id !== conversationTask.id),
          conversationTask,
        ];
        setThreadDetails((prev) => ({
          syncedAt: prev?.syncedAt ?? null,
          snapshot: prev?.snapshot ?? [],
          tasks: mergeConversationTasks(prev?.tasks ?? [], pendingConversationTasksRef.current),
        }));
        const macName =
          devices.find((device) => device.id === (created.deviceId ?? selectedDeviceId))?.name
          ?? selectedDeviceLabel;
        setNotice(
          created.route === "cloud"
            ? "Sent — running on the hosted VPS."
            : `Sent — running on ${macName}.`,
        );
        setPrompt("");
        setSelectedThread(created.threadId);
        // Persist-before-live already wrote the row. Do not block the card on /api/me.
        void loadWorkspace();
        // Newest tasks render at the TOP of the list while the composer sits at the
        // bottom — scrolling to the OUTPUT strip left the just-sent message off-screen
        // and users read that as "my message vanished" (2026-08-19 report). Scroll to
        // the new task's own row so the send is visibly confirmed.
        window.requestAnimationFrame(() => {
          // Chat bubbles live in conversation-history (separate from the task card
          // list). Scroll both so Enter never looks like a silent no-op.
          scrollConversationHistoryToLatest(document);
          const target =
            document.getElementById(`task-${optimistic.id}`)
            ?? document.getElementById("task-activity")
            ?? document.getElementById("run-output");
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } else {
        if (body.code === "cloud_task_limit" || body.code === "cloud_entitlement_required") {
          const rem = typeof body.remaining === "number" ? body.remaining : null;
          const lim = typeof body.limit === "number" ? body.limit : null;
          const capacityNote =
            lim != null
              ? ` Capacity ${Math.max(0, (lim ?? 0) - (rem ?? 0))}/${lim} used.`
              : "";
          setNotice(`${body.error ?? "Hosted VPS capacity denied."}${capacityNote}`);
          // Refresh meter so remaining capacity matches the enforcer.
          try {
            const me = await fetch("/api/me", { credentials: "include", cache: "no-store" });
            if (me.ok) {
              const identity = await me.json() as { continuityUsage?: ContinuityUsage };
              if (identity.continuityUsage) setContinuityUsage(identity.continuityUsage);
            }
          } catch {
            /* ignore meter refresh failure */
          }
        } else {
          setNotice(body.error ?? "Task routing failed");
          // persist-before-live may have written the row before a 409 ack.
          void loadWorkspace();
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Network error — task not sent.");
    } finally {
      setBusy(false);
    }
  }

  async function updateFailover(deviceId: string, failoverMode: Device["failoverMode"]) {
    const response = await fetch("/api/devices", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, failoverMode }) });
    const body = await response.json() as { error?: string }; setNotice(response.ok ? `Failover policy set to ${failoverMode}.` : body.error ?? "Update failed"); await loadWorkspace();
  }

  async function revokeDevice(device: Device) {
    if (!window.confirm(`Remove ${device.name} from this workspace? The always-on connector on that machine will stop being authorized until you pair again.`)) return;
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/devices", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: device.id }),
    });
    const body = await response.json() as { error?: string };
    setNotice(response.ok ? `${device.name} removed.` : body.error ?? "Could not remove machine");
    if (response.ok) await loadWorkspace();
    setBusy(false);
  }

  async function failover(taskId: string) {
    const response = await fetch("/api/tasks/failover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId }) });
    const body = await response.json() as { error?: string }; setNotice(response.ok ? "Cloud failover approved." : body.error ?? "Failover failed"); await loadWorkspace();
  }

  async function subscribe() {
    setBusy(true);
    const response = await fetch("/api/billing/checkout", { method: "POST" });
    const body = await response.json() as { url?: string; error?: string };
    if (response.ok && body.url) window.location.href = body.url; else setNotice(body.error ?? "Checkout is unavailable");
    setBusy(false);
  }

  async function manageBilling() {
    setBusy(true);
    const response = await fetch("/api/billing/portal", { method: "POST" });
    const body = await response.json() as { url?: string; error?: string };
    if (response.ok && body.url) window.location.href = body.url; else setNotice(body.error ?? "Billing management is unavailable");
    setBusy(false);
  }

  async function copyInstaller() {
    try {
      await navigator.clipboard.writeText(connectorInstallCommand);
      setInstallCopied(true);
      setNotice("One-line installer copied. Paste it into Terminal once; ThumbGate opens the approval page automatically.");
    } catch {
      setNotice("Clipboard access is unavailable. Select the one-line installer command and copy it.");
    }
  }

  async function saveFeedback(taskId: string, signal: Feedback["signal"], note: string | null = null) {
    const current = feedback[taskId];
    setFeedbackBusyTask(taskId);
    setNotice(null);
    try {
      if (current?.signal === signal && signal === "up") {
        const response = await fetch("/api/feedback", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId }) });
        if (!response.ok) throw new Error("Could not remove feedback");
        setFeedback((all) => { const next = { ...all }; delete next[taskId]; return next; });
        setNotice("Feedback removed.");
        return;
      }
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId, signal, note }) });
      const body = await response.json().catch(() => ({})) as { feedback?: Feedback; error?: string };
      if (!response.ok || !body.feedback) throw new Error(body.error ?? "Could not save feedback");
      setFeedback((all) => ({ ...all, [taskId]: body.feedback as Feedback }));
      setFeedbackDialog(null);
      setNotice(signal === "up" ? "Marked helpful. This lesson is now in ThumbGate." : "Marked for improvement. Your note is now in ThumbGate lessons.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save feedback");
    } finally {
      setFeedbackBusyTask(null);
    }
  }

  function chooseFeedback(taskId: string, signal: Feedback["signal"]) {
    if (feedbackBusyTask === taskId) return;
    if (signal === "down") {
      const current = feedback[taskId];
      if (current?.signal === "down") {
        setFeedbackBusyTask(taskId);
        void fetch("/api/feedback", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId }) })
          .then((response) => {
            if (!response.ok) throw new Error("Could not remove feedback");
            setFeedback((all) => { const next = { ...all }; delete next[taskId]; return next; });
            setNotice("Feedback removed.");
          })
          .catch((error: Error) => setNotice(error.message))
          .finally(() => setFeedbackBusyTask(null));
      } else setFeedbackDialog({ taskId, note: current?.note ?? "" });
      return;
    }
    void saveFeedback(taskId, signal);
  }

  function feedbackControls(taskId: string) {
    const current = feedback[taskId]?.signal;
    return <div className="response-feedback" aria-label="Rate this Hermes response">
      <span>Useful?</span>
      <button type="button" className={current === "up" ? "is-selected" : ""} aria-pressed={current === "up"} aria-label="Thumbs up — mark response helpful" disabled={feedbackBusyTask === taskId} onClick={() => chooseFeedback(taskId, "up")}>👍</button>
      <button type="button" className={current === "down" ? "is-selected" : ""} aria-pressed={current === "down"} aria-label="Thumbs down — mark response for improvement" disabled={feedbackBusyTask === taskId} onClick={() => chooseFeedback(taskId, "down")}>👎</button>
      {current && <a href="/dashboard/lessons">View lesson →</a>}
    </div>;
  }

  function toggleChatRail() {
    setChatRailExpanded((current) => {
      const next = !current;
      window.localStorage.setItem(chatRailPreferenceKey, String(next));
      return next;
    });
  }

  function placeThreadMenu(threadId: string, trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 168;
    const menuHeight = 112;
    const gutter = 8;
    let left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - gutter);
    left = Math.max(gutter, left);
    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight - gutter) {
      top = Math.max(gutter, rect.top - menuHeight - 4);
    }
    setThreadMenu({ id: threadId, top, left });
  }

  function toggleThreadMenu(threadId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (threadMenu?.id === threadId) {
      setThreadMenu(null);
      return;
    }
    placeThreadMenu(threadId, event.currentTarget);
  }


  function openRenameDialog(thread: Thread) {
    setThreadMenu(null);
    setRenameValue(thread.title);
    setChatDialog({ kind: "rename", thread });
  }

  function openDeleteDialog(thread: Thread) {
    setThreadMenu(null);
    setChatDialog({ kind: "delete", thread });
  }

  async function submitChatDialog(event?: FormEvent) {
    event?.preventDefault();
    if (!chatDialog || chatOperationBusy) return;
    setChatOperationBusy(true);
    setNotice(null);
    try {
      if (chatDialog.kind === "rename") {
        const title = renameValue.trim();
        if (!title || title === chatDialog.thread.title) { setChatDialog(null); return; }
        const response = await fetch("/api/threads", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: chatDialog.thread.id, title }),
        });
        const body = await response.json().catch(() => ({})) as { error?: string; title?: string };
        if (!response.ok) { setNotice(body.error ?? "Rename failed"); return; }
        setThreads((current) => current.map((thread) => thread.id === chatDialog.thread.id
          ? { ...thread, title: body.title ?? title }
          : thread));
        setNotice("Chat renamed on ThumbGate and queued for your paired Hermes machine.");
      } else if (chatDialog.kind === "delete") {
        const response = await fetch("/api/threads", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: chatDialog.thread.id }),
        });
        const body = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) { setNotice(body.error ?? "Delete failed"); return; }
        const remaining = threads.filter((thread) => thread.id !== chatDialog.thread.id);
        setThreads(remaining);
        writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.threads, remaining);
        if (selectedThread === chatDialog.thread.id) {
          const nextId = remaining[0]?.id ?? null;
          setSelectedThread(nextId);
          if (!nextId) setThreadDetails(null);
          else {
            const cached = readCachedThreadDetails(nextId);
            if (cached) setThreadDetails(cached);
          }
        }
        setNotice("Chat deleted. The paired Hermes machine will apply the deletion safely.");
      } else {
        const response = await fetch("/api/threads", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope: "all", confirmation: "CLEAR ALL CHATS" }),
        });
        const body = await response.json().catch(() => ({})) as { error?: string; cleared?: number };
        if (!response.ok) { setNotice(body.error ?? "Clear failed"); return; }
        setThreads([]);
        writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.threads, []);
        setSelectedThread(null);
        setThreadDetails(null);
        // After clear, land on the composer — not an expanded empty chats rail.
        if (window.matchMedia("(max-width: 700px)").matches) {
          setChatRailExpanded(false);
          window.localStorage.setItem(chatRailPreferenceKey, "false");
          setMobileTab("hermes");
        }
        setNotice(`${body.cleared ?? threads.length} chats cleared. Type a task below to start again.`);
        window.requestAnimationFrame(() => focusComposer());
      }
      setChatDialog(null);
      await loadWorkspace();
    } finally {
      setChatOperationBusy(false);
    }
  }

  function openThread(threadId: string | null) {
    setThreadMenu(null);
    setSelectedThread(threadId);
    // Leaving the #chats list view for a concrete thread (or workspace home).
    if (typeof window !== "undefined" && window.location.hash === "#chats") {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      openedChatsListFromUrl.current = false;
    }
    if (threadId) {
      const cached = readCachedThreadDetails(threadId);
      if (cached) setThreadDetails(cached);
      void prefetchThreadDetails(threadId, { force: false });
      writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, threadId);
    } else {
      setThreadDetails(null);
      writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.selectedThread, null);
    }
    if (window.matchMedia("(max-width: 700px)").matches) {
      // Always collapse the chats rail when entering a thread OR workspace home.
      // Expanding was freezing the viewport under the old 100dvh lock and buried
      // the composer ("Continue the work does nothing" / unscollable phone 2026-08-17).
      // Users open chats via the Chats toggle or #chats deep link only.
      setChatRailExpanded(false);
      window.localStorage.setItem(chatRailPreferenceKey, "false");
      setMobileTab("hermes");
      if (!threadId) {
        window.requestAnimationFrame(() => focusComposer());
      }
    }
  }

  // Never hide #hermes-thread-list behind the identity fetch. E2E and a real
  // phone both need the list locator visible (empty state still has the id).
  if (!user || !organization) {
    return (
      <main className="dashboard-shell" data-workspace-hydrated="0">
        <aside className="sidebar" aria-label="Hermes navigation">
          <div className="sidebar-header">
            <a href="/dashboard" className="brand" aria-label="ThumbGate dashboard"><Mark /><span>ThumbGate <small>Hermes Web</small></span></a>
          </div>
          <div className="sidebar-content" id="hermes-chat-rail">
            <div className="workspace-label">CHATS</div>
            <nav className="thread-list" id="hermes-thread-list" data-testid="hermes-thread-list" aria-label="Chats">
              <div className="thread-list-empty" data-testid="thread-list-empty">Opening chats…</div>
            </nav>
          </div>
        </aside>
        <section className="dashboard-main">
          <p>Opening the control plane…</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`dashboard-shell${chatRailExpanded ? "" : " chat-rail-collapsed"}`}
      data-mobile-tab={mobileTab} data-workspace-hydrated={workspaceHydrated ? "1" : "0"}
      style={chatRailExpanded ? { "--sidebar-width": `${sidebarWidth}px` } as CSSProperties : undefined}
    >
      <aside className={`sidebar${chatRailExpanded ? "" : " is-collapsed"}`} aria-label="Hermes navigation">
        <div className="sidebar-header">
          <a href="/dashboard" className="brand" aria-label="ThumbGate dashboard"><Mark /><span>ThumbGate <small>Hermes Web</small></span></a>
          <button type="button" className="sidebar-toggle" aria-expanded={chatRailExpanded} aria-controls="hermes-chat-rail" aria-label={chatRailExpanded ? "Collapse chat sidebar" : "Expand chat sidebar"} onClick={toggleChatRail}><span aria-hidden="true">{chatRailExpanded ? "‹" : "›"}</span></button>
        </div>
        <div className="sidebar-content" id="hermes-chat-rail">
          <div className="workspace-label">NAVIGATION</div>
          <button className={!selectedThread ? "side-item active" : "side-item"} onClick={() => openThread(null)}><span>H</span><span className="side-item-label">Hermes</span><em>{activeTasks.length}</em></button>
          <a className="side-item" href="/dashboard/lessons"><span>👍</span><span className="side-item-label">ThumbGate lessons</span><em>{Object.keys(feedback).length}</em></a>
          <div className="workspace-label chats-label-row">
            <span>CHATS</span>
            <div className="chats-label-actions">
              <select className="thread-sort-select" aria-label="Sort chats" value={threadSortOrder} onChange={(event) => changeThreadSort(event.target.value as ThreadSortOrder)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="alphabetical">Alphabetical</option>
              </select>
              {threads.length > 0 && <button type="button" className="clear-all-chats" onClick={() => { setThreadMenu(null); setChatDialog({ kind: "clear" }); }}>Clear all</button>}
            </div>
          </div>
          <nav className="thread-list" id="hermes-thread-list" data-testid="hermes-thread-list" aria-label={`Chats, ${threadSortOrder} order`}>{visibleThreads.length === 0 ? (
            <div className="thread-list-empty" data-testid="thread-list-empty">{loadState === "loading" ? "Opening chats…" : "No chats yet"}</div>
          ) : visibleThreads.map((thread) => (
            <div key={thread.id} className="thread-row">
              <button title={`${thread.title} — ${formatDateTime(thread.updatedAt)}`} aria-current={selectedThread === thread.id ? "page" : undefined} className={selectedThread === thread.id ? "side-item thread-item active" : "side-item thread-item"} onClick={() => openThread(thread.id)} onPointerEnter={() => void prefetchThreadDetails(thread.id)} onFocus={() => void prefetchThreadDetails(thread.id)}><span className="thread-icon">{thread.sourceSessionId ? "⌘" : "›_"}</span><span className="thread-copy"><strong>{thread.title}</strong><time dateTime={new Date(thread.updatedAt).toISOString()}>{formatDateTime(thread.updatedAt)}</time></span><em>{thread.messageCount || thread.taskCount}</em></button>
              <button type="button" className="thread-menu-trigger" aria-label={`Actions for ${thread.title}`} aria-haspopup="menu" aria-expanded={threadMenu?.id === thread.id} onClick={(event) => toggleThreadMenu(thread.id, event)}>•••</button>
              {threadMenu?.id === thread.id && typeof document !== "undefined" && createPortal(
                <div ref={threadMenuRef} className="thread-actions" role="menu" data-testid="thread-actions-menu" aria-label={`Actions for ${thread.title}`} style={{ top: threadMenu.top, left: threadMenu.left }}>
                  <button type="button" className="thread-action" role="menuitem" onClick={() => openRenameDialog(thread)}><span aria-hidden="true">✎</span> Rename</button>
                  <button type="button" className="thread-action thread-action-danger" role="menuitem" onClick={() => openDeleteDialog(thread)}><span aria-hidden="true">⌫</span> Delete</button>
                </div>,
                document.body,
              )}
            </div>
          ))}</nav>
          <div className="sidebar-bottom"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><strong>{user.name}</strong><small>{accountPlan} plan</small></div><SignOutForm buttonClassName="sign-out-button" data-testid="dashboard-sign-out" /></div>
        </div>
        {chatRailExpanded && <div
          className={resizing ? "sidebar-resize-handle is-resizing" : "sidebar-resize-handle"}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat sidebar"
          onPointerDown={startSidebarResize}
        />}
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-title">
            <div className="mobile-header-row">
              <div className="mobile-header-actions">
                <button
                  type="button"
                  className="mobile-chats-toggle button button-small button-secondary"
                  onClick={toggleChatRail}
                  aria-label="Toggle chat threads menu"
                  data-testid="mobile-chats-toggle"
                >
                  💬 {chatRailExpanded ? "Hide Chats" : "Chats"}
                </button>
                {threads.length > 0 ? (
                  <button
                    type="button"
                    className="button button-small button-secondary mobile-clear-all"
                    data-testid="mobile-clear-all"
                    onClick={() => {
                      setThreadMenu(null);
                      setChatDialog({ kind: "clear" });
                    }}
                    aria-label="Clear all chats"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              <p className="eyebrow">HERMES WEB</p>
            </div>
            <div className="thread-title-heading-row" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h1 title={selectedThread ? threads.find((thread) => thread.id === selectedThread)?.title ?? "Your Hermes workspace" : "Your Hermes workspace"}>
                {selectedThread ? threads.find((thread) => thread.id === selectedThread)?.title : "Your Hermes workspace"}
              </h1>
              {selectedThread && (() => {
                const activeThread = threads.find((t) => t.id === selectedThread);
                return activeThread ? (
                  <button
                    type="button"
                    className="button button-small button-secondary thread-rename-trigger"
                    title="Rename chat thread"
                    aria-label={`Rename chat thread ${activeThread.title}`}
                    style={{ padding: "2px 7px", fontSize: "11px", borderRadius: "5px", display: "inline-flex", alignItems: "center", gap: "3px" }}
                    onClick={() => openRenameDialog(activeThread)}
                  >
                    ✎ Rename
                  </button>
                ) : null;
              })()}
            </div>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="button button-small button-secondary"
              data-testid="dashboard-refresh"
              onClick={() => void requestWorkspaceRefresh()}
              disabled={busy || isRefreshing || loadState === "loading"}
              title="Fetch the latest chats, tasks, and runner status now. This dashboard does not auto-refresh (to stay within free usage limits), so use this to pull the newest data."
            >
              {isRefreshing ? "↻ Refreshing…" : loadState === "error" ? "Retry" : "↻ Refresh"}
            </button>
            {lastRefreshedAt !== null && (
              <span
                className="refresh-timestamp"
                data-testid="dashboard-refresh-timestamp"
                aria-live="polite"
                style={{ fontSize: "11px", opacity: 0.7, whiteSpace: "nowrap" }}
              >
                {isRefreshing
                  ? "Updating…"
                  : `Updated ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(lastRefreshedAt))}`}
              </span>
            )}
            <span className="status-chip online"><i /> ThumbGate online</span>
            <button className="button button-small button-secondary" onClick={() => void (["pro", "team"].includes(organization.plan) ? manageBilling() : subscribe())} disabled={busy}>
              {["pro", "team"].includes(organization.plan) ? "Manage plan" : organization.cloudAccess ? "Keep cloud after trial" : "Add cloud failover"}
            </button>
            <SignOutForm buttonClassName="button button-small button-secondary sign-out-button" data-testid="dashboard-header-sign-out" />
          </div>
        </header>
        {notice && (
          <div className="notice notice-toast" role="status" aria-live="polite">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {continuityUsage && (
          <section
            className={`continuity-usage-meter${continuityUsage.exhausted ? " is-exhausted" : ""}`}
            data-testid="continuity-usage-meter"
            data-exhausted={continuityUsage.exhausted ? "true" : "false"}
            aria-label="Hosted VPS capacity remaining"
          >
            <div className="continuity-usage-meter-copy">
              <p className="eyebrow">Hosted VPS capacity · {continuityUsage.purchaseMode ?? continuityUsage.plan}</p>
              <strong>
                {continuityUsage.cloudTasks30d}/{continuityUsage.cloudTaskLimit} VPS runs used
                {continuityUsage.exhausted ? " · exhausted" : ""}
              </strong>
              <small>
                {continuityUsage.cloudTasksRemaining} remaining · plan {continuityUsage.plan} ·{" "}
                {continuityUsage.windowDays}d window · {continuityUsage.activeTasks}/
                {continuityUsage.maxActiveTasks} active
                {typeof continuityUsage.percentUsed === "number" ? ` · ${continuityUsage.percentUsed}%` : ""}
              </small>
              {continuityUsage.upgradeHint ? (
                <p className="continuity-usage-hint" data-testid="continuity-upgrade-hint">
                  {continuityUsage.upgradeHint}{" "}
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={() => void (["pro", "team"].includes(organization?.plan ?? "") ? manageBilling() : subscribe())}
                    disabled={busy}
                  >
                    {["pro", "team"].includes(organization?.plan ?? "") ? "Manage plan" : "Upgrade plan"}
                  </button>
                </p>
              ) : null}
            </div>
            <div
              className="continuity-usage-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, continuityUsage.cloudTaskLimit)}
              aria-valuenow={Math.min(continuityUsage.cloudTasks30d, Math.max(1, continuityUsage.cloudTaskLimit))}
              aria-label={`${continuityUsage.cloudTasks30d} of ${continuityUsage.cloudTaskLimit} hosted VPS runs used`}
            >
              <i
                style={{
                  width: `${typeof continuityUsage.percentUsed === "number"
                    ? continuityUsage.percentUsed
                    : continuityUsage.cloudTaskLimit > 0
                      ? Math.min(100, Math.round((continuityUsage.cloudTasks30d / continuityUsage.cloudTaskLimit) * 100))
                      : 0}%`,
                }}
              />
            </div>
          </section>
        )}

        <nav className="metric-grid metric-grid-four" aria-label="Workspace status shortcuts">
          <a className="metric-card" href="#web-settings" onClick={(event) => { event.preventDefault(); openSettingsPanel(); }} aria-label={`View ${devices.length} hosted runners in settings`}><span>Hosted VPS</span><strong>{devices.length}</strong><small>{onlineDevices.length} online now</small><b>View runner →</b></a>
          <a className="metric-card" href="#task-activity" aria-label={`View ${activeTasks.length} active tasks`}><span>Active tasks</span><strong>{activeTasks.length}</strong><small>{tasks.filter((task) => task.route === "cloud" && !terminal.has(task.status)).length} routed to cloud</small><b>View activity →</b></a>
          <a className="metric-card" href="#task-activity" aria-label={`View task receipts; P95 completion is ${latency(p95CompletionLatency)}`}><span>P95 completion</span><strong>{latency(p95CompletionLatency)}</strong><small>{p95CompletionLatency === null ? "Waiting for completed runs" : "Measured from real task receipts"}</small><b>View receipts →</b></a>
          <a className="metric-card" href="#execution-safety" aria-label="Explain fenced execution safety" onClick={() => setSafetyExpanded(true)}><span>Execution safety</span><strong className="safe-copy">Fenced</strong><small>One signed runner; 90-second lease</small><b>Explain safety →</b></a>
        </nav>

        <div className="dashboard-grid">
          <section className="panel task-panel" id="hermes-console">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">THREAD CONSOLE</p>
                {visibleTasks.length === 0 && !selectedThread ? (
                  <button
                    type="button"
                    className="panel-heading-action"
                    data-testid="start-work-heading"
                    onClick={focusComposer}
                    aria-label="Start work — focus the task composer"
                  >
                    <h2>Start the work</h2>
                  </button>
                ) : (
                  <h2>Continue the work</h2>
                )}
              </div>
              <span>{selectedThread ? `${threadDetails?.snapshot.length ?? 0} synced messages` : `${visibleTasks.length} tasks`}</span>
            </div>
            {/* DimAgent-style observability: always know what the agent is doing */}
            <div
              className="agent-activity"
              data-testid="agent-activity"
              data-state={activeTasks.length > 0 ? "running" : "idle"}
              role="status"
              aria-live="polite"
            >
              <i className="agent-activity-dot" aria-hidden="true" />
              <strong>
                {activeTasks.length === 1
                  ? "1 hosted run active"
                  : `${activeTasks.length} hosted runs active`}
              </strong>
              <span>
                {activeTasks.some((task) => task.route === "cloud")
                  ? "Fenced VPS · no babysitting required"
                  : "Hosted on a fenced VPS"}
              </span>
            </div>
            <div className="hermes-scroll-pane">
            {selectedThread && <div className="conversation-history" ref={conversationHistoryRef}>
              {threadDetails?.snapshot.length ? threadDetails.snapshot.map((message, index) => <article key={`snapshot-${index}`} className={`conversation-message role-${message.role}`}><span>{message.role}</span><ConversationMeta meta={snapshotMessageMeta(message, threadDetails.syncedAt)} /><FormattedMessage text={message.content} hideToolProtocol={message.role === "assistant"} /></article>) : loadState === "loading" && !threadDetails ? <div className="conversation-empty" data-state="loading">Loading this conversation…</div> : loadState === "error" && !threadDetails ? <div className="conversation-empty" data-state="error">Could not load workspace data. <button type="button" className="task-filter-clear" data-testid="dashboard-retry" onClick={() => requestWorkspaceRefresh()}>Retry</button></div> : <div className="conversation-empty">No messages in this thread yet. Send a task below to start the conversation on the fenced VPS runner.</div>}
              {[...(threadDetails?.tasks ?? [])].sort((left, right) => left.createdAt - right.createdAt).flatMap((task, index) => {
                if (!task.prompt.trim()) return [];
                return [
                  <article
                    key={`task-user-${task.id || index}`}
                    className="conversation-message role-user"
                    data-testid="conversation-user-prompt"
                  >
                    <span>web</span>
                    <ConversationMeta meta={taskPromptMeta(task)} />
                    <p>{task.prompt}</p>
                  </article>,
                  task.result ? <article key={`task-result-${task.id || index}`} className="conversation-message role-assistant"><span>{taskReceiptLabel(task)}</span><ConversationMeta meta={taskOutputMeta(task)} /><FormattedMessage text={task.result} hideToolProtocol />{feedbackControls(task.id)}</article>
                    : task.error ? <article key={`task-error-${task.id || index}`} className="conversation-message role-error"><span>Hermes error</span><ConversationMeta meta={taskOutputMeta(task)} /><FormattedMessage text={task.error} /></article>
                    : task.status !== "completed" && task.status !== "failed" ? <article key={`task-pending-${task.id || index}`} className="conversation-message role-pending"><span>{taskReceiptLabel(task)}</span><ConversationMeta meta={taskOutputMeta(task)} /><p>Waiting for the fenced VPS runner to pick this up…</p></article>
                    : null,
                ];
              })}
              <div ref={messagesEndRef} style={{ height: 1 }} aria-hidden="true" />
            </div>}
            <div className="task-list" id="task-activity">
              {taskFilter !== "all" ? (
                <div className="task-filter-banner" role="status">
                  Showing{" "}
                  <strong>
                    {taskFilter === "completed" ? "completed web answers" : "answers ready to rate (no 👍/👎 yet)"}
                  </strong>
                  {" · "}
                  <button
                    type="button"
                    className="task-filter-clear"
                    onClick={() => {
                      setTaskFilter("all");
                      const url = new URL(window.location.href);
                      url.searchParams.delete("filter");
                      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
                    }}
                  >
                    Clear filter
                  </button>
                </div>
              ) : null}
              {visibleTasks.length === 0 && loadState === "loading" ? (
                <div className="empty-state" data-state="loading">
                  <Mark />
                  <h3>Loading your workspace…</h3>
                  <p>Fetching threads and tasks. This usually takes a moment.</p>
                </div>
              ) : visibleTasks.length === 0 && loadState === "error" ? (
                <div className="empty-state" data-state="error">
                  <Mark />
                  <h3>Could not load your workspace</h3>
                  <p>The last refresh failed, so this list may be incomplete. Tap Retry to fetch once — no background poll.</p>
                  <button
                    type="button"
                    className="button button-primary button-small empty-state-cta"
                    data-testid="dashboard-retry"
                    onClick={() => requestWorkspaceRefresh()}
                  >
                    Retry
                  </button>
                </div>
              ) : visibleTasks.length === 0 && loadState === "loaded" ? (
                (() => {
                  const empty = taskListEmptyCopy({
                    taskFilter,
                    hasSelectedThread: Boolean(selectedThread),
                    syncedMessageCount: threadDetails?.snapshot.length ?? 0,
                  });
                  return (
                    <div
                      className={empty.compact ? "empty-state empty-state-compact" : "empty-state"}
                      data-testid="task-list-empty"
                      data-pair-blame={devices.length === 0 && taskFilter === "all" ? "1" : "0"}
                    >
                      {empty.compact ? null : <Mark />}
                      <h3>{empty.title}</h3>
                      <p>{empty.body}</p>
                      {taskFilter === "all" ? (
                        <button
                          type="button"
                          className="button button-primary button-small empty-state-cta"
                          data-testid="empty-start-work"
                          onClick={focusComposer}
                        >
                          Write a task →
                        </button>
                      ) : null}
                    </div>
                  );
                })()
              ) : (
                visibleTasks.map((task) => (
                  <article key={task.id} id={`task-${task.id}`} className="dashboard-task">
                    <div className="task-top">
                      <span className={`task-status status-${task.status}`}>{task.status.replaceAll("_", " ")}</span>
                      <time dateTime={new Date(task.createdAt).toISOString()}>{formatDateTime(task.createdAt)}</time>
                    </div>
                    <h3>{task.threadTitle}</h3>
                    <p>{task.prompt}</p>
                    <div className="task-foot">
                      <span data-testid="task-receipt">{taskReceiptLabel(task)}</span>
                      {["needs_failover", "offline_blocked"].includes(task.status) && (
                        <button onClick={() => void failover(task.id)}>Continue in cloud →</button>
                      )}
                    </div>
                    {task.result && (
                      <>
                        <pre>{task.result}</pre>
                        {feedbackControls(task.id)}
                      </>
                    )}
                    {task.error && <div className="task-error">{task.error}</div>}
                  </article>
                ))
              )}
            </div>
            </div>
            <form className="composer" ref={setComposerNode} onSubmit={(event) => void createTask(event)}>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.keyCode === 13) && !event.shiftKey) {
                    if (event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    const live = event.currentTarget.value.trim();
                    if (live && !busy) {
                      if (live !== prompt) setPrompt(live);
                      const form = event.currentTarget.form;
                      if (form) {
                        if (typeof form.requestSubmit === "function") {
                          try {
                            form.requestSubmit();
                          } catch {
                            form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                          }
                        } else {
                          form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                        }
                      }
                    }
                  }
                }}
                placeholder="Tell Hermes what to do next…"
                rows={isNarrowViewport ? 2 : 3}
                enterKeyHint="send"
                aria-label="Message for Hermes"
                disabled={busy}
              />
              <div className="run-output" id="run-output" data-testid="run-output" role="status" aria-live="polite">
                <p className="eyebrow">Output</p>
                {/* Notices + in-flight status only — completed results live in the task rows; echoing them here left stale agent output pinned under the composer. */}
                {notice ? <p>{notice}</p> : visibleTasks[0] && !visibleTasks[0].result && !visibleTasks[0].error ? <p>Running on the hosted VPS…</p> : <p>Results show here after you send.</p>}
              </div>
              <div className="composer-actions">
                {/* Fallback hidden submit button so form.requestSubmit() and soft keyboard Enter always find a submitter */}
                <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1}>Submit</button>
                {(() => {
                  const cta = resolveComposerRunCta({
                    hasCloudAccess,
                    busy,
                  });
                  if (cta.kind === "upgrade") {
                    return (
                      <button
                        type="submit"
                        className="button button-primary button-small composer-run"
                        data-testid={cta.testId}
                        disabled={cta.disabled}
                        onClick={(e) => {
                          if (!prompt.trim()) {
                            e.preventDefault();
                            setNotice("A trial or Pro plan is required to run on the hosted VPS. Open Manage plan.");
                            document.getElementById("billing")?.scrollIntoView({ behavior: "smooth" });
                            window.location.hash = "billing";
                          }
                        }}
                      >
                        {cta.label}
                      </button>
                    );
                  }
                  return (
                    <button
                      type="submit"
                      className="button button-primary button-small composer-run"
                      data-testid={cta.testId}
                      disabled={cta.disabled}
                      aria-busy={busy}
                      aria-label="Run"
                    >
                      {busy ? "Sending…" : cta.label}
                    </button>
                  );
                })()}
              </div>
            </form>
          </section>

          <aside className="right-rail" ref={rightRailRef}>
            <section className="panel connection-panel" id="leash-control">
              <div className="panel-heading"><div><p className="eyebrow">HOSTED HERMES</p><h2>Fenced VPS</h2></div><span>{hostedCopy.badge}</span></div>
              <div className="connection-summary" data-testid="hosted-connection-summary" data-hosted-ready={hostedCopy.live ? "1" : "0"}>
                <span className={`device-light ${hostedCopy.live ? "is-online" : runnerStatus === "unhealthy" || modelStatus === "unhealthy" ? "is-stale" : ""}`} />
                <div>
                  <strong>{hostedCopy.headline}</strong>
                  <p>{hostedCopy.body}</p>
                </div>
              </div>
              <ul className="hosted-resource-status" data-testid="hosted-resource-status">
                <li data-testid="hosted-runner-status" data-status={runnerStatus}>
                  Runner · {hostedResourceLabel(runnerStatus)}
                </li>
                <li data-testid="hosted-model-status" data-status={modelStatus}>
                  Model · {hostedResourceLabel(modelStatus)}
                </li>
              </ul>
              <ol className="dashboard-setup-steps">
                <li className={runnerStatus === "healthy" ? "is-done" : ""}><span>1</span>Cloud VPS runner {hostedResourceLabel(runnerStatus).toLowerCase()}</li>
                <li className="is-done"><span>2</span>LLM-as-a-Judge guardrails enabled</li>
                <li className={hostedCopy.live ? "is-done" : ""}><span>3</span>{hostedCopy.live ? "Online & autonomous" : "Waiting until runner and model are healthy"}</li>
              </ol>
              {devices.length > 0 ? (
                <div className="leash-device-picker" data-testid="leash-device-picker">
                  <label htmlFor="leash-device-select" className="composer-where-label" style={{ margin: 0 }}>
                    Run tasks on
                  </label>
                  <select
                    id="leash-device-select"
                    data-testid="leash-device-select"
                    value={selectedDeviceId}
                    onChange={(event) => chooseDevice(event.target.value)}
                    disabled={busy}
                    aria-label="Which machine should run tasks"
                  >
                    <option value="cloud">☁ Hosted VPS (default)</option>
                    {devices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {machineDisplayName(device)} · {deviceStatusLabel(device)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="account-recovery" style={{ marginTop: "1rem" }}><p>Signed in as <strong>{user.email}</strong>. If your machines are paired to another email, switch accounts here.</p><SignOutForm buttonClassName="button button-secondary button-small" data-testid="dashboard-switch-account">Switch account</SignOutForm></div>
              <p className="privacy-boundary">Bounded Hermes thread context syncs to this control plane. Tasks execute in isolated serverless leases.</p>
              <p className="privacy-boundary" data-testid="hosted-not-computer-history">{HOSTED_NOT_COMPUTER_HISTORY} Least privilege: cannot read secrets. Private/incognito analogue: we do not ingest other people&apos;s Slack or DMs.</p>
            </section>
            <details className="panel safety-panel" id="execution-safety" open={safetyExpanded} onToggle={(event) => setSafetyExpanded(event.currentTarget.open)}>
              <summary><span><span className="eyebrow">EXECUTION SAFETY</span><strong>What “Fenced” means</strong></span><span aria-hidden="true">⌄</span></summary>
              <div className="safety-explanation">
                <p>ThumbGate gives each task to one signed runner at a time. Its 90-second lease must keep renewing; if that runner disappears, the lease expires before another runner can take over.</p>
                <ul><li>Prevents duplicate or stale runners from continuing work.</li><li>Rejects completion receipts from an expired lease.</li><li>All tasks run in isolated serverless cloud sandboxes.</li><li>Not ChatGPT Computer History, not Windows Recall, not a Mac keylogger — the isolated fenced VPS does not grab the cursor.</li></ul>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  data-testid="open-settings"
                  onClick={openSettingsPanel}
                >
                  Open settings
                </button>
              </div>
            </details>
            <section className="panel" id="web-settings" tabIndex={-1}>
              <div className="panel-heading"><div><p className="eyebrow">SETTINGS</p><h2>Paired Hermes connectors</h2></div></div>
              <p className="helper-copy">
                ThumbGate executes tasks directly on our fenced serverless Cloud VPS runner (90s renewable lease). No local Mac software or background daemons are required.
              </p>
              {devices.map((device) => {
                const isPreferred = device.id === selectedDeviceId;
                return (
                <article
                  key={device.id}
                  className={`device-card${device.stale || device.presence === "stale" ? " is-stale" : ""}${isPreferred ? " is-preferred" : ""}`}
                  data-testid={`device-card-${device.id.slice(0, 8)}`}
                  data-preferred={isPreferred ? "1" : "0"}
                >
                  <div>
                    <span className={`device-light ${device.online ? "is-online" : device.stale || device.presence === "stale" ? "is-stale" : ""}`} />
                    <div>
                      <strong>{device.name}</strong>
                      <small>
                        {deviceStatusLabel(device)} · id {device.id.slice(0, 8)}
                        {isPreferred ? " · preferred for tasks" : ""}
                      </small>
                    </div>
                  </div>
                  <code>{device.fingerprint}</code>
                  <label>If {machineDisplayName(device)} goes offline
                    <select value={device.failoverMode} onChange={(event) => void updateFailover(device.id, event.target.value as Device["failoverMode"])}>
                      <option value="manual">Ask me first before switching to the cloud</option>
                      <option value="auto">Switch to the cloud automatically</option>
                      <option value="disabled">Pause and wait for {machineDisplayName(device)}</option>
                    </select>
                  </label>
                  <div className="device-card-actions">
                    <button
                      type="button"
                      className="button button-primary button-small device-use-for-tasks"
                      data-testid={`device-use-for-tasks-${device.id.slice(0, 8)}`}
                      disabled={busy || isPreferred}
                      onClick={() => chooseDevice(device.id)}
                    >
                      {isPreferred ? "Preferred for tasks" : "Use for tasks"}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small device-remove"
                      disabled={busy}
                      onClick={() => void revokeDevice(device)}
                    >
                      {(device.stale || device.presence === "stale") ? "Remove stale machine" : "Remove machine"}
                    </button>
                  </div>
                </article>
                );
              })}
              <details className="add-mac-details" style={{ marginTop: "1rem" }}>
                <summary>Add another computer (optional)</summary>
                <p className="helper-copy">
                  These machines run the ThumbGate connector as an always-on service. After the one-time install they reconnect on their own — you do <strong>not</strong> copy an installer every time. A browser cannot install a background service on the host OS due to Apple security.
                </p>
                <div className="installer-command">
                  <code>{connectorInstallCommand}</code>
                  <button className="button button-secondary button-small" type="button" onClick={() => void copyInstaller()}>{installCopied ? "Copied" : "Copy one-line installer"}</button>
                  <button className="button button-secondary button-small" type="button" onClick={() => void copyInstaller()}>{installCopied ? "Copied" : "Copy installer for another computer"}</button>
                </div>
                <form className="pair-form" onSubmit={pair}>
                  <label>Pairing code<input value={pairCode} onChange={(event) => setPairCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={9} /></label>
                  <button className="button button-secondary button-small" disabled={busy || !pairingCodePattern.test(pairCode)}>Approve machine</button>
                </form>
              </details>
            </section>
          </aside>
        </div>
      </section>
      <nav className="mobile-web-tabs" aria-label="Hermes workspace">
        <a href="#hermes-console" className={mobileTab === "hermes" ? "is-active" : undefined} aria-current={mobileTab === "hermes" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setMobileTab("hermes"); window.history.replaceState(null, "", "#hermes-console"); }}><b aria-hidden="true">H</b><span>Hermes</span></a>
        <a href="#leash-control" className={mobileTab === "leash" ? "is-active" : undefined} aria-current={mobileTab === "leash" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setMobileTab("leash"); window.history.replaceState(null, "", "#leash-control"); }}><b aria-hidden="true">✓</b><span>Leash</span></a>
        <a href="/dashboard/lessons" className={mobileTab === "lessons" ? "is-active" : undefined} aria-current={mobileTab === "lessons" ? "page" : undefined} onClick={() => setMobileTab("lessons")}><b aria-hidden="true">👍</b><span>Lessons</span></a>
        <a href="#web-settings" className={mobileTab === "settings" ? "is-active" : undefined} aria-current={mobileTab === "settings" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setMobileTab("settings"); window.history.replaceState(null, "", "#web-settings"); }}><b aria-hidden="true">≡</b><span>Settings</span></a>
      </nav>
      {feedbackDialog && <div className="chat-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !feedbackBusyTask) setFeedbackDialog(null); }}>
        <form className="chat-dialog feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-dialog-title" onSubmit={(event) => { event.preventDefault(); void saveFeedback(feedbackDialog.taskId, "down", feedbackDialog.note); }}>
          <p className="eyebrow">THUMBGATE FEEDBACK</p>
          <h2 id="feedback-dialog-title">What should Hermes improve?</h2>
          <p>The note is optional. It stays inside your workspace and appears in your lessons dashboard.</p>
          <label>Improvement note<textarea autoFocus value={feedbackDialog.note} onChange={(event) => setFeedbackDialog({ ...feedbackDialog, note: event.target.value })} maxLength={1000} rows={4} placeholder="Missing evidence, wrong context, unsafe action…" /></label>
          <div className="chat-dialog-actions"><button type="button" className="button button-secondary button-small" disabled={Boolean(feedbackBusyTask)} onClick={() => setFeedbackDialog(null)}>Cancel</button><button className="button button-primary button-small" disabled={Boolean(feedbackBusyTask)}>Save lesson</button></div>
        </form>
      </div>}
      {chatDialog && <div className="chat-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !chatOperationBusy) setChatDialog(null); }}>
        <section className="chat-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-dialog-title">
          {chatDialog.kind === "rename" ? <form onSubmit={(event) => void submitChatDialog(event)}>
            <p className="eyebrow">CHAT SETTINGS</p>
            <h2 id="chat-dialog-title">Rename chat</h2>
            <label>Chat name<input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={120} /></label>
            <div className="chat-dialog-actions"><button type="button" className="button button-secondary button-small" disabled={chatOperationBusy} onClick={() => setChatDialog(null)}>Cancel</button><button className="button button-primary button-small" disabled={chatOperationBusy || !renameValue.trim()}>Save name</button></div>
          </form> : <>
            <p className="eyebrow">DESTRUCTIVE ACTION</p>
            <h2 id="chat-dialog-title">{chatDialog.kind === "clear" ? "Clear all chats?" : "Delete this chat?"}</h2>
            <p>{chatDialog.kind === "clear"
              ? `This deletes all ${threads.length} visible chats from ThumbGate and the paired Hermes machine${devices.length === 1 ? "" : "s"}. You cannot undo this.`
              : `This deletes “${chatDialog.thread.title}” from ThumbGate and its paired Hermes machine. You cannot undo this.`}</p>
            <div className="chat-dialog-actions"><button type="button" className="button button-secondary button-small" disabled={chatOperationBusy} onClick={() => setChatDialog(null)}>Cancel</button><button type="button" className="button button-danger button-small" disabled={chatOperationBusy} onClick={() => void submitChatDialog()}>{chatOperationBusy ? "Working…" : chatDialog.kind === "clear" ? "Clear all chats" : "Delete chat"}</button></div>
          </>}
        </section>
      </div>}
    </main>
  );
}
