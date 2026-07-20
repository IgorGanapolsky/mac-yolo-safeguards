const elements = {
  loginView: document.querySelector("#login-view"),
  dashboardView: document.querySelector("#dashboard-view"),
  loginForm: document.querySelector("#login-form"),
  accessCode: document.querySelector("#access-code"),
  loginError: document.querySelector("#login-error"),
  threadList: document.querySelector("#thread-list"),
  threadSearch: document.querySelector("#thread-search"),
  threadTitle: document.querySelector("#thread-title"),
  messages: document.querySelector("#messages"),
  composer: document.querySelector("#composer"),
  messageInput: document.querySelector("#message-input"),
  sendButton: document.querySelector("#send-button"),
  deleteThread: document.querySelector("#delete-thread"),
  refreshThreads: document.querySelector("#refresh-threads"),
  logoutButton: document.querySelector("#logout-button"),
  accountLabel: document.querySelector("#account-label"),
  status: document.querySelector("#connection-status"),
  mobileThreadButton: document.querySelector("#mobile-thread-button"),
};

const state = {
  csrfToken: null,
  accountId: null,
  selectedThreadId: null,
  threads: [],
  sending: false,
  syncing: false,
};

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body) headers["content-type"] = "application/json";
  if (options.method && options.method !== "GET") headers["x-hermes-csrf"] = state.csrfToken;
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({ error: "Unexpected server response" }));
  if (!response.ok) {
    const error = new Error(body.error ?? "Request failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

function setStatus(message = "", kind = "info") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function showLogin(message = "") {
  elements.loginView.hidden = false;
  elements.dashboardView.hidden = true;
  elements.loginError.hidden = !message;
  elements.loginError.textContent = message;
  state.csrfToken = null;
  state.accountId = null;
}

function showDashboard(session) {
  state.csrfToken = session.csrf_token;
  state.accountId = session.account_id;
  elements.accountLabel.textContent = session.account_id;
  elements.loginView.hidden = true;
  elements.dashboardView.hidden = false;
}

function threadName(thread) {
  return thread.title || thread.last_message_preview || "Untitled thread";
}

function renderThreadList() {
  elements.threadList.replaceChildren();
  const query = elements.threadSearch.value.trim().toLocaleLowerCase();
  const visibleThreads = query
    ? state.threads.filter((thread) => `${thread.title ?? ""} ${thread.last_message_preview ?? ""}`.toLocaleLowerCase().includes(query))
    : state.threads;
  if (visibleThreads.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = query ? `No threads match “${elements.threadSearch.value.trim()}”.` : "No active threads yet.";
    elements.threadList.append(empty);
    return;
  }
  for (const thread of visibleThreads) {
    const item = document.createElement("div");
    item.setAttribute("role", "listitem");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "thread-row";
    button.dataset.threadId = thread.thread_id;
    button.setAttribute("aria-current", String(thread.thread_id === state.selectedThreadId));
    const title = document.createElement("strong");
    title.textContent = threadName(thread);
    const metadata = document.createElement("span");
    metadata.textContent = `${thread.message_count} message${thread.message_count === 1 ? "" : "s"}`;
    button.append(title, metadata);
    button.addEventListener("click", () => selectThread(thread.thread_id));
    item.append(button);
    elements.threadList.append(item);
  }
}

function renderMessages(thread) {
  elements.messages.replaceChildren();
  for (const message of thread.messages) {
    const row = document.createElement("div");
    row.className = "message";
    row.dataset.role = message.role;
    row.dataset.messageId = message.message_id;
    const article = document.createElement("article");
    const text = document.createElement("p");
    text.textContent = message.text;
    const time = document.createElement("time");
    time.dateTime = message.occurred_at;
    time.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.occurred_at));
    article.append(text, time);
    row.append(article);
    elements.messages.append(row);
  }
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

async function loadThreads({ preserveSelection = true } = {}) {
  if (state.syncing) return;
  state.syncing = true;
  setStatus("Syncing threads…");
  try {
    const { threads } = await api("/api/threads");
    state.threads = threads;
    if (!preserveSelection || !threads.some((thread) => thread.thread_id === state.selectedThreadId)) {
      state.selectedThreadId = threads[0]?.thread_id ?? null;
    }
    renderThreadList();
    if (state.selectedThreadId) await selectThread(state.selectedThreadId);
    else setStatus("All threads are synced.");
  } catch (error) {
    if (error.status === 401) showLogin("Your web session expired. Sign in again.");
    else setStatus(`Could not sync: ${error.message}`, "error");
  } finally {
    state.syncing = false;
  }
}

async function selectThread(threadId) {
  state.selectedThreadId = threadId;
  renderThreadList();
  elements.dashboardView.dataset.sidebarOpen = "false";
  const summary = state.threads.find((thread) => thread.thread_id === threadId);
  elements.threadTitle.textContent = summary ? threadName(summary) : "Thread";
  elements.composer.hidden = false;
  elements.deleteThread.hidden = false;
  setStatus("Loading conversation…");
  try {
    const { thread } = await api(`/api/threads/${encodeURIComponent(threadId)}`);
    renderMessages(thread);
    setStatus("Synced with your phone.");
  } catch (error) {
    setStatus(`Could not load this thread: ${error.message}`, "error");
  }
}

function mutation(kind, payload) {
  const id = crypto.randomUUID();
  return {
    mutation_id: `web_mut_${id}`,
    author_device_id: "hermes_web",
    kind,
    payload,
  };
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginError.hidden = true;
  try {
    const response = await fetch("/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_code: elements.accessCode.value }),
    });
    const session = await response.json();
    if (!response.ok) throw new Error(session.error ?? "Could not sign in");
    elements.accessCode.value = "";
    showDashboard(session);
    await loadThreads({ preserveSelection: false });
  } catch (error) {
    elements.loginError.textContent = error.message;
    elements.loginError.hidden = false;
  }
});

