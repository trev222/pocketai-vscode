import { getChatStyles } from "./chat-styles";
import { getChatScript } from "./chat-script";

export function getChatHtml(nonce: string, cspSource: string, brandIconUri: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PocketAI</title>
  <style>${getChatStyles()}</style>
</head>
<body>
  <div class="shell">

    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div class="header-brand">
          <img src="${brandIconUri}" alt="" />
          <span>PocketAI</span>
        </div>
        <div class="session-dropdown">
          <button class="session-trigger" id="sessionTrigger" type="button">
            <span id="sessionLabel">Chat 1</span>
            <span style="font-size:9px">▾</span>
          </button>
          <div class="session-menu" id="sessionMenu">
            <button class="session-new-btn" id="newSessionBtn" type="button">+ New Chat</button>
            <div id="sessionList"></div>
          </div>
        </div>
      </div>
      <div class="header-actions">
        <select class="endpoint-select" id="endpointSelect" title="Switch endpoint"></select>
        <button class="icon-btn" id="exportBtn" type="button" title="Export as Markdown">⤓</button>
      </div>
    </div>

    <!-- Session search -->
    <div class="session-search-wrap" id="sessionSearchWrap" style="display:none">
      <input type="text" class="session-search" id="sessionSearch" placeholder="Search sessions..." />
    </div>

    <!-- Project instructions badge -->
    <div class="project-instructions-badge" id="projectBadge" style="display:none">
      <span style="font-size:11px;color:var(--success);">&#9679;</span>
      <span>Project instructions loaded</span>
    </div>

    <!-- Resource warnings -->
    <div id="resourceWarnings"></div>

    <!-- Token usage bar (context meter) -->
    <div class="token-usage" id="tokenUsage" style="display:none">
      <span id="tokenText"></span>
      <div class="token-bar"><div class="token-bar-fill" id="tokenBarFill"></div></div>
    </div>

    <!-- Messages -->
    <div class="messages" id="messages"></div>

    <!-- Composer -->
    <div class="composer" style="position:relative;">
      <div class="at-mention-dropdown" id="atMentionDropdown"></div>
      <div class="image-preview" id="imagePreview" style="display:none"></div>
      <div class="input-wrap" id="inputWrap">
        <textarea id="prompt" rows="1" placeholder="Ask PocketAI... (@ to mention files, paste images)"></textarea>
        <button class="send-btn" id="sendBtn" type="button" title="Send (Enter)">↑</button>
      </div>
      <div class="composer-footer">
        <div class="composer-left">
          <div class="mode-selector" id="modeSelector">
            <button class="mode-btn active" data-mode="ask" title="Ask before making changes">Ask</button>
            <button class="mode-btn" data-mode="auto" title="Apply changes automatically">Auto</button>
            <button class="mode-btn" data-mode="plan" title="Plan changes without applying">Plan</button>
          </div>
        </div>
        <div class="status-text" id="statusText"></div>
      </div>
    </div>

  </div>

  <script nonce="${nonce}">${getChatScript(brandIconUri)}</script>
</body>
</html>`;
}
