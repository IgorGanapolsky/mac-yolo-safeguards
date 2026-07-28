"use client";

import { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type User = { id: string; email: string; name: string; avatarUrl: string | null };
type Organization = { id: string; plan: string; trialEndsAt: number | null; cloudAccess: boolean };
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
type ThreadDetails = { snapshot: Array<{ role: string; content: string }>; tasks: Array<{ id: string; prompt: string; result: string | null; error: string | null; route: string; status: string; createdAt: number }> };
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
  deviceCount: number;
  machineLabel: string;
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
  if (input.deviceCount === 0) {
    return {
      title: "No tasks yet",
      body: "Pair a machine, then continue a Hermes thread from anywhere.",
      compact: false,
    };
  }
  if (input.hasSelectedThread && input.syncedMessageCount > 0) {
    return {
      title: "No web tasks in this chat yet",
      body: `Conversation is synced above. Type below to run the next step on ${input.machineLabel} (fenced runner, 90s lease).`,
      compact: true,
    };
  }
  if (input.hasSelectedThread) {
    return {
      title: "No web tasks in this chat yet",
      body: `Type below to run work on ${input.machineLabel}. Synced Hermes messages appear here when the connector is online.`,
      compact: false,
    };
  }
  return {
    title: "No web tasks yet",
    body: `Machines are paired. Type below to run on ${input.machineLabel}, or open a chat from the list.`,
    compact: false,
  };
}

