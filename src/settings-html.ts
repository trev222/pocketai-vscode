export function getSettingsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --fg-muted: var(--vscode-descriptionForeground);
    --border: var(--vscode-panel-border, rgba(128,128,128,0.2));
    --accent: var(--vscode-textLink-foreground, #4fc1ff);
    --input-bg: var(--vscode-input-background);
    --input-border: var(--vscode-input-border, rgba(128,128,128,0.3));
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --danger: var(--vscode-errorForeground, #f14c4c);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 12px; }
  h2 { font-size: 14px; margin-bottom: 12px; font-weight: 600; }
  h3 { font-size: 12px; margin: 16px 0 8px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.5px; }

  .open-chat-btn {
    display: block;
    width: 100%;
    padding: 10px;
    background: var(--btn-bg);
    color: var(--btn-fg);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 16px;
  }
  .open-chat-btn:hover { background: var(--btn-hover); }

  .codex-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 16px;
    background: linear-gradient(180deg, rgba(128,128,128,0.06), rgba(128,128,128,0.02));
    overflow: hidden;
  }
  .codex-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 12px;
    cursor: pointer;
    user-select: none;
  }
  .codex-header:hover {
    background: rgba(128,128,128,0.05);
  }
  .codex-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .codex-subtitle { color: var(--fg-muted); line-height: 1.4; }
  .codex-card.collapsed .codex-header {
    align-items: center;
  }
  .codex-card.collapsed .codex-title {
    margin-bottom: 0;
  }
  .codex-card.collapsed .codex-subtitle,
  .codex-card.collapsed .codex-badge {
    display: none;
  }
  .codex-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .codex-badge {
    flex-shrink: 0;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--border);
    color: var(--fg-muted);
  }
  .codex-badge.connected {
    color: #4ec9b0;
    border-color: rgba(78,201,176,0.4);
    background: rgba(78,201,176,0.08);
  }
  .codex-badge.ready {
    color: var(--accent);
    border-color: rgba(79,193,255,0.35);
    background: rgba(79,193,255,0.08);
  }
  .codex-badge.warning {
    color: #d7ba7d;
    border-color: rgba(215,186,125,0.35);
    background: rgba(215,186,125,0.08);
  }
  .codex-badge.offline {
    color: var(--danger);
    border-color: rgba(241,76,76,0.35);
    background: rgba(241,76,76,0.08);
  }
  .codex-caret {
    font-size: 16px;
    color: var(--fg-muted);
    transition: transform 0.15s ease;
    line-height: 1;
    margin-top: 2px;
  }
  .codex-caret.open { transform: rotate(180deg); }
  .codex-body {
    display: none;
    padding: 0 12px 12px;
  }
  .codex-body.open { display: block; }
  .codex-status {
    margin-bottom: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(128,128,128,0.08);
    line-height: 1.4;
  }
  .codex-status.error {
    color: var(--danger);
    background: rgba(241,76,76,0.08);
  }
  .codex-meta {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
    margin-bottom: 12px;
  }
  .codex-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
  }
  .codex-meta-row span { color: var(--fg-muted); }
  .codex-meta-row strong {
    font-size: 12px;
    font-weight: 600;
    text-align: right;
  }
  .codex-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .codex-actions button {
    padding: 7px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
  }
  .codex-primary-btn {
    border: none;
    background: var(--btn-bg);
    color: var(--btn-fg);
    font-weight: 600;
  }
  .codex-primary-btn:hover { background: var(--btn-hover); }
  .codex-primary-btn:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .codex-secondary-btn {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg);
  }
  .codex-secondary-btn:hover { background: rgba(128,128,128,0.08); }
  .codex-secondary-btn:disabled {
    cursor: default;
    opacity: 0.5;
  }

  /* ── Endpoint card ── */
  .endpoint-card {
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 8px;
    position: relative;
    overflow: hidden;
  }
  .endpoint-card.active { border-color: var(--accent); }

  .endpoint-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px;
    cursor: pointer;
    user-select: none;
  }
  .endpoint-header:hover { background: rgba(128,128,128,0.05); }
  .endpoint-header-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .endpoint-name { font-weight: 600; font-size: 13px; }
  .endpoint-url { font-size: 11px; color: var(--fg-muted); word-break: break-all; }
  .endpoint-header-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 8px; }
  .endpoint-status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .endpoint-status-dot.green { background: #4ec9b0; }
  .endpoint-status-dot.red { background: #f14c4c; }
  .caret {
    font-size: 10px;
    color: var(--fg-muted);
    transition: transform 0.15s ease;
  }
  .caret.open { transform: rotate(180deg); }

  .endpoint-body {
    display: none;
    padding: 0 10px 10px;
  }
  .endpoint-body.open { display: block; }

  .endpoint-status-text { font-size: 11px; color: var(--fg-muted); margin-bottom: 8px; }

  .endpoint-actions { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .endpoint-actions button {
    font-size: 11px;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
  }
  .endpoint-actions button:hover { background: rgba(128,128,128,0.1); }
  .endpoint-actions .remove-btn { color: var(--danger); border-color: var(--danger); }
  .endpoint-actions .remove-btn:hover { background: rgba(241,76,76,0.1); }
  .endpoint-actions .confirm-remove-btn {
    color: var(--btn-fg);
    background: var(--danger);
    border-color: var(--danger);
    font-weight: 600;
  }
  .endpoint-actions .confirm-remove-btn:hover { opacity: 0.85; }
  .endpoint-actions .cancel-remove-btn {
    color: var(--fg-muted);
    border-color: var(--border);
  }

  .refresh-row { margin-bottom: 8px; }
  .refresh-row button {
    font-size: 11px;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
  }
  .refresh-row button:hover { background: rgba(128,128,128,0.1); }

  /* ── Add endpoint ── */
  .add-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 10px;
    margin-top: 8px;
    border: 1px dashed var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
  }
  .add-trigger:hover { background: rgba(128,128,128,0.05); color: var(--fg); border-color: var(--accent); }
  .add-trigger .plus-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--bg);
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
  }

  .add-form {
    border: 1px dashed var(--border);
    border-radius: 6px;
    padding: 10px;
    margin-top: 8px;
  }
  .add-form.hidden { display: none; }
  .add-form input {
    width: 100%;
    padding: 6px 8px;
    margin-bottom: 6px;
    background: var(--input-bg);
    color: var(--fg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
  }
  .add-form input:focus { outline: none; border-color: var(--accent); }
  .add-form-actions { display: flex; justify-content: space-between; gap: 6px; }
  .add-form-actions button {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .add-form-actions .add-submit-btn {
    background: var(--btn-bg);
    color: var(--btn-fg);
  }
  .add-form-actions .add-submit-btn:hover { background: var(--btn-hover); }
  .add-form-actions .add-submit-btn .plus-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--btn-fg);
    color: var(--btn-bg);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }
  .add-form-actions .add-cancel-btn {
    background: transparent;
    color: var(--fg-muted);
    border: 1px solid var(--border);
  }
  .add-form-actions .add-cancel-btn:hover { background: rgba(128,128,128,0.1); }

  .setting-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }
  .setting-label { font-size: 12px; color: var(--fg-muted); }
  .setting-row input, .setting-row select {
    width: 100%;
    padding: 6px 8px;
    background: var(--input-bg);
    color: var(--fg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
  }
  .setting-row input:focus, .setting-row select:focus { outline: none; border-color: var(--accent); }

  .endpoint-settings { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); }
  .endpoint-settings .setting-row { margin-bottom: 8px; }
  .endpoint-settings .setting-row:last-child { margin-bottom: 0; }
  .divider { border-top: 1px solid var(--border); margin: 16px 0; }
  .hint { font-size: 11px; color: var(--fg-muted); margin-top: 4px; }
