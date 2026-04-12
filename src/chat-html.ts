import { getChatStyles } from "./chat-styles";
import { getChatScript } from "./chat-script";
import { DEFAULT_SESSION_TITLE } from "./constants";

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
        </div>
        <div class="session-title-wrap">
          <button class="session-title-btn" id="sessionTitleBtn" type="button" title="Rename chat">
            <span id="sessionLabel">${DEFAULT_SESSION_TITLE}</span>
          </button>
          <input class="session-title-input" id="sessionTitleInput" type="text" value="${DEFAULT_SESSION_TITLE}" maxlength="120" aria-label="Chat title" />
        </div>
        <div class="session-dropdown">
          <button class="session-trigger" id="sessionTrigger" type="button">
            <span class="history-icon">◷</span>
            <span>History</span>
            <span class="history-caret">▾</span>
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

    <!-- Harness activity -->
    <div class="harness-pane" id="harnessPane" style="display:none"></div>

    <!-- Approval dock -->
    <div class="approval-dock" id="approvalDock" style="display:none"></div>

    <!-- Composer -->
    <div class="composer">
      <div class="composer-inner">
        <div class="at-mention-dropdown" id="atMentionDropdown"></div>
        <input id="attachmentInput" type="file" multiple style="display:none" />
        <div class="composer-surface">
          <div class="attachment-preview" id="attachmentPreview" style="display:none"></div>
          <div class="active-skills" id="activeSkills" style="display:none"></div>
          <div class="input-wrap" id="inputWrap">
            <textarea id="prompt" rows="1" placeholder="Ask PocketAI... (@ to mention files, paste or upload images/files)"></textarea>
          </div>
          <div class="composer-footer">
            <div class="composer-controls">
              <div class="composer-menu" id="attachMenuWrap">
                <button class="attach-btn" id="attachmentBtn" type="button" title="Add to message">+</button>
                <div class="composer-popout" id="attachMenu">
                  <button class="composer-menu-item" id="attachUploadAction" type="button">
                    <span class="composer-menu-item-title">Upload From Computer</span>
                    <span class="composer-menu-item-subtitle">Attach images or text-like files</span>
                  </button>
                </div>
              </div>
              <div class="composer-menu" id="modeMenuWrap">
                <button class="mode-trigger" id="modeTrigger" type="button" title="Change mode">
                  <span class="mode-trigger-label" id="modeTriggerLabel">Auto</span>
                  <span class="mode-trigger-icon">✎</span>
                </button>
                <div class="composer-popout" id="modeMenu">
                  <button class="composer-menu-item mode-menu-item" data-mode="ask" type="button">Ask</button>
                  <button class="composer-menu-item mode-menu-item" data-mode="auto" type="button">Auto</button>
                  <button class="composer-menu-item mode-menu-item" data-mode="plan" type="button">Plan</button>
                </div>
              </div>
              <div class="composer-models">
                <div class="composer-menu model-menu" id="modelMenuWrap">
                  <button class="model-trigger" id="modelTrigger" type="button" title="Choose model">
                    <span class="model-trigger-label" id="modelTriggerLabel">No models available</span>
                    <span class="model-trigger-caret">▾</span>
                  </button>
                  <div class="composer-popout model-popout" id="modelMenu"></div>
                </div>
                <div class="composer-menu reasoning-menu" id="reasoningMenuWrap" style="display:none">
                  <button class="model-trigger" id="reasoningTrigger" type="button" title="Choose reasoning effort">
                    <span class="model-trigger-label" id="reasoningTriggerLabel">Auto</span>
                    <span class="model-trigger-caret">▾</span>
                  </button>
                  <div class="composer-popout reasoning-popout" id="reasoningMenu"></div>
                </div>
                <select class="chat-model-select" id="modelSelect" title="Model for this chat" style="display:none"></select>
                <select class="chat-reasoning-select" id="reasoningSelect" title="Reasoning for this chat" style="display:none"></select>
              </div>
            </div>
            <div class="composer-actions">
              <div class="status-text" id="statusText"></div>
              <button class="send-btn" id="sendBtn" type="button" title="Send (Enter)">↑</button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <script nonce="${nonce}">${getChatScript(brandIconUri)}</script>
</body>
</html>`;
}