elements.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = elements.messageInput.value.trim();
  if (!text || !state.selectedThreadId || state.sending) return;
  state.sending = true;
  elements.sendButton.disabled = true;
  setStatus("Sending…");
  const payload = mutation("user_message", { message_id: `web_msg_${crypto.randomUUID()}`, text });
  try {
    await api(`/api/threads/${encodeURIComponent(state.selectedThreadId)}/events`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    elements.messageInput.value = "";
    await loadThreads();
    setStatus("Sent and synced with your phone.");
  } catch (error) {
    setStatus(`Message kept in the composer: ${error.message}`, "error");
  } finally {
    state.sending = false;
    elements.sendButton.disabled = false;
  }
});

elements.deleteThread.addEventListener("click", async () => {
  if (!state.selectedThreadId || !confirm("Delete this thread everywhere?")) return;
  setStatus("Deleting thread…");
  try {
    await api(`/api/threads/${encodeURIComponent(state.selectedThreadId)}/events`, {
      method: "POST",
      body: JSON.stringify(mutation("thread_deleted", { reason: "web_user_request" })),
    });
    state.selectedThreadId = null;
    elements.composer.hidden = true;
    elements.deleteThread.hidden = true;
    elements.threadTitle.textContent = "Select a thread";
    await loadThreads({ preserveSelection: false });
  } catch (error) {
    setStatus(`Could not delete: ${error.message}`, "error");
  }
});

elements.refreshThreads.addEventListener("click", () => loadThreads());
elements.threadSearch.addEventListener("input", renderThreadList);
elements.mobileThreadButton.addEventListener("click", () => {
  elements.dashboardView.dataset.sidebarOpen = String(elements.dashboardView.dataset.sidebarOpen !== "true");
});
elements.logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } finally {
    showLogin();
  }
});

async function bootstrap() {
  try {
    const session = await api("/api/session");
    showDashboard(session);
    await loadThreads({ preserveSelection: false });
  } catch {
    showLogin();
  }
}

bootstrap();

setInterval(() => {
  if (!elements.dashboardView.hidden && !document.hidden && !state.sending) {
    loadThreads();
  }
}, 5_000);
