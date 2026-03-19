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
      --user-bg: rgba(56,189,248,0.04);
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
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      min-height: 40px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 13px;
      color: var(--fg);
    }

    .header-brand img {
      width: 18px;
      height: 18px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .icon-btn {
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg-muted);
      border-radius: 6px;
      cursor: pointer;
      font-size: 18px;
    }

    .icon-btn:hover {
      background: var(--hover-bg);
      color: var(--fg);
    }

    /* ── Session Dropdown ── */
    .session-dropdown {
      position: relative;
    }

    .session-trigger {
      display: flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      font-size: 12px;
      padding: 4px 6px;
      border-radius: 4px;
    }

    .session-trigger:hover {
      background: var(--hover-bg);
      color: var(--fg);
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
      animation: fadeIn 0.15s ease;
    }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

    .msg-user {
      background: var(--user-bg);
      border: 1px solid rgba(255,255,255,0.04);
    }

    .msg-assistant { background: transparent; }

    .msg-tool {
      background: rgba(78,201,176,0.06);
      border: 1px solid rgba(78,201,176,0.12);
      font-family: var(--font-mono);
      font-size: 12px;
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
    .msg-body ul, .msg-body ol { padding-left: 20px; margin: 2px 0 4px; }
    .msg-body li { margin: 1px 0; }

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
      margin: 8px 0;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
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
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-muted);
      border-top: 1px solid var(--border);
      white-space: pre-wrap;
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

    /* ── Streaming indicator ── */
    .streaming-cursor {
      display: inline-block;
      width: 7px;
      height: 14px;
      background: var(--accent);
      margin-left: 2px;
      animation: blink 1s step-end infinite;
      vertical-align: middle;
    }

    @keyframes blink { 50% { opacity: 0; } }

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
      flex-shrink: 0;
      border-top: 1px solid var(--border);
      padding: 8px 12px 10px;
    }

    .composer-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
      gap: 8px;
    }

    .composer-left { display: flex; align-items: center; gap: 8px; }

    .mode-selector {
      display: flex;
      border: 1px solid var(--border);
      border-radius: 5px;
      overflow: hidden;
    }

    .mode-btn {
      font-family: var(--font-sans);
      font-size: 11px;
      padding: 2px 10px;
      border: none;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }

    .mode-btn:not(:last-child) { border-right: 1px solid var(--border); }
    .mode-btn:hover { background: var(--hover-bg); color: var(--fg); }

    .mode-btn.active {
      background: rgba(56,189,248,0.15);
      color: var(--neo-blue);
      font-weight: 600;
    }

    .status-text {
      font-size: 11px;
      color: var(--fg-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      text-align: right;
    }

    .input-wrap {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      border: 1px solid var(--input-border);
      border-radius: 8px;
      background: var(--input-bg);
      padding: 6px 8px 6px 12px;
      transition: border-color 0.15s;
    }

    .input-wrap:focus-within { border-color: var(--accent); }

    .input-wrap textarea {
      flex: 1;
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

    .send-btn {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
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
      padding: 3px 6px;
      border: 1px solid var(--border);
      border-radius: 4px;
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
    .stream-status {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--fg-muted);
      font-style: italic;
    }

    /* ── Image support ── */
    .image-preview {
      display: flex;
      gap: 6px;
      padding: 6px 10px;
      flex-wrap: wrap;
    }

    .image-preview-item {
      position: relative;
      width: 60px;
      height: 60px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .image-preview-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .image-preview-remove {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 16px;
      height: 16px;
      border: none;
      background: rgba(0,0,0,0.6);
      color: #fff;
      font-size: 11px;
      line-height: 16px;
      text-align: center;
      border-radius: 50%;
      cursor: pointer;
      padding: 0;
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
      display: none;
      font-size: 10px;
      color: var(--fg-muted);
      margin-top: 4px;
      padding: 2px 0;
      opacity: 0.7;
    }
    .msg:hover .msg-stats { display: block; }
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