function taskReceiptLabel(task: { route: string; deviceName: string | null; status: string }): string {
  if (task.route === "cloud") return "☁ Continuity · fenced · 90s lease";
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
  const [devices, setDevices] = useState<Device[]>(() => readJsonSessionStorage<Device[]>(DASHBOARD_CACHE_KEYS.devices) ?? []);
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
  /** Where this task should run: paired machine, Continuity VPS, or auto offline failover. */
  const [routePreference, setRoutePreference] = useState<"local" | "cloud" | "auto">("auto");
  /**
   * Explicit user override for which paired machine runs the next task.
   * Resolved selection is derived (useMemo) so we never setState inside an effect (eslint react-hooks/set-state-in-effect).
   */
  const [deviceOverrideId, setDeviceOverrideId] = useState<string | null>(null);
  /** True once first network load finishes (or fails auth). */
  // "loading" until a workspace fetch actually completes. Empty states in this view assert a
  // FACT about the user's setup ("no tasks — pair a machine"); rendering them from an
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
  const selectedDeviceLabel = machineDisplayName(selectedDevice, "your computer");

  /** Plain-English copy for the machine / Continuity / Auto control (always show, never jargon-only). */
  const routeExplain =
    !devices.length
      ? {
          title: "Pair a computer first",
          body: "Install the connector on the machine that runs Hermes (Settings), then you can choose where work runs.",
        }
      : routePreference === "local"
        ? {
            title: `${selectedDeviceLabel} only`,
            body: `Runs on ${selectedDeviceLabel}. If that machine is asleep or offline, this task waits — Continuity will not start.`,
          }
        : routePreference === "cloud"
          ? {
              title: "Continuity (cloud VPS)",
              body: organization?.cloudAccess
                ? `Always runs on ThumbGate’s cloud runner (workspace machine: ${selectedDeviceLabel}). Uses a Continuity run from your plan.`
                : "Needs a Continuity trial or Pro plan. Start Continuity to use the cloud runner.",
            }
          : {
              title: `Auto — ${selectedDeviceLabel} first`,
              body: `Uses ${selectedDeviceLabel} while online. If that machine goes offline, Continuity can continue based on its “If this machine goes offline” setting in Settings.`,
            };
  const [pairCode, setPairCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installCopied, setInstallCopied] = useState(false);
  const [chatRailExpanded, setChatRailExpanded] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [threadSortOrder, setThreadSortOrder] = useState<ThreadSortOrder>("newest");
  const [resizing, setResizing] = useState(false);
  const [threadMenu, setThreadMenu] = useState<string | null>(null);
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
  /** Phone shell: hide route-explain blurb so it cannot cover the textarea (Genspark-style compact chrome). */
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

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
  /** Desktop: route explain is secondary chrome — collapsed by default (Genspark-style). */
  const [routeExplainExpanded, setRouteExplainExpanded] = useState(false);
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
  /**
   * Mobile composer is position:absolute docked to the bottom of `.task-panel`.
   * `--composer-dock-space` (globals.css) pads `.hermes-scroll-pane` by the *measured*
   * composer height so messages/run controls never cover the textarea. Re-measure on
   * resize (textarea grow, route chips wrap, keyboard chrome).
   */
  const setComposerNode = useCallback((node: HTMLFormElement | null) => {
    composerObserverRef.current?.disconnect();
    composerObserverRef.current = null;
    if (!node) {
      if (typeof document !== "undefined") {
        document.documentElement.style.removeProperty("--composer-dock-space");
      }
      return;
    }
    if (typeof ResizeObserver === "undefined") return;
    const applyDockSpace = () => {
      const px = Math.max(160, Math.ceil(node.getBoundingClientRect().height) + 20);
      document.documentElement.style.setProperty("--composer-dock-space", `${px}px`);
    };
    applyDockSpace();
    const observer = new ResizeObserver(applyDockSpace);
    observer.observe(node);
    composerObserverRef.current = observer;
  }, []);


  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);

  function chooseDevice(deviceId: string) {
    if (deviceId === "pair") {
      setMobileTab("settings");
      window.history.replaceState(null, "", "#web-settings");
      window.setTimeout(() => {
        document.getElementById("web-settings")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      setNotice("Pair another computer: run the one-line installer there, then approve the code under Settings.");
      return;
    }
    if (deviceId === "manage") {
      setMobileTab("settings");
      window.history.replaceState(null, "", "#web-settings");
      window.setTimeout(() => {
        document.getElementById("web-settings")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      setNotice("Manage machines: remove or add connectors under Settings.");
      return;
    }
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
        // Not "this thread has no snapshot" — we simply failed to find out.
        setLoadState("error");
        return;
      }
      const details = await detailResponse.json() as ThreadDetails;
      persistThreadDetails(threadId, details);
    } catch {
      // Prefetch is best-effort; open path will revalidate.
    } finally {
      preheatInflightRef.current.delete(threadId);
    }
  }, [persistThreadDetails, readCachedThreadDetails]);

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
    const identity = await me.json() as { user: User; organization: Organization };
    setUser(identity.user);
    setOrganization(identity.organization);
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
      setTasks(nextTasks);
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


  useEffect(() => {
    // `void loadWorkspace()` swallowed rejections: a network failure left loadState at
    // "loading" forever with no error shown and no retry signal.
    const run = () => { void loadWorkspace().catch(() => setLoadState("error")); };
    const initial = window.setTimeout(run, 0);
    const timer = window.setInterval(run, 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
    // Intentionally not re-binding when selectedThread flips — list poll stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shell-first: one poller, not one-per-thread
  }, []);

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
    if (!user || !pairingCodePattern.test(pairCode)) return;
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("pair")?.toUpperCase() !== pairCode) return;
    currentUrl.searchParams.delete("pair");
    window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    const timer = window.setTimeout(() => setNotice("Machine found. Verify its name, then approve the prefilled code."), 0);
    return () => window.clearTimeout(timer);
  }, [pairCode, user]);
  const visibleThreads = useMemo(() => orderThreadsForDisplay(threads, threadSortOrder), [threads, threadSortOrder]);
  const activeTasks = useMemo(() => tasks.filter((task) => !terminal.has(task.status)), [tasks]);
  const visibleTasks = useMemo(() => {
    if (taskFilter === "completed") {
      return tasks.filter((task) => task.status === "completed" && Boolean(task.result));
    }
    if (taskFilter === "unrated") {
      return tasks.filter(
        (task) => task.status === "completed" && Boolean(task.result) && !feedback[task.id],
      );
    }
    return selectedThread ? tasks.filter((task) => task.threadId === selectedThread) : tasks;
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
    const text = prompt.trim();
    if (!text) {
      setNotice("Type a message first, then tap Run task.");
      return;
    }
    if (!devices.length) {
      setNotice("Pair a computer first (open Settings → run the installer).");
      return;
    }
    if (!selectedDeviceId) {
      setNotice("Select which machine should run this task.");
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
          deviceId: selectedDeviceId,
          idempotencyKey: crypto.randomUUID(),
          traceId: crypto.randomUUID(),
          routePreference,
        }),
      });
      let body: { task?: { route: string; threadId: string; preference?: string; deviceId?: string; traceId?: string }; error?: string; traceId?: string } = {};
      try {
        body = await response.json() as typeof body;
      } catch {
        setNotice(`Could not start task (HTTP ${response.status}). Try again.`);
        return;
      }
      if (response.ok && body.task) {
        const macName =
          devices.find((device) => device.id === (body.task?.deviceId ?? selectedDeviceId))?.name
          ?? selectedDeviceLabel;
        setNotice(
          body.task.route === "local"
            ? `Sent — running on ${macName}.`
            : body.task.route === "cloud"
              ? `Sent — Continuity VPS (workspace: ${macName}).`
              : `Sent — awaiting route on ${macName}.`
        );
        setPrompt("");
        setSelectedThread(body.task.threadId);
        await loadWorkspace();
        window.requestAnimationFrame(() => {
          document.getElementById("task-activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        setNotice(body.error ?? "Task routing failed");
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
        setNotice(`${body.cleared ?? threads.length} chats cleared. Paired Hermes machines will apply the deletion safely.`);
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
    setRouteExplainExpanded(false);
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
      // Keep the rail open only when browsing the full chat list (#chats).
      if (threadId) {
        setChatRailExpanded(false);
        window.localStorage.setItem(chatRailPreferenceKey, "false");
      } else {
        setChatRailExpanded(true);
        window.localStorage.setItem(chatRailPreferenceKey, "true");
      }
      setMobileTab("hermes");
    }
  }

  if (!user || !organization) return <main className="loading-screen"><Mark /><p>Opening the control plane…</p></main>;

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
          <nav className="thread-list" id="hermes-thread-list" aria-label={`Chats, ${threadSortOrder} order`}>{visibleThreads.map((thread) => (
            <div key={thread.id} className="thread-row">
              <button title={`${thread.title} — ${formatDateTime(thread.updatedAt)}`} aria-current={selectedThread === thread.id ? "page" : undefined} className={selectedThread === thread.id ? "side-item thread-item active" : "side-item thread-item"} onClick={() => openThread(thread.id)} onPointerEnter={() => void prefetchThreadDetails(thread.id)} onFocus={() => void prefetchThreadDetails(thread.id)}><span className="thread-icon">{thread.sourceSessionId ? "⌘" : "›_"}</span><span className="thread-copy"><strong>{thread.title}</strong><time dateTime={new Date(thread.updatedAt).toISOString()}>{formatDateTime(thread.updatedAt)}</time></span><em>{thread.messageCount || thread.taskCount}</em></button>
              <button type="button" className="thread-menu-trigger" aria-label={`Actions for ${thread.title}`} aria-haspopup="menu" aria-expanded={threadMenu === thread.id} onClick={() => setThreadMenu((current) => current === thread.id ? null : thread.id)}>•••</button>
              {threadMenu === thread.id && <div className="thread-actions" role="menu" aria-label={`Actions for ${thread.title}`}>
                <button type="button" className="thread-action" role="menuitem" onClick={() => openRenameDialog(thread)}><span aria-hidden="true">✎</span> Rename</button>
                <button type="button" className="thread-action thread-action-danger" role="menuitem" onClick={() => openDeleteDialog(thread)}><span aria-hidden="true">⌫</span> Delete</button>
              </div>}
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
              <button
                type="button"
                className="mobile-chats-toggle button button-small button-secondary"
                onClick={toggleChatRail}
                aria-label="Toggle chat threads menu"
                data-testid="mobile-chats-toggle"
              >
                💬 {chatRailExpanded ? "Hide Chats" : "Chats"}
              </button>
              <p className="eyebrow">HERMES WEB</p>
            </div>
            <h1 title={selectedThread ? threads.find((thread) => thread.id === selectedThread)?.title ?? "Your Hermes workspace" : "Your Hermes workspace"}>
              {selectedThread ? threads.find((thread) => thread.id === selectedThread)?.title : "Your Hermes workspace"}
            </h1>
          </div>
          <div className="header-actions">
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

        <nav className="metric-grid metric-grid-four" aria-label="Workspace status shortcuts">
          <a className="metric-card" href="#web-settings" aria-label={`View ${devices.length} paired machines in settings`}><span>Paired machines</span><strong>{devices.length}</strong><small>{onlineDevices.length} online now</small><b>View machines →</b></a>
          <a className="metric-card" href="#task-activity" aria-label={`View ${activeTasks.length} active tasks`}><span>Active tasks</span><strong>{activeTasks.length}</strong><small>{tasks.filter((task) => task.route === "cloud" && !terminal.has(task.status)).length} routed to cloud</small><b>View activity →</b></a>
          <a className="metric-card" href="#task-activity" aria-label={`View task receipts; P95 completion is ${latency(p95CompletionLatency)}`}><span>P95 completion</span><strong>{latency(p95CompletionLatency)}</strong><small>{p95CompletionLatency === null ? "Waiting for completed runs" : "Measured from real task receipts"}</small><b>View receipts →</b></a>
          <a className="metric-card" href="#execution-safety" aria-label="Explain fenced execution safety" onClick={() => setSafetyExpanded(true)}><span>Execution safety</span><strong className="safe-copy">Fenced</strong><small>One signed runner; 90-second lease</small><b>Explain safety →</b></a>
        </nav>

        <div className="dashboard-grid">
          <section className="panel task-panel" id="hermes-console">
            <div className="panel-heading"><div><p className="eyebrow">THREAD CONSOLE</p><h2>Continue the work</h2></div><span>{selectedThread ? `${threadDetails?.snapshot.length ?? 0} synced messages` : `${visibleTasks.length} tasks`}</span></div>
            <div className="hermes-scroll-pane">
            {selectedThread && <div className="conversation-history">
              {threadDetails?.snapshot.length ? threadDetails.snapshot.map((message, index) => <article key={`snapshot-${index}`} className={`conversation-message role-${message.role}`}><span>{message.role}</span><FormattedMessage text={message.content} /></article>) : loadState === "loading" ? <div className="conversation-empty" data-state="loading">Loading this conversation…</div> : loadState === "error" ? <div className="conversation-empty" data-state="error">Could not load this conversation. Retrying automatically.</div> : <div className="conversation-empty">This thread has no cloud snapshot yet. Keep the paired Hermes connector online to sync it.</div>}
              {threadDetails?.tasks.flatMap((task, index) => [
                <article key={`task-user-${index}`} className="conversation-message role-user"><span>web</span><p>{task.prompt}</p></article>,
                task.result ? <article key={`task-result-${index}`} className="conversation-message role-assistant"><span>{taskReceiptLabel(task)}</span><FormattedMessage text={task.result} />{feedbackControls(task.id)}</article>
                  : task.error ? <article key={`task-error-${index}`} className="conversation-message role-error"><span>failed</span><FormattedMessage text={task.error} /></article>
                  : task.status !== "completed" && task.status !== "failed" ? <article key={`task-pending-${index}`} className="conversation-message role-pending"><span>{taskReceiptLabel(task)}</span><p>Waiting for {task.route === "cloud" ? "the fenced Continuity runner" : "your paired machine"} to pick this up…</p></article>
                  : null,
              ])}
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
                  <p>The last refresh failed, so this list may be incomplete. Retrying automatically.</p>
                </div>
              ) : visibleTasks.length === 0 && loadState === "loaded" ? (
                (() => {
                  const empty = taskListEmptyCopy({
                    taskFilter,
                    deviceCount: devices.length,
                    machineLabel: selectedDeviceLabel,
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
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (prompt.trim() && !busy) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }
                }}
                placeholder="Tell Hermes what to do next…"
                rows={3}
                enterKeyHint="send"
                aria-label="Message for Hermes"
                disabled={busy}
              />
              <div className="composer-where">
                <p className="composer-where-label" id="composer-where-label">Where should this run?</p>
                <div className="composer-route" role="radiogroup" aria-labelledby="composer-where-label">
                  <label className={routePreference === "local" ? "is-selected" : ""}>
                    <input type="radio" name="routePreference" value="local" checked={routePreference === "local"} onChange={() => { setRoutePreference("local"); setRouteExplainExpanded(false); }} />
                    <span className="route-label-full">{selectedDevice ? selectedDeviceLabel : "My computer"}</span>
                    <span className="route-label-short">{selectedDevice ? shortMachineLabel(selectedDeviceLabel, 10) : "Local"}</span>
                  </label>
                  <label
                    className={routePreference === "cloud" ? "is-selected" : ""}
                    title={organization?.cloudAccess ? `Cloud VPS even if ${selectedDeviceLabel} is online` : "Requires Continuity trial or Pro"}
                  >
                    <input type="radio" name="routePreference" value="cloud" checked={routePreference === "cloud"} onChange={() => { setRoutePreference("cloud"); setRouteExplainExpanded(false); }} disabled={!organization?.cloudAccess} />
                    <span className="route-label-full">Continuity</span>
                    <span className="route-label-short">Cloud</span>
                  </label>
                  <label className={routePreference === "auto" ? "is-selected" : ""}>
                    <input type="radio" name="routePreference" value="auto" checked={routePreference === "auto"} onChange={() => { setRoutePreference("auto"); setRouteExplainExpanded(false); }} />
                    <span className="route-label-full">Auto</span>
                    <span className="route-label-short">Auto</span>
                  </label>
                </div>
                {devices.length > 0 ? (
                  <div className="composer-device-picker" data-testid="composer-device-picker">
                    <label htmlFor="composer-device-select" className="composer-where-label" style={{ margin: 0 }}>
                      Which machine?
                    </label>
                    <select
                      id="composer-device-select"
                      data-testid="composer-device-select"
                      value={selectedDeviceId}
                      onChange={(event) => chooseDevice(event.target.value)}
                      disabled={busy}
                      aria-label="Which machine should run this task"
                    >
                      {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {machineDisplayName(device)} · {deviceStatusLabel(device)}
                        </option>
                      ))}
                      <optgroup label="Actions">
                        <option value="pair">+ Pair another computer…</option>
                        <option value="manage">⚙ Manage / remove machines…</option>
                      </optgroup>
                    </select>
                    <p className="composer-device-hint">
                      {devices.length === 1
                        ? `Pinned to ${selectedDeviceLabel}. Use Actions below to pair another computer or remove machines in Settings.`
                        : "Task is pinned to the machine you select. Pair or remove machines via Actions → Settings."}
                    </p>
                  </div>
                ) : null}
                {!isNarrowViewport ? (
                  <div className="composer-route-explain" role="status" aria-live="polite">
                    <button
                      type="button"
                      className="composer-route-explain-toggle"
                      aria-expanded={routeExplainExpanded}
                      onClick={() => setRouteExplainExpanded((v) => !v)}
                    >
                      <strong>{routeExplain.title}</strong>
                      <span aria-hidden="true">{routeExplainExpanded ? "▾" : "▸"}</span>
                    </button>
                    {routeExplainExpanded ? <p>{routeExplain.body}</p> : null}
                  </div>
                ) : (
                  <p className="composer-where-label" style={{ margin: 0, textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#94A3B8" }}>
                    {routeExplain.title}
                  </p>
                )}
              </div>
              <div className="composer-actions">
                <button
                  type="submit"
                  className="button button-primary button-small composer-run"
                  disabled={busy || !devices.length}
                  aria-busy={busy}
                >
                  {busy ? "Sending…" : !devices.length ? "Pair a computer first" : "Run task →"}
                </button>
              </div>
            </form>
          </section>

          <aside className="right-rail" ref={rightRailRef}>
            <section className="panel connection-panel" id="leash-control">
              <div className="panel-heading"><div><p className="eyebrow">CONNECTION</p><h2>{onlineDevices.length ? "Connector online" : devices.length ? "Connector reconnecting" : "Pair your first machine"}</h2></div><span>{onlineDevices.length ? "LIVE" : devices.length ? "RETRYING" : "STEP 1 OF 3"}</span></div>
              <div className="connection-summary"><span className={`device-light ${onlineDevices.length ? "is-online" : ""}`} /><div><strong>{onlineDevices.length ? `${onlineDevices.length} machine${onlineDevices.length === 1 ? "" : "s"} reachable` : devices.length ? "Connector reconnecting automatically" : "One-time setup on your computer"}</strong><p>{devices.length ? "Paired machines stay connected via an always-on service — you don’t reinstall for normal use. Choose which machine runs tasks below (same pin as Hermes)." : "Browsers cannot install a background connector. Run the one-line installer once on the computer that hosts Hermes; it reconnects after sleep or reboot."}</p></div></div>
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
                    {devices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {machineDisplayName(device)} · {deviceStatusLabel(device)}
                      </option>
                    ))}
                    <optgroup label="Actions">
                      <option value="pair">+ Pair another computer…</option>
                      <option value="manage">⚙ Manage / remove machines…</option>
                    </optgroup>
                  </select>
                </div>
              ) : null}
              {!devices.length && (
                <div className="installer-command">
                  <p className="installer-why">Why a Terminal command? Apple blocks remote silent install of background services. This is a <strong>one-time</strong> step on that computer — not every session.</p>
                  <code>{connectorInstallCommand}</code>
                  <button className="button button-secondary button-small" type="button" onClick={() => void copyInstaller()}>{installCopied ? "Copied" : "Copy one-line installer"}</button>
                </div>
              )}
              {!devices.length && <div className="account-recovery"><p>Signed in as <strong>{user.email}</strong>. If your machines are paired to another email, switch accounts here.</p><SignOutForm buttonClassName="button button-secondary button-small" data-testid="dashboard-switch-account">Switch account</SignOutForm></div>}
              <ol className="dashboard-setup-steps"><li className={devices.length ? "is-done" : "is-current"}><span>1</span>{devices.length ? "Connector installed" : "Install once on computer"}</li><li className={devices.length ? "is-done" : ""}><span>2</span>{devices.length ? "Machine approved" : "Approve short code"}</li><li className={onlineDevices.length ? "is-done" : devices.length ? "is-current" : ""}><span>3</span>{onlineDevices.length ? "Online & autonomous" : "Stay online"}</li></ol>
              <p className="privacy-boundary">Bounded Hermes thread context syncs to this control plane. The device private key and local gateway credential stay on the machine.</p>
            </section>
            <details className="panel safety-panel" id="execution-safety" open={safetyExpanded} onToggle={(event) => setSafetyExpanded(event.currentTarget.open)}>
              <summary><span><span className="eyebrow">EXECUTION SAFETY</span><strong>What “Fenced” means</strong></span><span aria-hidden="true">⌄</span></summary>
              <div className="safety-explanation">
                <p>ThumbGate gives each task to one signed runner at a time. Its 90-second lease must keep renewing; if that runner disappears, the lease expires before another runner can take over.</p>
                <ul><li>Prevents duplicate or stale runners from continuing work.</li><li>Rejects completion receipts from an expired lease.</li><li>{devices.length ? "Your machine’s offline policy decides whether work pauses, asks, or continues in paid cloud." : "No task can execute until you pair a machine."}</li></ul>
                <a className="button button-secondary button-small" href="#web-settings">{devices.length ? "Open offline controls" : "Open pairing settings"}</a>
              </div>
            </details>
            <section className="panel" id="web-settings">
              <div className="panel-heading"><div><p className="eyebrow">SETTINGS</p><h2>Paired Hermes connectors</h2></div></div>
              {devices.length > 0 ? (
                <p className="helper-copy">
                  These machines already run the ThumbGate connector as an always-on service. After the one-time install they reconnect on their own (sleep, reboot, network blips) — you do <strong>not</strong> copy an installer every time.
                </p>
              ) : (
                <p className="helper-copy">
                  A browser cannot install a background service on the host OS. On macOS you run one Terminal command once on that computer; then pairing and reconnects are automatic.
                </p>
              )}
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
              {devices.length > 0 && (
                <details className="add-mac-details">
                  <summary>Add another computer (optional)</summary>
                  <p className="helper-copy">
                    Only needed for a <strong>new</strong> computer that has never been paired. Run the installer once on that host. Same machine re-approving reuses its key (no ghost cards).
                  </p>
                  <div className="installer-command">
                    <code>{connectorInstallCommand}</code>
                    <button className="button button-secondary button-small" type="button" onClick={() => void copyInstaller()}>{installCopied ? "Copied" : "Copy installer for another computer"}</button>
                  </div>
                  <form className="pair-form" onSubmit={pair}>
                    <label>Pairing code (if the installer opened a code)<input value={pairCode} onChange={(event) => setPairCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={9} /></label>
                    <button className="button button-secondary button-small" disabled={busy || !pairingCodePattern.test(pairCode)}>Approve machine</button>
                  </form>
                </details>
              )}
              {!devices.length && (
                <form className="pair-form" onSubmit={pair}>
                  <label>Pairing code<input value={pairCode} onChange={(event) => setPairCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={9} /></label>
                  <button className="button button-secondary button-small" disabled={busy || !pairingCodePattern.test(pairCode)}>Approve machine</button>
                </form>
              )}
            </section>
          </aside>
        </div>
      </section>
      <nav className="mobile-web-tabs" aria-label="Hermes workspace">
        <a href="#chats" className={mobileTab === "chats" ? "is-active" : undefined} aria-current={mobileTab === "chats" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setMobileTab("chats"); setChatRailExpanded(true); window.history.replaceState(null, "", "#chats"); }}><b aria-hidden="true">💬</b><span>Chats</span></a>
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
