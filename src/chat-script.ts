/** Chat webview JavaScript (injected into <script> tag) */
export function getChatScript(brandIconUri: string): string {
  return `
    const vscode = acquireVsCodeApi();

    /* ── DOM refs ── */
    const messagesEl = document.getElementById("messages");
    const promptEl = document.getElementById("prompt");
    const sendBtn = document.getElementById("sendBtn");
    const statusText = document.getElementById("statusText");
    const modeSelector = document.getElementById("modeSelector");
    const sessionTrigger = document.getElementById("sessionTrigger");
    const sessionMenu = document.getElementById("sessionMenu");
    const sessionList = document.getElementById("sessionList");
    const sessionTitleBtn = document.getElementById("sessionTitleBtn");
    const sessionTitleInput = document.getElementById("sessionTitleInput");
    const sessionLabel = document.getElementById("sessionLabel");
    const newSessionBtn = document.getElementById("newSessionBtn");
    const inputWrap = document.getElementById("inputWrap");
    const resourceWarningsEl = document.getElementById("resourceWarnings");
    const endpointSelect = document.getElementById("endpointSelect");
    const modelSelect = document.getElementById("modelSelect");
    const reasoningSelect = document.getElementById("reasoningSelect");
    const exportBtn = document.getElementById("exportBtn");
    const sessionSearch = document.getElementById("sessionSearch");
    const sessionSearchWrap = document.getElementById("sessionSearchWrap");
    const tokenUsageEl = document.getElementById("tokenUsage");
    const tokenText = document.getElementById("tokenText");
    const tokenBarFill = document.getElementById("tokenBarFill");

    let state = null;
    let isStreaming = false;
    let streamingText = "";
    let streamingEl = null;
    let streamStartTime = 0;
    let streamChunkCount = 0;
    const messageStats = new Map();
    let editingSessionId = "";
    let isEditingSessionTitle = false;

    /* ── Markdown renderer ── */
    function escapeHtml(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    /* ── Lightweight syntax highlighter ── */
    const SH_KEYWORDS = {
      js: "abstract|arguments|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|async",
      ts: "abstract|arguments|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|return|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield|async|readonly|declare|namespace|keyof|infer|is|asserts|as",
      py: "and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None|self",
      go: "break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var|nil|true|false",
      rust: "as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while",
      java: "abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|true|false|null",
      sh: "if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|export|local|readonly|shift|unset|set|source|alias",
      css: "color|background|margin|padding|border|display|flex|grid|position|width|height|font|text|align|justify|content|items|overflow|opacity|transition|transform|animation|z-index|top|left|right|bottom|min|max|box|shadow|cursor|outline",
      sql: "SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INTO|VALUES|SET|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|NULL|IS|IN|LIKE|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|INDEX|VIEW|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT",
    };

    function getLangKeywords(lang) {
      const l = (lang || "").toLowerCase();
      if (l === "javascript" || l === "js" || l === "jsx") return SH_KEYWORDS.js;
      if (l === "typescript" || l === "ts" || l === "tsx") return SH_KEYWORDS.ts;
      if (l === "python" || l === "py") return SH_KEYWORDS.py;
      if (l === "go" || l === "golang") return SH_KEYWORDS.go;
      if (l === "rust" || l === "rs") return SH_KEYWORDS.rust;
      if (l === "java" || l === "kotlin" || l === "scala" || l === "c" || l === "cpp" || l === "c++" || l === "csharp" || l === "c#") return SH_KEYWORDS.java;
      if (l === "bash" || l === "sh" || l === "zsh" || l === "shell") return SH_KEYWORDS.sh;
      if (l === "css" || l === "scss" || l === "less") return SH_KEYWORDS.css;
      if (l === "sql" || l === "mysql" || l === "postgres" || l === "sqlite") return SH_KEYWORDS.sql;
      return SH_KEYWORDS.js; // default fallback
    }

    function highlightCode(code, lang) {
      const escaped = escapeHtml(code);
      const keywords = getLangKeywords(lang);
      const isSql = /^(sql|mysql|postgres|sqlite)$/i.test(lang || "");

      // Tokenize: process strings, comments, then keywords/numbers
      // We replace in a single pass to avoid double-highlighting
      const tokens = [];
      const tokenRegex = isSql
        ? /(--[^\\n]*|'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\\/\\*[\\s\\S]*?\\*\\/|\\b\\d+(?:\\.\\d+)?\\b)/g
        : /(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|#[^\\n]*|'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|&quot;(?:[^&]|&(?!quot;))*&quot;|\\\`(?:[^\\\`\\\\]|\\\\.)*\\\`|\\b\\d+(?:\\.\\d+)?\\b)/g;

      let result = "";
      let lastIdx = 0;
      let m;

      while ((m = tokenRegex.exec(escaped)) !== null) {
        // Process text before match for keywords
        const before = escaped.slice(lastIdx, m.index);
        result += highlightKeywords(before, keywords);

        const tok = m[0];
        if (tok.startsWith("//") || tok.startsWith("#") || tok.startsWith("--") || tok.startsWith("/*")) {
          result += '<span class="sh-comment">' + tok + '</span>';
        } else if (tok.startsWith("'") || tok.startsWith('"') || tok.startsWith("\\\`") || tok.startsWith("&quot;")) {
          result += '<span class="sh-string">' + tok + '</span>';
        } else {
          result += '<span class="sh-number">' + tok + '</span>';
        }
        lastIdx = m.index + tok.length;
      }
      result += highlightKeywords(escaped.slice(lastIdx), keywords);
      return result;
    }

    function highlightKeywords(text, keywords) {
      if (!text) return text;
      const re = new RegExp("\\\\b(" + keywords + ")\\\\b", "g");
      return text.replace(re, '<span class="sh-keyword">$1</span>');
    }

    function formatThinkBlocks(text) {
      text = text.replace(/\\s*\\[end of text\\]/g, "");
      const thinkRegex = /<think>([\\s\\S]*?)(<\\/think>|$)/g;
      let result = "";
      let lastIndex = 0;
      let m;
      let blockIndex = 0;
      while ((m = thinkRegex.exec(text)) !== null) {
        const isClosed = m[2] === "</think>";
        const content = m[1].trim();
        if (!content && !isClosed) continue;
        if (m.index > lastIndex) {
          result += renderMarkdownInner(text.slice(lastIndex, m.index));
        }
        const thinkContent = escapeHtml(content);
        const id = "think_" + (blockIndex++);
        const label = isClosed ? "Thought" : "Thinking\\u2026";
        const elapsed = isClosed && streamStartTime ? ((Date.now() - streamStartTime) / 1000).toFixed(1) + "s" : "";
        result += '<div class="think-block' + (isClosed ? ' done' : ' open') + '" data-think-id="' + id + '">'
          + '<div class="think-toggle">'
          + '<span class="think-icon">&#9654;</span> ' + label
          + (elapsed ? '<span class="think-elapsed">' + elapsed + '</span>' : '')
          + '</div>'
          + '<div class="think-content">' + thinkContent.replace(/\\n/g, "<br>") + '</div>'
          + '</div>';
        lastIndex = m.index + m[0].length;
      }
      if (lastIndex < text.length) {
        result += renderMarkdownInner(text.slice(lastIndex));
      }
      if (lastIndex === 0) {
        return renderMarkdownInner(text);
      }
      return result;
    }

    function renderMarkdownInner(text) {
      const parts = [];
      const lines = text.split("\\n");
      let inCodeBlock = false;
      let codeLang = "";
      let codeContent = [];
      let textBuffer = [];

      for (const line of lines) {
        if (!inCodeBlock && line.startsWith("\\\`\\\`\\\`")) {
          if (textBuffer.length) {
            parts.push({ type: "text", content: textBuffer.join("\\n") });
            textBuffer = [];
          }
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
          codeContent = [];
        } else if (inCodeBlock && line.startsWith("\\\`\\\`\\\`")) {
          parts.push({ type: "code", lang: codeLang, content: codeContent.join("\\n") });
          inCodeBlock = false;
          codeLang = "";
          codeContent = [];
        } else if (inCodeBlock) {
          codeContent.push(line);
        } else {
          textBuffer.push(line);
        }
      }

      if (inCodeBlock) {
        parts.push({ type: "code", lang: codeLang, content: codeContent.join("\\n") });
      }
      if (textBuffer.length) {
        parts.push({ type: "text", content: textBuffer.join("\\n") });
      }

      let html = "";
      for (const part of parts) {
        if (part.type === "code") {
          const langLabel = part.lang || "code";
          const id = "code_" + Math.random().toString(36).slice(2, 8);
          html += '<div class="code-block">';
          html += '<div class="code-header"><span>' + escapeHtml(langLabel) + '</span>';
          html += '<div class="code-actions">';
          html += '<button class="code-action-btn" data-copy-target="' + id + '">Copy</button>';
          html += '</div></div>';
          html += '<pre><code id="' + id + '">' + highlightCode(part.content, part.lang) + '</code></pre>';
          html += '</div>';
        } else {
          html += renderInlineMarkdown(part.content);
        }
      }
      return html;
    }

    function renderInlineMarkdown(text) {
      let html = escapeHtml(text);
      html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
      html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
      html = html.replace(/\\*(.+?)\\*/g, "<em>$1</em>");
      html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
      html = html.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
      // Clickable file links: [label](path) — opens file in editor
      html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, function(_, label, href) {
        if (/^https?:\\/\\//.test(href)) {
          return '<a class="ext-link" href="' + href + '">' + label + '</a>';
        }
        return '<a class="file-link" data-path="' + href.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\\"") + '" href="#">' + label + '</a>';
      });
      // Blockquotes
      html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
      html = html.replace(/<\\/blockquote>\\n<blockquote>/g, "\\n");
      html = html.replace(/^[\\-\\*] (.+)$/gm, "<li>$1</li>");
      html = html.replace(/^\\d+\\. (.+)$/gm, "<li>$1</li>");
      html = html.replace(/((?:<li>.*<\\/li>\\n?)+)/g, "<ul>$1</ul>");
      html = html.replace(/\\n\\n/g, "</p><p>");
      html = html.replace(/\\n/g, "<br>");
      html = "<p>" + html + "</p>";
      html = html.replace(/<p><\\/p>/g, "");
      html = html.replace(/<p>(<h[123]>)/g, "$1");
      html = html.replace(/(<\\/h[123]>)<\\/p>/g, "$1");
      html = html.replace(/<p>(<ul>)/g, "$1");
      html = html.replace(/(<\\/ul>)<\\/p>/g, "$1");
      html = html.replace(/<p>(<blockquote>)/g, "$1");
      html = html.replace(/(<\\/blockquote>)<\\/p>/g, "$1");
      return html;
    }

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-copy-target]");
      if (!btn) return;
      const id = btn.getAttribute("data-copy-target");
      const el = document.getElementById(id);
      if (el) {
        const text = el.textContent || "";
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => { btn.textContent = "Copy"; }, 1500);
        }).catch(() => {});
      }
    });

    document.addEventListener("click", (e) => {
      const toggle = e.target.closest(".think-toggle");
      if (!toggle) return;
      const block = toggle.closest(".think-block");
      if (block) block.classList.toggle("open");
    });

    // Clickable file links — open in editor
    document.addEventListener("click", (e) => {
      const link = e.target.closest(".file-link");
      if (!link) return;
      e.preventDefault();
      const filePath = link.getAttribute("data-path");
      if (filePath) {
        vscode.postMessage({ type: "openFile", filePath: filePath });
      }
    });

    // External links — open in browser
    document.addEventListener("click", (e) => {
      const link = e.target.closest(".ext-link");
      if (!link) return;
      e.preventDefault();
      const href = link.getAttribute("href");
      if (href) {
        vscode.postMessage({ type: "openExternal", url: href });
      }
    });

    /* ── Render functions ── */
    /** Build a fingerprint string for a transcript entry so we can detect changes. */
    function msgFingerprint(entry, idx) {
      const tcPart = entry.toolCalls
        ? entry.toolCalls.map(t => t.id + ":" + t.status + ":" + (t.result || "").length).join(",")
        : "";
      return entry.role + ":" + idx + ":" + (entry.content || "").length + ":" + tcPart;
    }

    let prevFingerprints = [];

    function renderMessages(payload) {
      const items = payload.transcript || [];

      if (!items.length && !isStreaming) {
        messagesEl.innerHTML =
          '<div class="empty-state">' +
          '  <img src="${brandIconUri}" alt="" />' +
          '  <h2>PocketAI</h2>' +
          '  <p>Ask about your code, send a selection, or chat with your local models right from VS Code.</p>' +
          '  <div class="empty-diag" id="emptyDiag"></div>' +
          '</div>';
        const diag = document.getElementById("emptyDiag");
        if (diag && payload.diagnostics) {
          diag.textContent = "URL: " + (payload.diagnostics.baseUrl || "") +
            "\\nModels: " + ((payload.diagnostics.detectedModelIds || []).join(", ") || "none detected") +
            "\\nRAM: " + (payload.diagnostics.freeMemoryGB || "?") + " GB free / " + (payload.diagnostics.totalMemoryGB || "?") + " GB total";
        }
        prevFingerprints = [];
        return;
      }

      // Build new fingerprints and compare with previous render
      const newFingerprints = [];
      const visibleItems = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].role === "system") continue;
        newFingerprints.push(msgFingerprint(items[i], i));
        visibleItems.push({ entry: items[i], idx: i });
      }

      // Fast path: if nothing changed, skip the entire render
      if (
        newFingerprints.length === prevFingerprints.length &&
        newFingerprints.every((fp, j) => fp === prevFingerprints[j])
      ) {
        return;
      }

      // Find the first index that differs
      let firstDiff = 0;
      while (
        firstDiff < prevFingerprints.length &&
        firstDiff < newFingerprints.length &&
        prevFingerprints[firstDiff] === newFingerprints[firstDiff]
      ) {
        firstDiff++;
      }

      // Remove stale DOM nodes from firstDiff onward
      const existingMsgNodes = messagesEl.querySelectorAll(":scope > .msg");
      for (let j = existingMsgNodes.length - 1; j >= firstDiff; j--) {
        existingMsgNodes[j].remove();
      }

      // Append new/changed messages from firstDiff onward
      for (let j = firstDiff; j < visibleItems.length; j++) {
        appendMessage(visibleItems[j].entry, visibleItems[j].idx);
      }

      prevFingerprints = newFingerprints;

      // Only scroll if new messages were added at the end
      if (visibleItems.length > firstDiff) {
        scrollToBottom();
      }
    }

    function appendMessage(entry, msgIndex) {
      const div = document.createElement("div");
      const roleClass = entry.role === "user" ? "msg-user" : entry.role === "tool" ? "msg-tool" : "msg-assistant";
      div.className = "msg " + roleClass;

      if (entry.role === "tool") {
        const label = document.createElement("div");
        label.className = "msg-label";
        label.textContent = "Tool Result";
        div.appendChild(label);
      }

      const body = document.createElement("div");
      body.className = "msg-body";

      if (entry.role === "assistant") {
        body.innerHTML = formatThinkBlocks(entry.content);
      } else {
        body.innerHTML = renderInlineMarkdown(entry.content);
      }
      // Display attached images
      if (entry.images && entry.images.length) {
        for (const img of entry.images) {
          const imgEl = document.createElement("img");
          imgEl.className = "msg-image";
          imgEl.src = "data:" + img.mimeType + ";base64," + img.data;
          imgEl.alt = img.name || "attached image";
          body.appendChild(imgEl);
        }
      }
      div.appendChild(body);

      if (entry.role === "assistant" && messageStats.has(msgIndex)) {
        const stats = messageStats.get(msgIndex);
        div.classList.add("msg-has-stats");
        const statsEl = document.createElement("div");
        statsEl.className = "msg-stats";
        const tps = stats.tokPerSec > 0 ? stats.tokPerSec.toFixed(1) + " tok/s" : "";
        const tokens = stats.totalTokens ? "~" + stats.totalTokens + " tokens" : "";
        const elapsed = stats.elapsed > 0 ? stats.elapsed.toFixed(1) + "s" : "";
        statsEl.textContent = [tps, tokens, elapsed].filter(Boolean).join(" \\u00b7 ");
        statsEl.title = "Generation speed for this response";
        div.appendChild(statsEl);
      }

      if (entry.toolCalls && entry.toolCalls.length) {
        const pendingCount = entry.toolCalls.filter(t => t.status === "pending").length;
        if (pendingCount > 1) {
          const batchBar = document.createElement("div");
          batchBar.className = "batch-actions";
          const previewAll = document.createElement("button");
          previewAll.className = "tool-btn";
          previewAll.style.cssText = "border-color:var(--accent);color:var(--accent);";
          previewAll.textContent = "Preview All Changes";
          previewAll.onclick = () => {
            const previewContainer = div.querySelector(".multi-file-preview");
            if (previewContainer) {
              previewContainer.remove();
            } else {
              const editCalls = entry.toolCalls.filter(t => t.status === "pending" && (t.type === "edit_file" || t.type === "write_file"));
              if (editCalls.length) {
                const preview = document.createElement("div");
                preview.className = "multi-file-preview";
                const header = document.createElement("div");
                header.className = "multi-file-header";
                header.textContent = editCalls.length + " file" + (editCalls.length > 1 ? "s" : "") + " will be changed:";
                preview.appendChild(header);
                for (const tc of editCalls) {
                  const fileBlock = document.createElement("div");
                  fileBlock.className = "multi-file-block";
                  const fileHeader = document.createElement("div");
                  fileHeader.className = "multi-file-file-header";
                  fileHeader.textContent = (tc.type === "write_file" ? "[new] " : "") + (tc.filePath || "");
                  fileBlock.appendChild(fileHeader);
                  if (tc.type === "edit_file" && tc.search) {
                    const searchLines = tc.search.split("\\n");
                    for (const line of searchLines) {
                      const lineEl = document.createElement("div");
                      lineEl.className = "diff-line-removed";
                      lineEl.textContent = "- " + line;
                      fileBlock.appendChild(lineEl);
                    }
                    if (tc.replace !== undefined) {
                      const replaceLines = (tc.replace || "").split("\\n");
                      for (const line of replaceLines) {
                        const lineEl = document.createElement("div");
                        lineEl.className = "diff-line-added";
                        lineEl.textContent = "+ " + line;
                        fileBlock.appendChild(lineEl);
                      }
                    }
                  } else if (tc.type === "write_file" && tc.content) {
                    const contentLines = tc.content.split("\\n");
                    const maxLines = 20;
                    const showLines = contentLines.slice(0, maxLines);
                    for (const line of showLines) {
                      const lineEl = document.createElement("div");
                      lineEl.className = "diff-line-added";
                      lineEl.textContent = "+ " + line;
                      fileBlock.appendChild(lineEl);
                    }
                    if (contentLines.length > maxLines) {
                      const moreEl = document.createElement("div");
                      moreEl.className = "diff-line-added";
                      moreEl.style.opacity = "0.6";
                      moreEl.textContent = "  ... +" + (contentLines.length - maxLines) + " more lines";
                      fileBlock.appendChild(moreEl);
                    }
                  }
                  preview.appendChild(fileBlock);
                }
                div.insertBefore(preview, batchBar.nextSibling);
              }
            }
          };
          batchBar.appendChild(previewAll);
          const acceptAll = document.createElement("button");
          acceptAll.className = "tool-btn tool-btn-approve";
          acceptAll.textContent = "Accept All (" + pendingCount + ")";
          acceptAll.onclick = () => vscode.postMessage({ type: "approveAllToolCalls" });
          batchBar.appendChild(acceptAll);
          const rejectAll = document.createElement("button");
          rejectAll.className = "tool-btn tool-btn-reject";
          rejectAll.textContent = "Reject All";
          rejectAll.onclick = () => vscode.postMessage({ type: "rejectAllToolCalls" });
          batchBar.appendChild(rejectAll);
          div.appendChild(batchBar);
        }
        for (const tc of entry.toolCalls) {
          div.appendChild(renderToolCall(tc));
        }
      }

      // Fork feature hidden for now — will be re-introduced via right-click context menu

      messagesEl.appendChild(div);
    }

    function renderToolCall(tc) {
      const card = document.createElement("div");
      card.className = "tool-call-card";

      const header = document.createElement("div");
      header.className = "tool-call-header";

      const typeEl = document.createElement("span");
      typeEl.className = "tool-call-type";
      typeEl.textContent = tc.type.replace(/_/g, " ");
      header.appendChild(typeEl);

      const pathEl = document.createElement("span");
      pathEl.className = "tool-call-path";
      const pathText = tc.type === "web_search" ? (tc.query || "")
        : tc.type === "run_command" ? (tc.command || "")
        : tc.type === "grep" ? (tc.pattern || "") + (tc.glob ? " (" + tc.glob + ")" : "")
        : tc.type === "glob" ? (tc.glob || "")
        : tc.type === "git_commit" ? (tc.commitMessage || "")
        : tc.type === "git_status" || tc.type === "git_diff" ? ""
        : (tc.filePath || "");
      pathEl.textContent = pathText;
      header.appendChild(pathEl);

      if (tc.status === "pending") {
        const actions = document.createElement("div");
        actions.className = "tool-call-actions";

        if (tc.type === "edit_file") {
          const diffBtn = document.createElement("button");
          diffBtn.className = "tool-btn";
          diffBtn.style.cssText = "border-color:var(--accent);color:var(--accent);";
          diffBtn.textContent = "View Diff";
          diffBtn.onclick = () => vscode.postMessage({ type: "openDiff", toolCallId: tc.id });
          actions.appendChild(diffBtn);
        }

        const approveBtn = document.createElement("button");
        approveBtn.className = "tool-btn tool-btn-approve";
        approveBtn.textContent = "Accept";
        approveBtn.onclick = () => vscode.postMessage({ type: "approveToolCall", toolCallId: tc.id });
        actions.appendChild(approveBtn);

        const rejectBtn = document.createElement("button");
        rejectBtn.className = "tool-btn tool-btn-reject";
        rejectBtn.textContent = "Reject";
        rejectBtn.onclick = () => vscode.postMessage({ type: "rejectToolCall", toolCallId: tc.id });
        actions.appendChild(rejectBtn);

        header.appendChild(actions);
      } else {
        const badge = document.createElement("span");
        badge.className = "tool-status " + tc.status;
        badge.textContent = tc.status;
        header.appendChild(badge);
      }

      card.appendChild(header);

      if (tc.type === "edit_file" && tc.search) {
        const diffContainer = document.createElement("div");
        diffContainer.style.borderTop = "1px solid var(--border)";
        const searchLines = tc.search.split("\\n");
        for (const line of searchLines) {
          const lineEl = document.createElement("div");
          lineEl.className = "diff-line-removed";
          lineEl.textContent = "- " + line;
          diffContainer.appendChild(lineEl);
        }
        if (tc.replace !== undefined) {
          const replaceLines = (tc.replace || "").split("\\n");
          for (const line of replaceLines) {
            const lineEl = document.createElement("div");
            lineEl.className = "diff-line-added";
            lineEl.textContent = "+ " + line;
            diffContainer.appendChild(lineEl);
          }
        }
        card.appendChild(diffContainer);
      }

      if (tc.result) {
        const resultEl = document.createElement("div");
        resultEl.className = "tool-call-result";
        if (tc.result.length > 500) {
          resultEl.textContent = tc.result.slice(0, 500) + "...";
          const expandBtn = document.createElement("button");
          expandBtn.className = "tool-result-expand";
          expandBtn.textContent = "Show more";
          let expanded = false;
          expandBtn.onclick = () => {
            expanded = !expanded;
            resultEl.textContent = expanded ? tc.result : tc.result.slice(0, 500) + "...";
            expandBtn.textContent = expanded ? "Show less" : "Show more";
            resultEl.appendChild(expandBtn);
          };
          resultEl.appendChild(expandBtn);
        } else {
          resultEl.textContent = tc.result;
        }
        card.appendChild(resultEl);
      }

      return card;
    }

    function scrollToBottom() {
      requestAnimationFrame(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    }

    /* ── Streaming ── */
    function startStreaming() {
      isStreaming = true;
      streamingText = "";
      streamStartTime = Date.now();
      streamChunkCount = 0;

      const div = document.createElement("div");
      div.className = "msg msg-assistant";
      div.id = "streaming-msg";

      const label = document.createElement("div");
      label.className = "msg-label";
      label.textContent = "PocketAI";
      div.appendChild(label);

      const body = document.createElement("div");
      body.className = "msg-body";
      body.id = "streaming-body";
      body.innerHTML = '<span class="streaming-cursor"></span>';
      div.appendChild(body);

      messagesEl.appendChild(div);
      streamingEl = body;
      scrollToBottom();
    }

    function appendStreamChunk(text) {
      streamingText += text;
      streamChunkCount++;
      if (streamingEl) {
        const trimmed = streamingText.trim();
        let statusLabel = "";
        const singleLine = !trimmed.includes("\\n");
        if (singleLine && /^@read_file:\\s*.+$/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Reading file...</div>';
        } else if (singleLine && /^@web_search:\\s*.+$/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Searching the web...</div>';
        } else if (singleLine && /^@list_files:\\s*.+$/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Listing files...</div>';
        } else if (singleLine && /^@run_command:\\s*.+$/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Running command...</div>';
        } else if (singleLine && /^@grep:\\s*.+$/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Searching code...</div>';
        } else if (singleLine && /^@glob:\\s*.+$/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Finding files...</div>';
        } else if (singleLine && /^@git_status/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Checking git status...</div>';
        } else if (singleLine && /^@git_diff/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Getting diff...</div>';
        } else if (singleLine && /^@git_commit:\\s*.+$/.test(trimmed)) {
          statusLabel = '<div class="stream-status">Committing...</div>';
        }
        streamingEl.innerHTML = (statusLabel || formatThinkBlocks(streamingText)) + '<span class="streaming-cursor"></span>';
        scrollToBottom();
      }
    }

    function endStreaming() {
      isStreaming = false;
      if (streamingEl) {
        streamingEl.innerHTML = formatThinkBlocks(streamingText);
      }
      streamingEl = null;
      streamingText = "";
    }

    /* ── Session menu ── */
    function getActiveSession() {
      if (!state?.sessions?.length) return null;
      return state.sessions.find(s => s.id === state.activeSessionId) || null;
    }

    function syncSessionTitle() {
      const activeSession = getActiveSession();
      const title = activeSession ? activeSession.title : "Chat";
      sessionLabel.textContent = title;
      if (!isEditingSessionTitle || editingSessionId !== activeSession?.id) {
        sessionTitleInput.value = title;
      }
    }

    function startSessionTitleEdit() {
      const activeSession = getActiveSession();
      if (!activeSession) return;
      isEditingSessionTitle = true;
      editingSessionId = activeSession.id;
      sessionTitleBtn.classList.add("hidden");
      sessionTitleInput.classList.add("editing");
      sessionTitleInput.value = activeSession.title;
      sessionTitleInput.focus();
      sessionTitleInput.select();
    }

    function finishSessionTitleEdit(commit) {
      if (!isEditingSessionTitle) return;

      const activeSession = getActiveSession();
      const previousTitle =
        (state?.sessions || []).find(s => s.id === editingSessionId)?.title ||
        sessionLabel.textContent ||
        "Chat";
      const nextTitle = sessionTitleInput.value.trim().replace(/\\s+/g, " ");
      const targetSessionId = editingSessionId;

      isEditingSessionTitle = false;
      editingSessionId = "";
      sessionTitleBtn.classList.remove("hidden");
      sessionTitleInput.classList.remove("editing");

      if (!commit || !targetSessionId || !nextTitle || nextTitle === previousTitle) {
        sessionTitleInput.value = activeSession ? activeSession.title : previousTitle;
        return;
      }

      sessionLabel.textContent = nextTitle;
      sessionTitleInput.value = nextTitle;
      vscode.postMessage({ type: "renameSession", sessionId: targetSessionId, title: nextTitle });
    }

    function renderSessions(payload) {
      sessionList.innerHTML = "";
      const active = payload.activeSessionId;
      syncSessionTitle();

      for (const s of payload.sessions || []) {
        const item = document.createElement("div");
        item.className = "session-menu-item" + (s.id === active ? " active" : "");
        item.onclick = () => {
          vscode.postMessage({ type: "switchSession", sessionId: s.id });
          sessionMenu.classList.remove("open");
          sessionSearchWrap.style.display = "none";
          sessionSearch.value = "";
        };

        const titleEl = document.createElement("span");
        titleEl.className = "title";
        titleEl.textContent = s.title;
        item.appendChild(titleEl);

        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.textContent = "\\u00d7";
        delBtn.onclick = (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: "deleteSession", sessionId: s.id });
        };
        item.appendChild(delBtn);

        sessionList.appendChild(item);
      }
    }

    /* ── State handler ── */
    let lastRenderedSessionId = "";

    function handleState(payload) {
      state = payload;

      // Reset message cache when switching sessions so we do a full re-render
      if (payload.activeSessionId && payload.activeSessionId !== lastRenderedSessionId) {
        prevFingerprints = [];
        messagesEl.innerHTML = "";
        if (isEditingSessionTitle && editingSessionId !== payload.activeSessionId) {
          finishSessionTitleEdit(false);
        }
        lastRenderedSessionId = payload.activeSessionId;
      }

      if (messageStats.has("__pending__") && payload.transcript) {
        for (let i = payload.transcript.length - 1; i >= 0; i--) {
          if (payload.transcript[i].role === "assistant") {
            messageStats.set(i, messageStats.get("__pending__"));
            break;
          }
        }
        messageStats.delete("__pending__");
      }

      const streamingMsg = document.getElementById("streaming-msg");
      if (streamingMsg) streamingMsg.remove();
      isStreaming = false;
      streamingEl = null;
      streamingText = "";

      const currentMode = payload.mode || "ask";
      modeSelector.querySelectorAll(".mode-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-mode") === currentMode);
      });

      statusText.textContent = payload.status || "";
      promptEl.disabled = !!payload.busy;

      if (payload.busy) {
        sendBtn.className = "cancel-btn";
        sendBtn.innerHTML = "\\u25a0";
        sendBtn.title = "Cancel";
        sendBtn.disabled = false;
        sendBtn.onclick = () => vscode.postMessage({ type: "cancelRequest" });
      } else {
        sendBtn.className = "send-btn";
        sendBtn.innerHTML = "\\u2191";
        sendBtn.title = "Send (Enter)";
        sendBtn.disabled = false;
        sendBtn.onclick = submitPrompt;
      }

      endpointSelect.innerHTML = "";
      for (const ep of payload.endpoints || []) {
        const opt = document.createElement("option");
        opt.value = ep.url;
        const dot = ep.healthy ? "\\u25CF" : "\\u25CB";
        const latency = ep.latencyMs ? " (" + ep.latencyMs + "ms)" : "";
        opt.textContent = dot + " " + ep.name + latency;
        if (ep.url === payload.selectedEndpoint) opt.selected = true;
        endpointSelect.appendChild(opt);
      }
      renderModelSelect(payload);
      renderReasoningSelect(payload);

      const projectBadge = document.getElementById("projectBadge");
      if (projectBadge) {
        projectBadge.style.display = payload.projectInstructionsLoaded ? "flex" : "none";
      }

      const estimate = payload.contextTokenEstimate || 0;
      const windowSize = payload.contextWindowSize || 8192;
      const pctContext = Math.min(100, (estimate / windowSize) * 100);
      const cumulative = payload.cumulativeTokens;
      const cumTotal = cumulative ? (cumulative.prompt + cumulative.completion) : 0;
      const cumSuffix = cumTotal > 0 ? " \\u00b7 " + formatTokens(cumTotal) + " total used" : "";
      tokenText.textContent = formatTokens(estimate) + " / " + formatTokens(windowSize) + " context" + cumSuffix;
      tokenBarFill.style.width = pctContext + "%";
      tokenBarFill.className = "token-bar-fill " + (pctContext > 80 ? "red" : pctContext > 50 ? "yellow" : "green");

      if (pctContext > 80 && !payload.busy) {
        statusText.textContent = (payload.status || "") + " \\u2014 Context is filling up! Try /compact";
      }

      renderMessages(payload);
      renderSessions(payload);
      renderResourceWarnings(payload);
    }

    function formatTokens(n) {
      if (n < 1000) return n + "";
      return (n / 1000).toFixed(1) + "k";
    }

    function renderModelSelect(payload) {
      const models = Array.isArray(payload.models) ? payload.models : [];
      const selectedModel = payload.selectedModel || "";

      modelSelect.innerHTML = "";

      if (selectedModel && !models.includes(selectedModel)) {
        const unavailableOpt = document.createElement("option");
        unavailableOpt.value = selectedModel;
        unavailableOpt.textContent = selectedModel + " (unavailable)";
        unavailableOpt.selected = true;
        modelSelect.appendChild(unavailableOpt);
      }

      for (const modelId of models) {
        const opt = document.createElement("option");
        opt.value = modelId;
        opt.textContent = modelId;
        if (modelId === selectedModel) opt.selected = true;
        modelSelect.appendChild(opt);
      }

      if (!modelSelect.options.length) {
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "No models available";
        emptyOpt.selected = true;
        modelSelect.appendChild(emptyOpt);
      }

      if (models.length && !selectedModel) {
        modelSelect.value = models[0];
      }

      modelSelect.disabled = !!payload.busy || models.length === 0;
    }

    function renderReasoningSelect(payload) {
      const showControl = !!payload.showReasoningControl;
      const options = Array.isArray(payload.reasoningOptions) ? payload.reasoningOptions : [];
      const selectedReasoningEffort = payload.selectedReasoningEffort || "";

      reasoningSelect.style.display = showControl ? "" : "none";
      reasoningSelect.innerHTML = "";

      if (!showControl) return;

      const autoOpt = document.createElement("option");
      autoOpt.value = "";
      autoOpt.textContent = "Reasoning: Auto";
      autoOpt.selected = selectedReasoningEffort === "";
      reasoningSelect.appendChild(autoOpt);

      for (const option of options) {
        const opt = document.createElement("option");
        opt.value = option;
        opt.textContent =
          "Reasoning: " + option.charAt(0).toUpperCase() + option.slice(1);
        if (option === selectedReasoningEffort) opt.selected = true;
        reasoningSelect.appendChild(opt);
      }

      reasoningSelect.disabled = !!payload.busy || options.length === 0;
    }

    function renderResourceWarnings(payload) {
      if (!resourceWarningsEl) return;
      const warnings = (payload.diagnostics && payload.diagnostics.resourceWarnings) || [];
      resourceWarningsEl.innerHTML = "";
      for (const w of warnings) {
        const div = document.createElement("div");
        div.className = "resource-warning " + (w.type === "memory" ? "memory-warning" : "storage-warning");
        const icon = document.createElement("span");
        icon.className = "resource-warning-icon";
        icon.textContent = w.type === "memory" ? "\\u26A0" : "\\u{1F4BE}";
        div.appendChild(icon);
        const text = document.createElement("span");
        text.textContent = w.message;
        div.appendChild(text);
        resourceWarningsEl.appendChild(div);
      }
    }

    /* ── Event listeners ── */
    window.addEventListener("message", (event) => {
      const msg = event.data;
      try {
        switch (msg.type) {
          case "state":
            handleState(msg);
            break;
          case "streamStart":
            startStreaming();
            break;
          case "streamChunk":
            appendStreamChunk(msg.text);
            break;
          case "streamEnd": {
            const elapsedMs = streamStartTime ? Date.now() - streamStartTime : 0;
            const elapsedSec = elapsedMs / 1000;
            const completionTokens = msg.tokenUsage ? msg.tokenUsage.completionTokens : Math.ceil(streamingText.length / 4);
            const tokPerSec = elapsedSec > 0.1 ? (completionTokens / elapsedSec) : 0;

            endStreaming();

            if (state && state.transcript) {
              messageStats.set("__pending__", {
                tokPerSec: tokPerSec,
                totalTokens: completionTokens,
                elapsed: elapsedSec
              });
            }

            if (msg.tokenUsage) {
              const total = msg.tokenUsage.promptTokens + msg.tokenUsage.completionTokens;
              const windowSize = (state && state.contextWindowSize) || 8192;
              const pct = Math.min(100, (total / windowSize) * 100);
              tokenText.textContent = formatTokens(total) + " / " + formatTokens(windowSize) + " tokens (actual)";
              tokenBarFill.style.width = pct + "%";
              tokenBarFill.className = "token-bar-fill " + (pct > 80 ? "red" : pct > 50 ? "yellow" : "green");
            }
            break;
          }
          case "filteredSessions":
            renderFilteredSessions(msg.sessions);
            break;
          case "atMentionResults":
            renderAtMentionDropdown(msg.suggestions);
            break;
        }
      } catch (err) {
        console.error("[PocketAI webview]", err);
        const errDiv = document.createElement("div");
        errDiv.style.cssText = "color:#f14c4c;font-size:11px;padding:8px 12px;font-family:monospace";
        errDiv.textContent = "Webview error: " + (err.message || err);
        messagesEl.appendChild(errDiv);
      }
    });

    /* ── Image attachments ── */
    let pendingImages = [];
    const imagePreviewEl = document.getElementById("imagePreview");

    function addImage(data, mimeType, name) {
      pendingImages.push({ data, mimeType, name });
      renderImagePreviews();
    }

    function renderImagePreviews() {
      if (!imagePreviewEl) return;
      imagePreviewEl.innerHTML = "";
      if (!pendingImages.length) {
        imagePreviewEl.style.display = "none";
        return;
      }
      imagePreviewEl.style.display = "flex";
      pendingImages.forEach((img, i) => {
        const wrap = document.createElement("div");
        wrap.className = "image-preview-item";
        const thumb = document.createElement("img");
        thumb.src = "data:" + img.mimeType + ";base64," + img.data;
        thumb.alt = img.name || "image";
        wrap.appendChild(thumb);
        const removeBtn = document.createElement("button");
        removeBtn.className = "image-preview-remove";
        removeBtn.textContent = "\\u00d7";
        removeBtn.onclick = () => { pendingImages.splice(i, 1); renderImagePreviews(); };
        wrap.appendChild(removeBtn);
        imagePreviewEl.appendChild(wrap);
      });
    }

    // Paste handler for images
    promptEl.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string") return;
            const base64 = result.split(",")[1];
            addImage(base64, item.type, file.name || "pasted-image");
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    });

    function submitPrompt() {
      const text = promptEl.value.trim();
      if (!text && !pendingImages.length) return;
      if (state && state.busy) return;
      const msg = { type: "sendPrompt", prompt: text || "(see attached image)" };
      if (pendingImages.length) {
        msg.images = pendingImages.slice();
      }
      vscode.postMessage(msg);
      promptEl.value = "";
      pendingImages = [];
      renderImagePreviews();
      resizeInput();
    }

    promptEl.addEventListener("keydown", (e) => {
      if (e.isComposing) return;

      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (atMentionActive && atMentionSuggestions.length) return;
        e.preventDefault();
        e.stopPropagation();
        submitPrompt();
        return false;
      }

      if (e.key === "Enter" && e.shiftKey) {
        requestAnimationFrame(resizeInput);
      }
    }, true);

    function resizeInput() {
      promptEl.style.height = "0";
      promptEl.style.height = Math.min(promptEl.scrollHeight, 200) + "px";
    }

    promptEl.addEventListener("input", resizeInput);
    sendBtn.addEventListener("click", submitPrompt);

    modeSelector.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      const mode = btn.getAttribute("data-mode");
      vscode.postMessage({ type: "setMode", mode: mode });
    });

    sessionTrigger.addEventListener("click", () => {
      sessionMenu.classList.toggle("open");
      const isOpen = sessionMenu.classList.contains("open");
      sessionSearchWrap.style.display = isOpen ? "block" : "none";
      if (isOpen) sessionSearch.focus();
    });

    sessionTitleBtn.addEventListener("click", () => {
      startSessionTitleEdit();
    });

    sessionTitleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finishSessionTitleEdit(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finishSessionTitleEdit(false);
      }
    });

    sessionTitleInput.addEventListener("blur", () => {
      finishSessionTitleEdit(true);
    });

    newSessionBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "newSession" });
      sessionMenu.classList.remove("open");
      sessionSearchWrap.style.display = "none";
    });

    document.addEventListener("click", (e) => {
      if (!sessionMenu.contains(e.target) && !sessionTrigger.contains(e.target)) {
        sessionMenu.classList.remove("open");
        sessionSearchWrap.style.display = "none";
      }
    });

    endpointSelect.addEventListener("change", () => {
      vscode.postMessage({ type: "selectEndpoint", endpointUrl: endpointSelect.value });
    });

    modelSelect.addEventListener("change", () => {
      if (!modelSelect.value) return;
      vscode.postMessage({ type: "selectModel", modelId: modelSelect.value });
    });

    reasoningSelect.addEventListener("change", () => {
      vscode.postMessage({
        type: "selectReasoningEffort",
        reasoningEffort: reasoningSelect.value,
      });
    });

    exportBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "exportSession" });
    });

    sessionSearch.addEventListener("input", () => {
      vscode.postMessage({ type: "searchSessions", query: sessionSearch.value });
    });

    function renderFilteredSessions(sessions) {
      sessionList.innerHTML = "";
      const active = state ? state.activeSessionId : "";
      for (const s of sessions) {
        const item = document.createElement("div");
        item.className = "session-menu-item" + (s.id === active ? " active" : "");
        item.onclick = () => {
          vscode.postMessage({ type: "switchSession", sessionId: s.id });
          sessionMenu.classList.remove("open");
          sessionSearchWrap.style.display = "none";
          sessionSearch.value = "";
        };
        const titleEl = document.createElement("span");
        titleEl.className = "title";
        titleEl.textContent = s.title;
        item.appendChild(titleEl);
        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.textContent = "\\u00d7";
        delBtn.onclick = (e) => { e.stopPropagation(); vscode.postMessage({ type: "deleteSession", sessionId: s.id }); };
        item.appendChild(delBtn);
        sessionList.appendChild(item);
      }
    }

    /* ── @-mention system ── */
    const atDropdown = document.getElementById("atMentionDropdown");
    let atMentionActive = false;
    let atMentionStart = -1;
    let atMentionSelectedIndex = 0;
    let atMentionSuggestions = [];

    promptEl.addEventListener("input", () => {
      resizeInput();
      const val = promptEl.value;
      const cursor = promptEl.selectionStart;

      const before = val.slice(0, cursor);
      const atIdx = before.lastIndexOf("@");
      if (atIdx >= 0 && (atIdx === 0 || before[atIdx - 1] === " " || before[atIdx - 1] === "\\n")) {
        const query = before.slice(atIdx + 1);
        if (query.length >= 0 && !query.includes(" ")) {
          atMentionActive = true;
          atMentionStart = atIdx;
          atMentionSelectedIndex = 0;
          vscode.postMessage({ type: "resolveAtMention", query: query });
          return;
        }
      }
      closeAtMention();
    });

    function closeAtMention() {
      atMentionActive = false;
      atMentionStart = -1;
      atDropdown.classList.remove("open");
      atDropdown.innerHTML = "";
      atMentionSuggestions = [];
    }

    function renderAtMentionDropdown(suggestions) {
      atMentionSuggestions = suggestions || [];
      if (!atMentionSuggestions.length || !atMentionActive) {
        closeAtMention();
        return;
      }
      atDropdown.innerHTML = "";
      atDropdown.classList.add("open");
      atMentionSuggestions.forEach((s, i) => {
        const item = document.createElement("div");
        item.className = "at-mention-item" + (i === atMentionSelectedIndex ? " selected" : "");
        const icon = document.createElement("span");
        icon.className = "at-icon";
        icon.textContent = s.kind === "folder" ? "\\u{1F4C1}" : "\\u{1F4C4}";
        item.appendChild(icon);
        const label = document.createElement("span");
        label.textContent = s.label;
        item.appendChild(label);
        item.onclick = () => selectAtMention(s.label);
        atDropdown.appendChild(item);
      });
    }

    function selectAtMention(label) {
      const val = promptEl.value;
      const before = val.slice(0, atMentionStart);
      const after = val.slice(promptEl.selectionStart);
      promptEl.value = before + "@" + label + " " + after;
      promptEl.selectionStart = promptEl.selectionEnd = before.length + 1 + label.length + 1;
      closeAtMention();
      promptEl.focus();
    }

    promptEl.addEventListener("keydown", (e) => {
      if (!atMentionActive || !atMentionSuggestions.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        atMentionSelectedIndex = Math.min(atMentionSelectedIndex + 1, atMentionSuggestions.length - 1);
        renderAtMentionDropdown(atMentionSuggestions);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        atMentionSelectedIndex = Math.max(atMentionSelectedIndex - 1, 0);
        renderAtMentionDropdown(atMentionSuggestions);
      } else if (e.key === "Tab" || (e.key === "Enter" && atMentionActive)) {
        e.preventDefault();
        e.stopPropagation();
        if (atMentionSuggestions[atMentionSelectedIndex]) {
          selectAtMention(atMentionSuggestions[atMentionSelectedIndex].label);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeAtMention();
      }
    }, true);

    /* ── Init ── */
    resizeInput();
    vscode.postMessage({ type: "ready" });
  `;
}
