/** Chat webview CSS styles */
export function getChatStyles(): string {
  return `
    /* ── Reset & Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, "Cascadia Code", Consolas, monospace;
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --fg-muted: var(--vscode-descriptionForeground, #969696);
      --border: var(--vscode-panel-border, rgba(255,255,255,0.08));
      --input-bg: var(--vscode-input-background, #2d2d2d);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --accent: #38bdf8;
      --accent-glow: rgba(56,189,248,0.25);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
      --code-bg: rgba(255,255,255,0.05);
      --hover-bg: rgba(255,255,255,0.04);
      --user-bg: rgba(56,189,248,0.10);
      --success: #4ec9b0;
      --warning: #d7ba7d;
      --error: #f14c4c;
      --neo-blue: #38bdf8;
    }

    html, body {
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.5;
    }

    /* ── Layout ── */
    .shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 10px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      min-height: 34px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .header-brand {
      display: flex;
      align-items: center;
    }

    .header-brand img {
      width: 18px;
      height: 18px;
      display: block;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .icon-btn {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg-muted);
      border-radius: 6px;
      cursor: pointer;
      font-size: 15px;
    }

    .icon-btn:hover {
      background: var(--hover-bg);
      color: var(--fg);
    }

    /* ── Session Dropdown ── */
    .session-dropdown {
      position: relative;
    }

    .session-title-wrap {
      display: flex;
      align-items: center;
      min-width: 0;
      flex: 0 1 auto;
    }

    .session-title-btn {
      max-width: 176px;
      border: none;
      background: transparent;
      color: var(--fg);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.2;
      padding: 2px 4px;
      border-radius: 6px;
      text-align: left;
      min-width: 0;
    }

    .session-title-btn span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-title-btn:hover {
      background: var(--hover-bg);
    }

    .session-title-btn.hidden {
      display: none;
    }

    .session-title-input {
      display: none;
      width: 180px;
      padding: 4px 7px;
      border: 1px solid rgba(56,189,248,0.35);
      border-radius: 6px;
      background: var(--input-bg);
      color: var(--fg);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      outline: none;
      box-shadow: 0 0 0 2px rgba(56,189,248,0.12);
    }

    .session-title-input.editing {
      display: block;
    }

    .session-trigger {
      display: flex;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 999px;
    }

    .session-trigger:hover {
      background: var(--hover-bg);
      color: var(--fg);
    }

    .history-icon,
    .history-caret {
      font-size: 10px;
      line-height: 1;
    }

    .session-menu {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      width: 260px;
      max-height: 300px;
      overflow-y: auto;
      background: var(--vscode-dropdown-background, #2d2d2d);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px;
      z-index: 100;
      box-shadow: 0 8px 30px rgba(0,0,0,0.4);
    }

    .session-menu.open { display: block; }

    .session-menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      border: none;
      background: transparent;
      color: var(--fg);
      width: 100%;
      text-align: left;
      font-size: 12px;
    }

    .session-menu-item:hover { background: var(--hover-bg); }
    .session-menu-item.active { background: rgba(56,189,248,0.1); }

    .session-menu-item .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .session-menu-item .delete-btn {
      width: 20px;
      height: 20px;
      border: none;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
      opacity: 0;
    }

    .session-menu-item:hover .delete-btn { opacity: 1; }
    .session-menu-item .delete-btn:hover { background: rgba(241,76,76,0.15); color: var(--error); }
    .session-menu-item .delete-btn:focus-visible { opacity: 1; }
    .session-menu-item.delete-confirming .delete-btn {
      opacity: 1;
    }
    .session-menu-item .delete-btn.confirm {
      width: auto;
      min-width: 58px;
      padding: 0 8px;
      background: rgba(241,76,76,0.15);
      color: var(--error);
      border: 1px solid rgba(241,76,76,0.28);
      font-size: 11px;
      font-weight: 600;
    }

    .session-new-btn {
      width: 100%;
      padding: 6px 8px;
      border: 1px dashed var(--border);
      border-radius: 4px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .session-new-btn:hover { background: var(--hover-bg); color: var(--fg); }

    /* ── Messages Area ── */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-track { background: transparent; }
    .messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

    /* ── Empty State ── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
      padding: 24px;
      gap: 12px;
    }

    .empty-state img { width: 40px; height: 40px; opacity: 0.5; }
    .empty-state h2 { font-size: 15px; font-weight: 600; color: var(--fg); }
    .empty-state p { font-size: 12px; color: var(--fg-muted); max-width: 280px; line-height: 1.5; }

    .empty-diag {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--fg-muted);
      background: var(--code-bg);
      padding: 8px 12px;
      border-radius: 6px;
      text-align: left;
      max-width: 300px;
      word-break: break-all;
    }

    .resource-warning {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 6px 10px;
      margin: 4px 12px;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.4;
    }

    .resource-warning.memory-warning {
      background: rgba(215,186,125,0.1);
      border: 1px solid rgba(215,186,125,0.25);
      color: var(--warning);
    }

    .resource-warning.storage-warning {
      background: rgba(241,76,76,0.08);
      border: 1px solid rgba(241,76,76,0.2);
      color: var(--error);
    }

    .resource-warning-icon { flex-shrink: 0; font-size: 13px; }

    /* ── Message Entries ── */
    .msg {
      margin-bottom: 4px;
      padding: 10px 12px;
      border-radius: 6px;
      position: relative;
      animation: fadeIn 0.15s ease;
    }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

    .msg-user {
      background: var(--user-bg);
      border: 1px solid rgba(56,189,248,0.12);
      border-radius: 8px;
    }

    .msg-assistant { background: transparent; }
    .msg-has-stats { padding-right: 152px; }

    .msg-tool {
      background: rgba(78,201,176,0.06);
      border: 1px solid rgba(78,201,176,0.12);
      font-size: 12px;
    }

    .msg-activity-group,
    .msg-tool-compact {
      background: transparent;
      border: 0;
      padding: 2px 0;
      margin-bottom: 2px;
    }

    .msg-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .msg-user .msg-label { color: var(--neo-blue); }
    .msg-assistant .msg-label { color: var(--accent); }
    .msg-tool .msg-label { color: var(--success); }

    .msg-body {
      color: var(--fg);
      line-height: 1.6;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    /* ── Markdown rendering ── */
    .msg-body p { margin: 0 0 6px; }
    .msg-body p:last-child { margin-bottom: 0; }
    .msg-body p:empty { display: none; }
    .msg-body h1, .msg-body h2, .msg-body h3 { margin: 12px 0 6px; font-weight: 600; }
    .msg-body h1 { font-size: 16px; }
    .msg-body h2 { font-size: 14px; }
    .msg-body h3 { font-size: 13px; }
    .msg-body strong { font-weight: 600; }
    .msg-body em { font-style: italic; }
    .msg-body del { text-decoration: line-through; opacity: 0.7; }
    .msg-body ul, .msg-body ol { padding-left: 18px; margin: 0 0 6px; }
    .msg-body li { margin: 0; }

    .msg-body blockquote {
      border-left: 3px solid var(--accent);
      margin: 4px 0;
      padding: 2px 10px;
      color: var(--fg-muted);
    }

    .msg-body .file-link {
      color: var(--accent);
      text-decoration: none;
      border-bottom: 1px dotted var(--accent);
      cursor: pointer;
    }

    .msg-body .file-link:hover {
      border-bottom-style: solid;
    }

    .msg-body .ext-link {
      color: var(--accent);
      text-decoration: underline;
      cursor: pointer;
    }

    .msg-body code {
      font-family: var(--font-mono);
      font-size: 12px;
      background: var(--code-bg);
      padding: 1px 5px;
      border-radius: 3px;
    }

    .msg-body .code-block {
      position: relative;
      margin: 8px 0;
      border-radius: 6px;
      border: 1px solid var(--border);
      overflow: hidden;
    }

    .msg-body .code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-muted);
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid var(--border);
    }

    .msg-body .code-actions { display: flex; gap: 4px; }

    .code-action-btn {
      font-family: var(--font-sans);
      font-size: 11px;
      padding: 2px 8px;
      border: 1px solid var(--border);
      border-radius: 3px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
    }

    .code-action-btn:hover { background: var(--hover-bg); color: var(--fg); }

    .msg-body pre {
      margin: 0;
      padding: 10px 12px;
      background: rgba(0,0,0,0.2);
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.5;
      color: var(--fg);
    }

    .msg-body pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
      font-size: inherit;
    }

    /* ── Syntax highlighting ── */
    .sh-keyword { color: #c586c0; }
    .sh-string { color: #ce9178; }
    .sh-comment { color: #6a9955; font-style: italic; }
    .sh-number { color: #b5cea8; }

    /* ── Tool Call UI ── */
    .tool-call-card {
      margin: 6px 0;
      border: 0;
      border-radius: 0;
      overflow: visible;
      background: transparent;
    }

    .tool-call-card.activity-variant-thought .tool-call-dot {
      background: rgba(255,255,255,0.28);
      box-shadow: 0 0 0 4px rgba(255,255,255,0.025);
    }

    .tool-call-card.activity-variant-thought .tool-call-verb {
      color: var(--fg-muted);
      font-weight: 600;
    }

    .tool-call-card.activity-variant-thought .tool-call-path {
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--fg);
    }

    .tool-call-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: rgba(255,255,255,0.03);
      font-size: 12px;
      gap: 8px;
    }

    .tool-call-header-inline {
      align-items: flex-start;
      justify-content: flex-start;
      gap: 0;
      padding: 0;
      background: transparent;
    }

    .tool-call-type {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--success);
      font-weight: 600;
    }

    .tool-call-path {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .tool-call-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }

    .tool-call-line {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      line-height: 1.3;
    }

    .tool-call-dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      flex-shrink: 0;
      margin-top: 1px;
      background: rgba(255,255,255,0.22);
    }

    .tool-call-dot.pending { background: rgba(215,186,125,0.9); }
    .tool-call-dot.executed { background: rgba(78,201,176,0.9); }
    .tool-call-dot.error { background: rgba(241,76,76,0.9); }
    .tool-call-dot.rejected { background: rgba(241,76,76,0.7); }
    .tool-call-dot.approved { background: rgba(78,201,176,0.75); }

    .tool-call-verb {
      color: var(--fg);
      font-weight: 650;
      font-size: 13px;
      flex-shrink: 0;
    }

    .tool-call-inline-code {
      font-family: var(--font-mono);
      color: var(--fg-muted);
      font-size: 12px;
    }

    .tool-call-meta {
      color: var(--fg-muted);
      font-size: 12px;
      line-height: 1.45;
      padding-left: 19px;
    }

    .tool-call-secondary {
      color: rgba(255,255,255,0.42);
      font-size: 11px;
      line-height: 1.35;
      padding-left: 19px;
      font-family: var(--font-mono);
    }

    .tool-call-actions { display: flex; gap: 4px; }

    .tool-btn {
      font-size: 11px;
      padding: 2px 10px;
      border-radius: 3px;
      border: 1px solid var(--border);
      cursor: pointer;
      font-family: var(--font-sans);
    }

    .tool-btn-approve {
      background: rgba(78,201,176,0.12);
      color: var(--success);
      border-color: rgba(78,201,176,0.3);
    }

    .tool-btn-approve:hover { background: rgba(78,201,176,0.2); }

    .tool-btn-reject {
      background: rgba(241,76,76,0.08);
      color: var(--error);
      border-color: rgba(241,76,76,0.2);
    }

    .tool-btn-reject:hover { background: rgba(241,76,76,0.15); }

    .tool-call-result {
      padding: 6px 10px;
      font-size: 11px;
      color: var(--fg-muted);
      border-top: 1px solid var(--border);
      line-height: 1.5;
    }

    .tool-details-shell {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .tool-details-summary {
      color: var(--fg);
      font-size: 12px;
      line-height: 1.55;
    }

    .tool-details-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(255,255,255,0.03);
      color: var(--fg-muted);
      cursor: pointer;
      font-size: 11px;
      line-height: 1;
    }

    .tool-details-toggle:hover {
      background: var(--hover-bg);
      color: var(--fg);
    }

    .tool-details-content {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 8px;
      background: rgba(0,0,0,0.12);
    }

    .activity-details {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding-left: 19px;
      margin-top: 2px;
    }

    .msg-tool .tool-details-content {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-muted);
    }

    .batch-actions {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 4px;
    }

    .tool-result-expand {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 8px;
      font-size: 10px;
      color: var(--accent);
      background: transparent;
      border: 1px solid var(--accent);
      border-radius: 3px;
      cursor: pointer;
    }

    .tool-result-expand:hover {
      background: rgba(0,120,212,0.1);
    }

    .tool-status {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
    }

    .tool-status.executed { background: rgba(78,201,176,0.15); color: var(--success); }
    .tool-status.rejected { background: rgba(241,76,76,0.1); color: var(--error); }
    .tool-status.error { background: rgba(241,76,76,0.1); color: var(--error); }

    .thinking-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      color: var(--fg-muted);
      font-size: 12px;
    }

    .thinking-dots span {
      display: inline-block;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--fg-muted);
      animation: thinking 1.4s ease-in-out infinite;
      margin: 0 1px;
    }

    .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
    .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes thinking { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }

    /* ── Harness Pane ── */
    .harness-pane {
      display: none;
      padding: 8px 12px 0;
      gap: 8px;
      flex-direction: column;
      flex-shrink: 0;
    }

    .harness-pane.active {
      display: flex;
    }

    .approval-dock {
      display: none;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 96px;
      padding: 0 20px;
      justify-content: center;
      pointer-events: none;
      z-index: 60;
    }

    .approval-dock.active {
      display: flex;
    }

    .approval-dock-shell {
      position: relative;
      width: min(100%, 640px);
      pointer-events: auto;
    }

    .approval-dock-stack {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .approval-dock-stack-layer {
      position: absolute;
      left: 18px;
      right: 18px;
      height: 100%;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.05);
      background: rgba(255,255,255,0.03);
      box-shadow: 0 18px 40px rgba(0,0,0,0.18);
    }

    .approval-dock-stack-layer.layer-1 {
      top: 10px;
      opacity: 0.55;
    }

    .approval-dock-stack-layer.layer-2 {
      top: 20px;
      left: 32px;
      right: 32px;
      opacity: 0.28;
    }

    .approval-dock-card {
      position: relative;
      border: 1px solid rgba(215,186,125,0.28);
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(255,248,220,0.08), rgba(255,248,220,0.03));
      padding: 14px 16px;
      box-shadow: 0 18px 46px rgba(0,0,0,0.28);
      backdrop-filter: blur(8px);
    }

    .approval-dock-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .approval-dock-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .approval-dock-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .approval-dock-copy {
      font-size: 13px;
      color: var(--fg);
    }

    .approval-dock-title {
      font-size: 19px;
      line-height: 1.25;
      font-weight: 650;
      color: var(--fg);
    }

    .approval-dock-info {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .approval-dock-top {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .approval-dock-type {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--success);
      font-weight: 600;
      text-transform: lowercase;
    }

    .approval-dock-note {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      color: var(--fg-muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .approval-dock-path {
      min-width: 0;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--fg-muted);
      white-space: pre-wrap;
      word-break: break-word;
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,0,0,0.14);
    }

    .approval-dock-subject {
      font-size: 13px;
      color: var(--fg);
    }

    .approval-dock-detail {
      margin-top: 8px;
      font-size: 12px;
      color: var(--fg-muted);
    }

    .approval-dock-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      flex-shrink: 0;
      margin-top: 12px;
    }

    .approval-dock-primary-actions .tool-btn {
      min-width: 90px;
      padding-top: 6px;
      padding-bottom: 6px;
      font-size: 12px;
      border-radius: 8px;
    }

    .approval-dock-secondary-actions {
      margin-top: 8px;
    }

    .harness-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: rgba(255,255,255,0.03);
      padding: 8px 10px;
    }

    .harness-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .harness-card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .harness-card-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--fg);
    }

    .harness-card-copy {
      font-size: 12px;
      color: var(--fg-muted);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .harness-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .harness-badge.pending {
      background: rgba(56,189,248,0.12);
      color: var(--accent);
    }

    .harness-badge.running {
      background: rgba(215,186,125,0.14);
      color: var(--warning);
    }

    .harness-badge.in_progress {
      background: rgba(215,186,125,0.14);
      color: var(--warning);
    }

    .harness-badge.completed {
      background: rgba(78,201,176,0.14);
      color: var(--success);
    }

    .harness-badge.failed {
      background: rgba(241,76,76,0.14);
      color: var(--error);
    }

    .harness-badge.interrupted {
      background: rgba(215,186,125,0.14);
      color: var(--warning);
    }

    .harness-badge.warning {
      background: rgba(215,186,125,0.14);
      color: var(--warning);
    }

    .harness-badge.error {
      background: rgba(241,76,76,0.14);
      color: var(--error);
    }

    .harness-badge.ok {
      background: rgba(78,201,176,0.14);
      color: var(--success);
    }

    .harness-badge.cancelled {
      background: rgba(255,255,255,0.1);
      color: var(--fg-muted);
    }

    .harness-card-meta {
      margin-top: 6px;
      font-size: 11px;
      color: var(--fg-muted);
    }

    .harness-card-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .harness-task-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }

    .harness-task-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.05);
    }

    .harness-task-row:first-child {
      padding-top: 0;
      border-top: none;
    }

    @media (max-width: 760px) {
      .approval-dock {
        bottom: 88px;
        padding: 0 12px;
      }

      .approval-dock-card {
        padding: 12px;
      }

      .approval-dock-title {
        font-size: 16px;
      }

      .approval-dock-actions {
        width: 100%;
      }

      .approval-dock-primary-actions .tool-btn,
      .approval-dock-secondary-actions .tool-btn {
        flex: 1 1 auto;
      }
    }

    .harness-task-actions {
      display: flex;
      gap: 6px;
      margin-top: 2px;
    }

    .harness-task-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .harness-task-command {
      min-width: 0;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .harness-task-preview {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-muted);
      white-space: pre-wrap;
      word-break: break-word;
      background: rgba(0,0,0,0.12);
      border: 1px solid rgba(255,255,255,0.04);
      border-radius: 6px;
      padding: 6px 8px;
    }

    .harness-health-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
    }

    .harness-health-item {
      font-size: 12px;
      color: var(--fg);
      padding-left: 12px;
      position: relative;
    }

    .harness-health-item::before {
      content: "•";
      position: absolute;
      left: 0;
      color: var(--warning);
    }

    .harness-todo-content {
      min-width: 0;
      font-size: 12px;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .harness-todo-row.completed .harness-todo-content {
      color: var(--fg-muted);
      text-decoration: line-through;
    }

    /* ── Think blocks ── */
    .think-block {
      margin: 6px 0;
      border-left: 3px solid var(--fg-muted);
      border-radius: 4px;
      background: color-mix(in srgb, var(--fg-muted) 8%, transparent);
      overflow: hidden;
    }
    .think-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      cursor: pointer;
      user-select: none;
      font-size: 12px;
      color: var(--fg-muted);
    }
    .think-toggle:hover { background: color-mix(in srgb, var(--fg-muted) 6%, transparent); }
    .think-toggle .think-icon {
      display: inline-block;
      transition: transform 0.15s ease;
      font-size: 10px;
    }
    .think-block.open .think-icon { transform: rotate(90deg); }
    .think-content {
      display: none;
      padding: 4px 10px 8px;
      font-size: 12px;
      color: var(--fg-muted);
      line-height: 1.5;
    }
    .think-block.open .think-content { display: block; }

    /* ── Composer (Input Area) ── */
    .composer {
      display: flex;
      justify-content: center;
      flex-shrink: 0;
      border-top: 1px solid var(--border);
      padding: 5px 10px 7px;
      position: relative;
    }

    .composer-inner {
      flex: 0 1 720px;
      width: min(100%, 720px);
      max-width: 720px;
      margin: 0 auto;
      position: relative;
    }

    .composer-surface {
      width: 100%;
      border: 1px solid var(--input-border);
      border-radius: 16px;
      background: var(--input-bg);
      transition: border-color 0.15s, box-shadow 0.15s;
      overflow: visible;
    }

    .composer-surface:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent-glow);
    }

    .active-skills {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin: 0 10px 8px;
      padding: 8px 10px;
      border: 1px solid rgba(56,189,248,0.18);
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(56,189,248,0.08), rgba(56,189,248,0.03));
    }

    .active-skills-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      flex-shrink: 0;
    }

    .active-skills-list {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
      flex: 1;
    }

    .active-skill-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      min-height: 28px;
      padding: 5px 8px 5px 10px;
      border: 1px solid rgba(56,189,248,0.18);
      border-radius: 999px;
      background: rgba(255,255,255,0.04);
      color: var(--fg);
    }

    .active-skill-name {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }

    .active-skill-note {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      color: var(--fg-muted);
      font-size: 11px;
    }

    .active-skill-remove,
    .active-skills-clear {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      border-radius: 999px;
      font-size: 11px;
      line-height: 1;
    }

    .active-skill-remove {
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .active-skills-clear {
      padding: 5px 10px;
      flex-shrink: 0;
    }

    .active-skill-remove:hover,
    .active-skills-clear:hover {
      background: rgba(255,255,255,0.06);
      color: var(--fg);
    }

    .composer-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(255,255,255,0.06);
      padding: 8px 10px 9px;
      gap: 10px;
      flex-wrap: wrap;
      width: 100%;
    }

    .composer-controls {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1 1 auto;
      min-width: 0;
      flex-wrap: wrap;
    }

    .composer-models {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex-wrap: wrap;
    }

    .model-menu,
    .reasoning-menu {
      min-width: 0;
      max-width: 120px;
      flex: 0 1 120px;
    }

    .composer-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 0 1 auto;
      min-width: 0;
      margin-left: auto;
    }

    .composer-menu {
      position: relative;
      flex-shrink: 0;
    }

    .composer-popout {
      display: none;
      position: absolute;
      left: 0;
      bottom: calc(100% + 8px);
      min-width: 210px;
      padding: 6px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--vscode-dropdown-background, #252526);
      box-shadow: 0 12px 30px rgba(0,0,0,0.35);
      z-index: 220;
    }

    .model-popout {
      min-width: 240px;
      max-width: 420px;
    }

    .reasoning-popout {
      min-width: 150px;
      max-width: 220px;
    }

    .composer-popout.open {
      display: block;
    }

    .composer-menu-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
      padding: 8px 10px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--fg);
      text-align: left;
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: 12px;
    }

    .composer-menu-item:hover {
      background: var(--hover-bg);
    }

    .composer-menu-item:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .composer-menu-item.active {
      background: rgba(56,189,248,0.12);
      color: var(--neo-blue);
    }

    .mode-menu-item,
    .model-popout .composer-menu-item,
    .reasoning-popout .composer-menu-item {
      display: block;
      white-space: normal;
      word-break: break-word;
    }

    .composer-menu-item-title {
      font-size: 12px;
      font-weight: 600;
    }

    .composer-menu-item-subtitle {
      font-size: 11px;
      color: var(--fg-muted);
    }

    .mode-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: transparent;
      color: var(--fg);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: 11px;
      transition: background 0.1s, color 0.1s, border-color 0.1s;
    }

    .mode-trigger:hover {
      background: var(--hover-bg);
      color: var(--fg);
    }

    .mode-trigger:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .mode-trigger-label {
      font-size: 12px;
      font-weight: 600;
    }

    .mode-trigger-icon {
      font-size: 12px;
      color: var(--fg-muted);
      line-height: 1;
    }

    .model-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--input-bg);
      color: var(--input-fg);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: 11px;
      transition: background 0.1s, color 0.1s, border-color 0.1s;
    }

    .model-trigger:hover {
      background: var(--hover-bg);
      color: var(--fg);
    }

    .model-trigger:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .model-trigger-label {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 500;
      flex: 1 1 auto;
      text-align: left;
    }

    .model-trigger-caret {
      font-size: 11px;
      color: var(--fg-muted);
      line-height: 1;
      flex-shrink: 0;
    }

    .status-text {
      display: none;
      font-size: 11px;
      color: var(--fg-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 0 1 240px;
      min-width: 0;
      text-align: right;
    }

    .chat-model-select,
    .chat-reasoning-select {
      font-family: var(--font-sans);
      font-size: 11px;
      padding: 3px 28px 3px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--input-bg);
      color: var(--input-fg);
      outline: none;
      cursor: pointer;
      min-width: 150px;
      max-width: 220px;
      flex: 0 0 auto;
    }

    .chat-reasoning-select {
      min-width: 132px;
      max-width: 160px;
    }

    .chat-model-select:focus,
    .chat-reasoning-select:focus { border-color: var(--accent); }
    .chat-model-select:disabled,
    .chat-reasoning-select:disabled { opacity: 0.55; cursor: default; }

    @media (max-width: 640px) {
      .composer-controls {
        width: 100%;
      }

      .composer-popout {
        left: 0;
        right: auto;
        min-width: 190px;
      }

      .composer-actions {
        width: 100%;
        margin-left: 0;
      }

      .status-text {
        display: none;
      }
    }

    .input-wrap {
      display: flex;
      align-items: stretch;
      width: 100%;
      max-width: none;
      margin: 0;
      border: none;
      background: transparent;
      padding: 10px 12px 10px 12px;
    }

    .input-wrap textarea {
      display: block;
      width: 100%;
      border: none;
      background: transparent;
      color: var(--input-fg);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      outline: none;
      min-height: 22px;
      max-height: 200px;
      overflow-y: auto;
    }

    .input-wrap textarea::placeholder { color: var(--fg-muted); }

    .attach-btn {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 22px;
      line-height: 1;
      padding: 0;
      transition: background 0.15s, color 0.15s;
    }

    .attach-btn:hover {
      background: var(--hover-bg);
      color: var(--fg);
    }

    .attach-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .send-btn {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 9px;
      background: var(--accent);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s;
      font-size: 14px;
    }

    .send-btn:hover { opacity: 0.85; }
    .send-btn:disabled { opacity: 0.35; cursor: default; }

    .cancel-btn {
      width: 28px;
      height: 28px;
      border: 1px solid rgba(241,76,76,0.3);
      border-radius: 6px;
      background: rgba(241,76,76,0.1);
      color: var(--error);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 12px;
    }

    .cancel-btn:hover { background: rgba(241,76,76,0.2); }

    /* ── Endpoint selector ── */
    .endpoint-select {
      font-family: var(--font-sans);
      font-size: 11px;
      height: 30px;
      padding: 0 28px 0 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--input-bg);
      color: var(--input-fg);
      outline: none;
      max-width: 160px;
      cursor: pointer;
    }
    .endpoint-select:focus { border-color: var(--accent); }

    .endpoint-health { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; }
    .endpoint-health.healthy { background: var(--success); }
    .endpoint-health.unhealthy { background: var(--error); }

    /* ── Session search ── */
    .session-search-wrap {
      padding: 4px 12px;
      border-bottom: 1px solid var(--border);
    }
    .session-search {
      width: 100%;
      padding: 4px 8px;
      font-size: 12px;
      border: 1px solid var(--input-border);
      border-radius: 4px;
      background: var(--input-bg);
      color: var(--input-fg);
      outline: none;
      font-family: var(--font-sans);
    }
    .session-search:focus { border-color: var(--accent); }

    /* ── Token usage ── */
    .token-usage {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 12px;
      font-size: 10px;
      color: var(--fg-muted);
      border-bottom: 1px solid var(--border);
    }
    .token-bar {
      flex: 1;
      height: 3px;
      background: var(--code-bg);
      border-radius: 2px;
      overflow: hidden;
    }
    .token-bar-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.3s;
    }

    /* ── Think block animation ── */
    .think-block:not(.open) { border-left-color: var(--fg-muted); }
    .think-block.open { animation: thinkPulse 2s ease-in-out infinite; }
    @keyframes thinkPulse {
      0%, 100% { border-left-color: var(--fg-muted); }
      50% { border-left-color: var(--accent); }
    }
    .think-block.done { animation: none; border-left-color: var(--fg-muted); }
    .think-elapsed {
      font-size: 10px;
      color: var(--fg-muted);
      margin-left: auto;
      font-family: var(--font-mono);
    }

    /* ── Diff lines ── */
    .diff-line-removed {
      background: rgba(241,76,76,0.1);
      color: #f14c4c;
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 0 8px;
      white-space: pre-wrap;
    }
    .diff-line-added {
      background: rgba(78,201,176,0.1);
      color: #4ec9b0;
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 0 8px;
      white-space: pre-wrap;
    }

    /* ── Streaming status label ── */
    .stream-panel {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 10px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
      max-width: 100%;
    }

    .stream-status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .stream-status {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--fg);
    }

    .stream-status-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
    }

    .stream-phase-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--fg-muted);
      box-shadow: 0 0 0 4px rgba(255,255,255,0.03);
    }

    .stream-phase-dot.thinking {
      background: var(--fg-muted);
    }

    .stream-phase-dot.tool {
      background: var(--accent);
    }

    .stream-phase-dot.draft {
      background: var(--success);
    }

    .stream-elapsed {
      font-size: 10px;
      color: var(--fg-muted);
      font-family: var(--font-mono);
      flex-shrink: 0;
    }

    .stream-detail {
      font-size: 12px;
      color: var(--fg-muted);
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .stream-verb-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 22px;
    }

    .stream-verb-chip {
      display: inline-flex;
      align-items: center;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.01em;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      animation: spinnerVerbPulse 1.65s ease-in-out infinite;
      transform-origin: center;
    }

    @keyframes spinnerVerbPulse {
      0% {
        opacity: 0.45;
        transform: translateY(2px) scale(0.985);
      }
      18% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      82% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      100% {
        opacity: 0.5;
        transform: translateY(-1px) scale(0.99);
      }
    }

    .stream-preview {
      font-size: 12px;
      line-height: 1.45;
      color: var(--fg);
      padding: 7px 9px;
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.05);
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* ── Attachment support ── */
    .attachment-preview {
      display: flex;
      gap: 8px;
      padding: 10px 10px 6px;
      flex-wrap: wrap;
      width: 100%;
    }

    .attachment-preview-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 46px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.05);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .attachment-preview-item.image {
      min-width: 190px;
      max-width: 280px;
      padding: 6px 30px 6px 6px;
    }

    .attachment-preview-thumb {
      width: 34px;
      height: 34px;
      flex-shrink: 0;
      border-radius: 9px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(0,0,0,0.22);
    }

    .attachment-preview-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .attachment-preview-item.file {
      min-width: 180px;
      max-width: 300px;
      padding: 8px 30px 8px 10px;
    }

    .attachment-preview-content {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .attachment-file-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .attachment-file-meta {
      margin-top: 2px;
      font-size: 11px;
      color: var(--fg-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .attachment-preview-remove {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 18px;
      height: 18px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(0,0,0,0.28);
      color: rgba(255,255,255,0.92);
      font-size: 12px;
      line-height: 18px;
      text-align: center;
      border-radius: 50%;
      cursor: pointer;
      padding: 0;
    }

    .attachment-preview-remove:hover {
      background: rgba(0,0,0,0.4);
    }

    .msg-attachment-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .msg-file-attachment {
      min-width: 160px;
      max-width: 260px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: rgba(255,255,255,0.03);
      padding: 8px 10px;
    }

    .msg-file-attachment .name {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .msg-file-attachment .meta {
      display: block;
      margin-top: 2px;
      font-size: 11px;
      color: var(--fg-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .msg-image {
      display: block;
      max-width: 100%;
      max-height: 300px;
      border-radius: 6px;
      margin-top: 8px;
      border: 1px solid var(--border);
    }

    /* ── Project instructions badge ── */
    .project-instructions-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 12px;
      font-size: 11px;
      color: var(--fg-muted);
      border-bottom: 1px solid var(--border);
    }

    /* ── Context meter colors ── */
    .token-bar-fill.green { background: var(--success); }
    .token-bar-fill.yellow { background: var(--warning); }
    .token-bar-fill.red { background: var(--error); }

    /* ── @-mention dropdown ── */
    .at-mention-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
      background: var(--vscode-dropdown-background, #2d2d2d);
      border: 1px solid var(--border);
      border-radius: 6px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
      z-index: 200;
      margin-bottom: 4px;
    }
    .at-mention-dropdown.open { display: block; }
    .at-mention-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      color: var(--fg);
    }
    .at-mention-item:hover, .at-mention-item.selected { background: var(--hover-bg); }
    .at-mention-item .at-icon { font-size: 11px; color: var(--fg-muted); }

    /* ── Message action buttons (fork, rewind) ── */
    .msg-stats {
      position: absolute;
      top: 10px;
      right: 12px;
      font-size: 10px;
      color: var(--fg-muted);
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(17,24,39,0.78);
      backdrop-filter: blur(8px);
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.12s ease, visibility 0.12s ease;
    }
    .msg:hover .msg-stats {
      opacity: 0.85;
      visibility: visible;
    }
    .msg-actions { display: none; gap: 4px; margin-top: 6px; }
    .msg:hover .msg-actions { display: flex; }
    .msg-action-btn {
      font-size: 10px;
      padding: 2px 8px;
      border: 1px solid var(--border);
      border-radius: 3px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      font-family: var(--font-sans);
    }
    .msg-action-btn:hover { background: var(--hover-bg); color: var(--fg); }

    /* ── Multi-file change preview ── */
    .multi-file-preview {
      margin: 8px 0;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      background: rgba(0,0,0,0.1);
    }
    .multi-file-header {
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid var(--border);
    }
    .multi-file-block {
      border-bottom: 1px solid var(--border);
    }
    .multi-file-block:last-child { border-bottom: none; }
    .multi-file-file-header {
      padding: 4px 10px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--accent);
      background: rgba(56,189,248,0.06);
      font-weight: 600;
    }

    /* ── Utilities ── */
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); border: 0;
    }
  `;
}
