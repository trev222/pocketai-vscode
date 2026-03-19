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

  .endpoint-card {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
    position: relative;
  }
  .endpoint-card.active { border-color: var(--accent); }
  .endpoint-name { font-weight: 600; font-size: 13px; }
  .endpoint-url { font-size: 11px; color: var(--fg-muted); word-break: break-all; margin-top: 2px; }
  .endpoint-status { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .dot.green { background: #4ec9b0; }
  .dot.red { background: #f14c4c; }
  .endpoint-actions { display: flex; gap: 6px; margin-top: 8px; }
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

  .add-form {
    border: 1px dashed var(--border);
    border-radius: 6px;
    padding: 10px;
    margin-top: 8px;
  }
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
  .add-form button {
    padding: 6px 12px;
    background: var(--btn-bg);
    color: var(--btn-fg);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .add-form button:hover { background: var(--btn-hover); }

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
  <h2>PocketAI</h2>
  <button class="open-chat-btn" id="openChatBtn">Open Chat Panel</button>

  <h3>Endpoints</h3>
  <div id="endpointsList"></div>
  <div class="add-form">
    <input type="text" id="newName" placeholder="Name (e.g. Home Server)" />
    <input type="text" id="newUrl" placeholder="URL (e.g. http://192.168.1.50:11434)" />
    <button id="addEndpointBtn">Add Endpoint</button>
  </div>
  <p class="hint">Add multiple PocketAI instances running on different machines. The active endpoint is used for chat.</p>

  <div class="divider"></div>

<script>
  const vscode = acquireVsCodeApi();

  const endpointsList = document.getElementById("endpointsList");
  const addBtn = document.getElementById("addEndpointBtn");
  const newNameInput = document.getElementById("newName");
  const newUrlInput = document.getElementById("newUrl");
  const openChatBtn = document.getElementById("openChatBtn");
  let currentState = null;

  openChatBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "openChat" });
  });

  addBtn.addEventListener("click", () => {
    const name = newNameInput.value.trim();
    const url = newUrlInput.value.trim();
    if (!name || !url) return;
    vscode.postMessage({ type: "addEndpoint", name, url });
    newNameInput.value = "";
    newUrlInput.value = "";
  });

  function renderEndpoints(state) {
    endpointsList.innerHTML = "";
    for (const ep of state.endpoints) {
      const isActive = ep.url === state.activeEndpoint;
      const card = document.createElement("div");
      card.className = "endpoint-card" + (isActive ? " active" : "");

      const latency = ep.latencyMs ? ep.latencyMs + "ms" : "";
      const epModel = ep.model || "";
      const epMaxTokens = ep.maxTokens || 4096;
      const epSystemPrompt = ep.systemPrompt || "";

      // Build model options
      let modelOptions = '<option value="">Auto-detect</option>';
      for (const m of state.models || []) {
        const selected = m === epModel ? " selected" : "";
        modelOptions += '<option value="' + escapeHtml(m) + '"' + selected + '>' + escapeHtml(m) + '</option>';
      }

      card.innerHTML =
        '<div class="endpoint-name">' + escapeHtml(ep.name) + '</div>' +
        '<div class="endpoint-url">' + escapeHtml(ep.url) + '</div>' +
        '<div class="endpoint-status">' +
          '<span class="dot ' + (ep.healthy ? "green" : "red") + '"></span>' +
          (ep.healthy ? "Connected" : "Unreachable") +
          (latency ? " · " + latency : "") +
        '</div>' +
        '<div class="endpoint-actions">' +
          (isActive ? '<button disabled style="opacity:0.5">Active</button>' : '<button class="use-btn">Use</button>') +
          '<button class="refresh-btn">↻ Refresh Models</button>' +
          '<button class="remove-btn">Remove</button>' +
        '</div>' +
        '<div class="endpoint-settings">' +
          '<div class="setting-row">' +
            '<span class="setting-label">Model</span>' +
            '<select class="ep-model">' + modelOptions + '</select>' +
          '</div>' +
          '<div class="setting-row">' +
            '<span class="setting-label">Max Tokens</span>' +
            '<input type="number" class="ep-max-tokens" min="128" value="' + epMaxTokens + '" />' +
          '</div>' +
          '<div class="setting-row">' +
            '<span class="setting-label">System Prompt</span>' +
            '<input type="text" class="ep-system-prompt" value="' + escapeHtml(epSystemPrompt) + '" placeholder="Custom system prompt..." />' +
          '</div>' +
        '</div>';

      const useBtn = card.querySelector(".use-btn");
      if (useBtn) {
        useBtn.addEventListener("click", () => {
          vscode.postMessage({ type: "setActiveEndpoint", url: ep.url });
        });
      }
      card.querySelector(".remove-btn").addEventListener("click", () => {
        vscode.postMessage({ type: "removeEndpoint", url: ep.url });
      });
      card.querySelector(".refresh-btn").addEventListener("click", () => {
        vscode.postMessage({ type: "refreshEndpoints" });
      });

      card.querySelector(".ep-model").addEventListener("change", (e) => {
        vscode.postMessage({ type: "updateEndpointSetting", url: ep.url, key: "model", value: e.target.value });
      });
      card.querySelector(".ep-max-tokens").addEventListener("change", (e) => {
        const val = parseInt(e.target.value, 10);
        if (val >= 128) vscode.postMessage({ type: "updateEndpointSetting", url: ep.url, key: "maxTokens", value: val });
      });
      card.querySelector(".ep-system-prompt").addEventListener("change", (e) => {
        vscode.postMessage({ type: "updateEndpointSetting", url: ep.url, key: "systemPrompt", value: e.target.value });
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
      renderEndpoints(msg);
    }
  });
</script>
</body>
</html>`;
}