</style>
</head>
<body>
  <h2>PocketAI Settings</h2>
  <button class="open-chat-btn" id="openChatBtn">Open Chat Panel</button>

  <h3>Codex</h3>
  <div class="codex-card collapsed" id="codexCard">
    <div class="codex-header">
      <div>
        <div class="codex-title">Connect to Codex</div>
        <div class="codex-subtitle">Use your Codex CLI account right from PocketAI. We'll add the endpoint, start the bridge, and switch to it for you.</div>
      </div>
      <div class="codex-header-right">
        <span class="codex-badge ready" id="codexBadge">Checking...</span>
        <span class="codex-caret" id="codexCaret">&#9662;</span>
      </div>
    </div>
    <div class="codex-body" id="codexBody">
      <div class="codex-status" id="codexStatus">Checking Codex status...</div>
      <div class="setting-row">
        <span class="setting-label">Reasoning</span>
        <select id="codexReasoningSelect"></select>
      </div>
      <div class="codex-meta">
        <div class="codex-meta-row"><span>CLI</span><strong id="codexCliStatus">Checking...</strong></div>
        <div class="codex-meta-row"><span>Account</span><strong id="codexAccountStatus">Checking...</strong></div>
        <div class="codex-meta-row"><span>Bridge</span><strong id="codexBridgeStatus">Not started</strong></div>
        <div class="codex-meta-row"><span>Endpoint</span><strong id="codexEndpointStatus">Not added yet</strong></div>
      </div>
      <div class="codex-actions">
        <button class="codex-primary-btn" id="connectCodexBtn">Connect to Codex</button>
        <button class="codex-secondary-btn" id="signInCodexBtn">Sign In</button>
        <button class="codex-secondary-btn" id="refreshCodexBtn">Refresh</button>
      </div>
      <p class="hint">This keeps Codex chat-first inside PocketAI for now. Other endpoints can continue using their existing tool-call flow.</p>
    </div>
  </div>

  <h3>Endpoints</h3>
  <div id="endpointsList"></div>

  <button class="add-trigger" id="addTriggerBtn">
    Add New Endpoint
    <span class="plus-icon">+</span>
  </button>

  <div class="add-form hidden" id="addForm">
    <input type="text" id="newName" placeholder="Name (e.g. Home Server)" />
    <input type="text" id="newUrl" placeholder="URL (e.g. http://192.168.1.50:39457)" />
    <div class="add-form-actions">
      <button class="add-submit-btn" id="addEndpointBtn">Add <span class="plus-icon">+</span></button>
      <button class="add-cancel-btn" id="addCancelBtn">Cancel</button>
    </div>
  </div>

  <p class="hint">Add multiple PocketAI instances running on different machines. The active endpoint is used for chat.</p>

  <div class="divider"></div>

<script>
  const vscode = acquireVsCodeApi();

  const endpointsList = document.getElementById("endpointsList");
  const addTriggerBtn = document.getElementById("addTriggerBtn");
  const addForm = document.getElementById("addForm");
  const addBtn = document.getElementById("addEndpointBtn");
  const addCancelBtn = document.getElementById("addCancelBtn");
  const newNameInput = document.getElementById("newName");
  const newUrlInput = document.getElementById("newUrl");
  const openChatBtn = document.getElementById("openChatBtn");
  const codexCard = document.getElementById("codexCard");
  const codexBadge = document.getElementById("codexBadge");
  const codexHeader = document.querySelector(".codex-header");
  const codexBody = document.getElementById("codexBody");
  const codexCaret = document.getElementById("codexCaret");
  const codexStatus = document.getElementById("codexStatus");
  const codexCliStatus = document.getElementById("codexCliStatus");
  const codexAccountStatus = document.getElementById("codexAccountStatus");
  const codexBridgeStatus = document.getElementById("codexBridgeStatus");
  const codexEndpointStatus = document.getElementById("codexEndpointStatus");
  const codexReasoningSelect = document.getElementById("codexReasoningSelect");
  const connectCodexBtn = document.getElementById("connectCodexBtn");
  const signInCodexBtn = document.getElementById("signInCodexBtn");
  const refreshCodexBtn = document.getElementById("refreshCodexBtn");
  let currentState = null;
  const expandedEndpoints = new Set();
  let codexExpanded = false;

  openChatBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "openChat" });
  });
  connectCodexBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "connectCodex" });
  });
  signInCodexBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "signInCodex" });
  });
  refreshCodexBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "refreshCodexStatus" });
  });
  codexReasoningSelect.addEventListener("change", () => {
    vscode.postMessage({ type: "updateCodexReasoning", value: codexReasoningSelect.value });
  });
  codexHeader.addEventListener("click", () => {
    codexExpanded = !codexExpanded;
    codexCard.classList.toggle("collapsed", !codexExpanded);
    codexBody.classList.toggle("open", codexExpanded);
    codexCaret.classList.toggle("open", codexExpanded);
  });

  addTriggerBtn.addEventListener("click", () => {
    addTriggerBtn.style.display = "none";
    addForm.classList.remove("hidden");
    newNameInput.focus();
  });

  addCancelBtn.addEventListener("click", () => {
    addForm.classList.add("hidden");
    addTriggerBtn.style.display = "flex";
    newNameInput.value = "";
    newUrlInput.value = "";
  });

  addBtn.addEventListener("click", () => {
    const name = newNameInput.value.trim();
    const url = newUrlInput.value.trim();
    if (!name || !url) return;
    vscode.postMessage({ type: "addEndpoint", name, url });
    newNameInput.value = "";
    newUrlInput.value = "";
    addForm.classList.add("hidden");
    addTriggerBtn.style.display = "flex";
  });

  function renderCodex(state) {
    const codex = state.codex || {};
    const models = Array.isArray(codex.models) ? codex.models : [];
    const isConnected = !!(codex.available && codex.loggedIn && codex.endpointActive && codex.endpointHealthy);
    const isReady = !!(codex.available && codex.loggedIn && codex.bridgeRunning);

    let badgeLabel = "Connect";
    let badgeClass = "ready";
    if (codex.busy) {
      badgeLabel = "Working";
      badgeClass = "ready";
    } else if (isConnected) {
      badgeLabel = "Connected";
      badgeClass = "connected";
    } else if (!codex.available) {
      badgeLabel = "Not Found";
      badgeClass = "offline";
    } else if (!codex.loggedIn) {
      badgeLabel = "Sign In";
      badgeClass = "warning";
    } else if (isReady) {
      badgeLabel = "Ready";
      badgeClass = "ready";
    }

    codexBadge.textContent = badgeLabel;
    codexBadge.className = "codex-badge " + badgeClass;

    const statusText = codex.status || "One click will add the endpoint and start Codex for you.";
    codexStatus.textContent = statusText;
    codexStatus.className = "codex-status" + (codex.error ? " error" : "");

    codexCliStatus.textContent = codex.available ? "Detected" : "Not found";
    codexAccountStatus.textContent = codex.available
      ? (codex.loginLabel || (codex.loggedIn ? "Logged in" : "Sign in required"))
      : "Unavailable";
    codexBridgeStatus.textContent = codex.bridgeRunning
      ? "Running on 127.0.0.1:39458"
      : "Not started";
    codexEndpointStatus.textContent = codex.endpointActive
      ? (codex.endpointHealthy ? "Active and healthy" : "Active")
      : codex.endpointConfigured
        ? "Saved"
        : "Not added yet";

    connectCodexBtn.textContent = codex.busy
      ? "Connecting..."
      : isConnected && models.length > 0
        ? "Connected"
        : "Connect to Codex";
    connectCodexBtn.disabled = !!codex.busy || (isConnected && models.length > 0) || !codex.available;

    signInCodexBtn.style.display = codex.loggedIn ? "none" : "inline-flex";
    signInCodexBtn.disabled = !!codex.busy || !codex.available;
    refreshCodexBtn.disabled = !!codex.busy;

    const defaultModel = models.find(model => model.isDefault) || models[0];
    const effectiveModelId = defaultModel ? defaultModel.id : "";
    const reasoningModel = models.find(model => model.id === effectiveModelId) || defaultModel;
    const reasoningOptions = reasoningModel?.supportedReasoningEfforts || [];
    let reasoningHtml = '<option value="">Auto</option>';
    for (const option of reasoningOptions) {
      const selected = option.reasoningEffort === codex.selectedReasoningEffort ? " selected" : "";
      reasoningHtml += '<option value="' + escapeHtml(option.reasoningEffort) + '"' + selected + '>' + escapeHtml(option.reasoningEffort) + '</option>';
    }
    codexReasoningSelect.innerHTML = reasoningHtml;
    codexReasoningSelect.disabled =
      !!codex.busy || !codex.available || !reasoningModel || reasoningOptions.length === 0;
  }

  function renderEndpoints(state) {
    endpointsList.innerHTML = "";
    for (const ep of state.endpoints) {
      const isActive = ep.url === state.activeEndpoint;
      const isProtectedEndpoint = ep.name === "Local PocketAI";
      const card = document.createElement("div");
      card.className = "endpoint-card" + (isActive ? " active" : "");

      const latency = ep.latencyMs ? ep.latencyMs + "ms" : "";
      const epApiKey = ep.apiKey || "";

      // Header (always visible, click to expand/collapse)
      const header = document.createElement("div");
      header.className = "endpoint-header";
      header.innerHTML =
        '<div class="endpoint-header-left">' +
          '<div class="endpoint-name">' + escapeHtml(ep.name) + '</div>' +
          '<div class="endpoint-url">' + escapeHtml(ep.url) + '</div>' +
        '</div>' +
        '<div class="endpoint-header-right">' +
          '<span class="endpoint-status-dot ' + (ep.healthy ? "green" : "red") + '"></span>' +
          '<span class="caret">&#9662;</span>' +
        '</div>';
      card.appendChild(header);

      // Body (collapsible, default collapsed)
      const body = document.createElement("div");
      body.className = "endpoint-body";

      body.innerHTML =
        '<div class="endpoint-status-text">' +
          (ep.healthy ? "Connected" : "Unreachable") +
          (latency ? " &middot; " + latency : "") +
        '</div>' +
        '<div class="endpoint-actions">' +
          (isActive ? '<button disabled style="opacity:0.5">Active</button>' : '<button class="use-btn">Use</button>') +
          (isProtectedEndpoint ? '' : '<button class="remove-btn">Remove</button>') +
        '</div>' +
        '<div class="refresh-row">' +
          '<button class="refresh-btn">&#8635; Refresh Models</button>' +
        '</div>' +
        '<div class="endpoint-settings">' +
          '<div class="setting-row">' +
            '<span class="setting-label">API Key</span>' +
            '<input type="password" class="ep-api-key" value="' + escapeHtml(epApiKey) + '" placeholder="Leave empty for local servers" />' +
          '</div>' +
        '</div>';

      card.appendChild(body);

      // Restore expand/collapse state
      const caret = header.querySelector(".caret");
      if (expandedEndpoints.has(ep.url)) {
        body.classList.add("open");
        caret.classList.add("open");
      }

      // Toggle expand/collapse
      header.addEventListener("click", () => {
        const isOpen = body.classList.toggle("open");
        caret.classList.toggle("open", isOpen);
        if (isOpen) {
          expandedEndpoints.add(ep.url);
        } else {
          expandedEndpoints.delete(ep.url);
        }
      });

      // Use button
      const useBtn = body.querySelector(".use-btn");
      if (useBtn) {
        useBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: "setActiveEndpoint", url: ep.url });
        });
      }

      // Remove button with confirmation
      const removeBtn = body.querySelector(".remove-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const actionsRow = removeBtn.parentElement;
          removeBtn.style.display = "none";

          const confirmBtn = document.createElement("button");
          confirmBtn.className = "confirm-remove-btn";
          confirmBtn.textContent = "Confirm Remove";
          confirmBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            vscode.postMessage({ type: "removeEndpoint", url: ep.url });
          });

          const cancelBtn = document.createElement("button");
          cancelBtn.className = "cancel-remove-btn";
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            confirmBtn.remove();
            cancelBtn.remove();
            removeBtn.style.display = "";
          });

          actionsRow.appendChild(confirmBtn);
          actionsRow.appendChild(cancelBtn);
        });
      }

      // Refresh models
      body.querySelector(".refresh-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: "refreshEndpoints" });
      });

      // Settings change handlers
      body.querySelector(".ep-api-key").addEventListener("change", (e) => {
        vscode.postMessage({ type: "updateEndpointSetting", url: ep.url, key: "apiKey", value: e.target.value });
      });

      endpointsList.appendChild(card);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "settingsState") {
      currentState = msg;
      renderCodex(msg);
      renderEndpoints(msg);
    }
  });
</script>
</body>
</html>`;
}
