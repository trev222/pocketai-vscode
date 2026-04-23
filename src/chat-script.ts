/** Chat webview JavaScript (injected into <script> tag) */
export function getChatScript(brandIconUri: string): string {
  return `
    const vscode = acquireVsCodeApi();

    /* ── DOM refs ── */
    const messagesEl = document.getElementById("messages");
    const promptEl = document.getElementById("prompt");
    const sendBtn = document.getElementById("sendBtn");
    const attachmentBtn = document.getElementById("attachmentBtn");
    const attachmentInput = document.getElementById("attachmentInput");
    const attachMenuWrap = document.getElementById("attachMenuWrap");
    const attachMenu = document.getElementById("attachMenu");
    const attachUploadAction = document.getElementById("attachUploadAction");
    const statusText = document.getElementById("statusText");
    const modeTrigger = document.getElementById("modeTrigger");
    const modeTriggerLabel = document.getElementById("modeTriggerLabel");
    const modeMenuWrap = document.getElementById("modeMenuWrap");
    const modeMenu = document.getElementById("modeMenu");
    const modelTrigger = document.getElementById("modelTrigger");
    const modelTriggerLabel = document.getElementById("modelTriggerLabel");
    const modelMenuWrap = document.getElementById("modelMenuWrap");
    const modelMenu = document.getElementById("modelMenu");
    const reasoningTrigger = document.getElementById("reasoningTrigger");
    const reasoningTriggerLabel = document.getElementById("reasoningTriggerLabel");
    const reasoningMenuWrap = document.getElementById("reasoningMenuWrap");
    const reasoningMenu = document.getElementById("reasoningMenu");
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
    const activeSkillsEl = document.getElementById("activeSkills");
    const exportBtn = document.getElementById("exportBtn");
    const sessionSearch = document.getElementById("sessionSearch");
    const sessionSearchWrap = document.getElementById("sessionSearchWrap");
    const tokenUsageEl = document.getElementById("tokenUsage");
    const tokenText = document.getElementById("tokenText");
    const tokenBarFill = document.getElementById("tokenBarFill");
    const harnessPane = document.getElementById("harnessPane");
    const approvalDock = document.getElementById("approvalDock");

    let state = null;
    let isStreaming = false;
    let streamingText = "";
    let streamingEl = null;
    let streamingToolMode = false;
    let streamingToolHint = null;
    let streamingBaseLabel = "";
    let streamingBaseDetail = "";
    let streamStartTime = 0;
    let streamChunkCount = 0;
    let spinnerVerbIndex = 0;
    let spinnerVerbTimer = null;
    let spinnerVerbTypingTimer = null;
    let spinnerVerbRendered = "";
    const messageStats = new Map();
    let editingSessionId = "";
    let isEditingSessionTitle = false;
    let composerNoticeTimeout = null;
    let pendingDeleteSessionId = "";
    let visibleSessions = [];

    const TEXT_ATTACHMENT_EXTENSION_RE = /\.(txt|md|mdx|markdown|json|ya?ml|toml|ini|cfg|conf|xml|html?|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|rb|php|java|kt|go|rs|c|cc|cpp|cxx|h|hpp|cs|swift|sh|bash|zsh|fish|sql|graphql|gql|csv|tsv|log|env)$/i;
    const TEXT_ATTACHMENT_NAME_RE = /^(dockerfile|makefile|readme|license|procfile|gemfile|rakefile|brewfile|\.env.*)$/i;
    const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024;
    const MAX_TEXT_ATTACHMENT_CHARS = 40000;
    const MODE_LABELS = {
      ask: "Ask",
      auto: "Auto",
      plan: "Plan",
    };
    const DEFAULT_STREAM_LABEL = "Thinking...";
    const DEFAULT_STREAM_DETAIL = "";
    const STREAM_SPINNER_VERBS = [
      "Womanizing",
      "Gaslighting",
      "Rizzing",
      "Flexing",
      "Sigma-grinding",
      "Ratio-ing",
      "Overthinking",
      "Procrastinating",
      "Redpilling",
      "Hallucinating",
      "Mogging",
      "Looksmaxxing",
      "Aura-farming",
      "Cookin",
      "Smooth-talking",
      "Synthesizing",
      "Refactoring",
      "Interpolating",
      "Vectorizing",
      "Tokenizing",
      "Backpropagating",
      "Quantizing",
      "Hydrating",
      "Orchestrating",
      "Reconciling",
      "Normalizing",
      "Indexing",
      "Sharding",
      "Caching",
      "Diffing",
      "Bundling",
      "Provisioning",
      "Linting",
      "Profiling",
      "Speculating",
      "Postulating",
      "Ruminating",
      "Dissecting",
      "Deciphering",
      "Untangling",
      "Deconstructing",
      "Reassembling",
      "Hypothesizing",
      "Cross-referencing",
      "Recalibrating",
      "Contextualizing",
      "Reframing",
      "Consolidating",
      "Triangulating",
      "Resolving",
      "Aligning",
      "Bridging",
      "Clarifying",
      "Distilling",
      "Tinkering",
      "Wiggling",
      "Bouncing",
      "Scooting",
      "Snickering",
      "Whirring",
      "Fizzing",
      "Zipping",
      "Doodling",
      "Wobbling",
      "Skittering",
      "Puttering",
      "Blooping",
      "Zazzing",
      "Flitting",
      "Swooshing",
      "Chirping",
      "Ticking",
      "Buzzing",
      "Gliding",
      "Scanning",
      "Mapping",
      "Tracing",
      "Parsing",
      "Balancing",
      "Harmonizing",
      "Sequencing",
      "Weaving",
      "Merging",
      "Splitting",
      "Routing",
      "Filtering",
      "Sorting",
      "Matching",
      "Comparing",
      "Expanding",
      "Compressing",
      "Shaping",
      "Framing",
      "Linking",
      "Anchoring",
      "Stabilizing",
      "Calibrating",
      "Fine-tuning",
      "Polishing",
      "Finalizing"
    ];

    function formatReasoningLabel(reasoningEffort) {
      if (!reasoningEffort) return "Auto";
      return reasoningEffort.charAt(0).toUpperCase() + reasoningEffort.slice(1);
    }

    /* ── Markdown renderer ── */
    function escapeHtml(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function formatFileSize(bytes) {
      if (!bytes || bytes < 1024) return (bytes || 0) + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function buildFileMetaLabel(file) {
      const parts = [];
      if (file.mimeType) parts.push(file.mimeType);
      if (typeof file.sizeBytes === "number") parts.push(formatFileSize(file.sizeBytes));
      if (file.truncated) parts.push("truncated");
      return parts.join(" · ");
    }

    function buildPendingImageMetaLabel(img) {
      if (img && img.mimeType) {
        return img.mimeType.replace(/^image\\//, "").toUpperCase();
      }
      return "Image";
    }

    function setComposerNotice(message) {
      if (!statusText || !message) return;
      statusText.textContent = message;
      if (composerNoticeTimeout) clearTimeout(composerNoticeTimeout);
      composerNoticeTimeout = setTimeout(() => {
        statusText.textContent = (state && state.status) || "";
        composerNoticeTimeout = null;
      }, 4000);
    }

    function closeModeMenu() {
      if (modeMenu) modeMenu.classList.remove("open");
    }

    function closeModelMenu() {
      if (modelMenu) modelMenu.classList.remove("open");
    }

    function closeReasoningMenu() {
      if (reasoningMenu) reasoningMenu.classList.remove("open");
    }

    function closeAttachMenu() {
      if (attachMenu) attachMenu.classList.remove("open");
    }

    function closeComposerMenus() {
      closeModeMenu();
      closeModelMenu();
      closeReasoningMenu();
      closeAttachMenu();
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
      html = html.replace(/^\\s*[\\-\\*] (.+)$/gm, "<li>$1</li>");
      html = html.replace(/^\\s*\\d+\\. (.+)$/gm, "<li>$1</li>");
      html = html.replace(/<\\/li>\\s*\\n(?:\\s*\\n)*\\s*<li>/g, "</li>\\n<li>");
      html = html.replace(/((?:<li>.*<\\/li>\\s*)+)/g, "<ul>$1</ul>");
      html = html.replace(/\\n\\n/g, "</p><p>");
      html = html.replace(/\\n/g, "<br>");
      html = "<p>" + html + "</p>";
      html = html.replace(/<p><\\/p>/g, "");
      html = html.replace(/<p>(<h[123]>)/g, "$1");
      html = html.replace(/(<\\/h[123]>)<\\/p>/g, "$1");
      html = html.replace(/<ul>(?:\\s|<br>)+/g, "<ul>");
      html = html.replace(/(?:\\s|<br>)+<\\/ul>/g, "</ul>");
      html = html.replace(/<\\/li>(?:\\s|<br>)+<li>/g, "</li><li>");
      html = html.replace(/<\\/ul>(?:\\s|<br>|<\\/p><p>)+<ul>/g, "");
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
    function getHarnessState(payload) {
      const harnessState = payload && payload.harnessState;
      return harnessState || {
        pendingApprovals: [],
        pendingDiffs: [],
        todoItems: [],
        backgroundTasks: [],
      };
    }

    function getRuntimeHealth(payload) {
      const runtimeHealth = payload && payload.runtimeHealth;
      return runtimeHealth || {
        level: "ok",
        summary: "",
        issues: [],
        suggestions: [],
        actions: [],
      };
    }

    function getPendingApprovalMap(payload) {
      const map = new Map();
      const approvals = getHarnessState(payload).pendingApprovals || [];
      for (const approval of approvals) {
        if (approval && approval.toolCallId) {
          map.set(approval.toolCallId, approval);
        }
      }
      return map;
    }

    function getPendingDiffSet(payload) {
      const set = new Set();
      const pendingDiffs = getHarnessState(payload).pendingDiffs || [];
      for (const diff of pendingDiffs) {
        if (diff && diff.toolCallId) {
          set.add(diff.toolCallId);
        }
      }
      return set;
    }

    function getEffectiveToolStatus(tc, pendingApprovalMap) {
      return pendingApprovalMap.has(tc.id) ? "pending" : tc.status;
    }

    function getPendingToolCalls(toolCalls, pendingApprovalMap) {
      return (toolCalls || []).filter((tc) => getEffectiveToolStatus(tc, pendingApprovalMap) === "pending");
    }

    function truncateText(value, maxLength) {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      if (text.length <= maxLength) return text;
      return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
    }

    function summarizeToolContent(content) {
      const text = String(content || "").trim();
      const lines = text.split("\\n").map((line) => line.trim()).filter(Boolean);
      const firstLine = lines[0] || "";

      let summary = "";
      let detailTitle = "Tool details";

      let match = text.match(/^Web search results for "([^"]+)":/i);
      if (match) {
        summary = 'Used web search for "' + match[1] + '"';
        detailTitle = "Search results";
      }

      if (!summary) {
        match = text.match(/^Command failed(?: \(exit \d+\))?:\s*\`([^\`]+)\`/im);
        if (match) {
          summary = "Command failed: " + match[1];
          detailTitle = "Command output";
        }
      }

      if (!summary) {
        match = text.match(/^Command:\s*\`([^\`]+)\`/im);
        if (match) {
          summary = "Ran command: " + match[1];
          detailTitle = "Command output";
        }
      }

      if (!summary) {
        match = text.match(/^Contents of \`([^\`]+)\`/im);
        if (match) {
          summary = "Listed files: " + match[1];
        }
      }

      if (!summary) {
        match = text.match(/^Content from (https?:\\/\\/\\S+):/im);
        if (match) {
          summary = truncateText("Fetched page: " + match[1], 160);
          detailTitle = "Fetched content";
        }
      }

      if (!summary) {
        match = text.match(/^Workspace symbols matching "([^"]+)"/im);
        if (match) {
          summary = 'Searched workspace symbols: "' + match[1] + '"';
        }
      }

      if (!summary) {
        match = text.match(/^No workspace symbols matched "([^"]+)"/im);
        if (match) {
          summary = 'No workspace symbols matched "' + match[1] + '"';
        }
      }

      if (!summary) {
        match = text.match(/^Opened \`([^\`]+)\`/im);
        if (match) {
          summary = "Opened file: " + match[1];
        }
      }

      if (!summary) {
        match = text.match(/^Opened definition at \`([^\`]+)\`/im);
        if (match) {
          summary = "Opened definition: " + match[1];
        }
      }

      if (!summary) {
        match = text.match(/^\[Context pressure detected:(.+)\]$/im);
        if (match) {
          summary = truncateText("Context pressure detected:" + match[1], 160);
          detailTitle = "Recovery details";
        }
      }

      if (!summary) {
        match = text.match(/^\[Error:\s*(.+?)\]$/im);
        if (match) {
          summary = truncateText("Error: " + match[1], 160);
          detailTitle = "Error details";
        }
      }

      if (!summary) {
        if (/^Task list updated:/im.test(text)) {
          summary = "Updated task list";
          detailTitle = "Task list";
        } else if (/^Blocked by /im.test(firstLine)) {
          summary = truncateText(firstLine, 160);
          detailTitle = "Blocked action";
        } else if (/^Error /im.test(firstLine) || /^Error:/im.test(firstLine)) {
          summary = truncateText(firstLine, 160);
          detailTitle = "Error details";
        }
      }

      if (!summary) {
        summary = truncateText(firstLine || "Tool finished.", 160);
      }

      const shouldCollapse = text.length > 220 || lines.length > 4 || detailTitle !== "Tool details";
      return {
        summary,
        detailTitle,
        details: text,
        shouldCollapse,
      };
    }

    function compactActivityPath(value) {
      const text = String(value || "").trim();
      if (!text) {
        return { primary: "", secondary: "" };
      }

      const normalized = text.replace(/\\\\/g, "/");
      const pieces = normalized.split("/").filter(Boolean);
      const primary = pieces[pieces.length - 1] || normalized;
      return {
        primary,
        secondary: primary !== normalized ? normalized : "",
      };
    }

    function compactNetworkTarget(value) {
      const text = String(value || "").trim();
      if (!text) {
        return { primary: "", secondary: "", host: "" };
      }
      try {
        const parsed = new URL(text);
        const path = (parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "") + (parsed.search || "");
        const compactPath = path.length > 48 ? path.slice(0, 47) + "…" : path;
        const primary = compactPath ? parsed.host + compactPath : parsed.host;
        return {
          primary,
          secondary: text,
          host: parsed.host,
        };
      } catch {
        return { primary: text, secondary: "", host: "" };
      }
    }

    function describeAssistantToolPlan(toolCalls) {
      const calls = Array.isArray(toolCalls) ? toolCalls : [];
      if (!calls.length) return "";
      const types = new Set(calls.map((toolCall) => String(toolCall?.type || "")));

      if (types.has("web_fetch")) {
        return "Checking the referenced page before answering.";
      }
      if (types.has("web_search")) {
        return "Looking up current information before answering.";
      }
      if (types.has("read_file") || types.has("open_file")) {
        return calls.length > 1
          ? "Inspecting the relevant files before responding."
          : "Inspecting the relevant file before responding.";
      }
      if (types.has("edit_file") || types.has("write_file") || types.has("apply_code_action")) {
        return "Reviewing the relevant code before making a change.";
      }
      if (
        types.has("grep") ||
        types.has("glob") ||
        types.has("list_files") ||
        types.has("workspace_symbols") ||
        types.has("document_symbols") ||
        types.has("find_references")
      ) {
        return "Scanning the workspace to find the right files and symbols.";
      }
      if (types.has("diagnostics") || types.has("code_actions") || types.has("hover_symbol")) {
        return "Checking editor context before deciding on the next step.";
      }
      if (types.has("run_command") || types.has("git_status") || types.has("git_diff")) {
        return "Verifying the environment before answering.";
      }
      return "Planning the next step and gathering evidence with tools.";
    }

    function describeToolActivity(tc) {
      const fileTarget = compactActivityPath(tc.filePath || "");
      switch (tc.type) {
        case "read_file":
          return { verb: "Read", target: fileTarget.primary, secondary: fileTarget.secondary, codeTarget: true };
        case "write_file":
        case "edit_file":
          return { verb: "Write", target: fileTarget.primary, secondary: fileTarget.secondary, codeTarget: true };
        case "open_file":
          return { verb: "Open", target: fileTarget.primary, secondary: fileTarget.secondary, codeTarget: true };
        case "open_definition":
        case "go_to_definition":
          return { verb: "Open definition", target: fileTarget.primary || "symbol", secondary: fileTarget.secondary, codeTarget: true };
        case "find_references":
          return { verb: "Find references", target: fileTarget.primary || "symbol", secondary: fileTarget.secondary, codeTarget: true };
        case "document_symbols":
        case "workspace_symbols":
          return { verb: "Inspect symbols", target: tc.query || fileTarget.primary || "workspace", secondary: fileTarget.secondary, codeTarget: !!fileTarget.primary };
        case "hover_symbol":
          return { verb: "Inspect symbol", target: fileTarget.primary || "current symbol", secondary: fileTarget.secondary, codeTarget: true };
        case "code_actions":
          return { verb: "Check code actions", target: fileTarget.primary || "current file", secondary: fileTarget.secondary, codeTarget: true };
        case "apply_code_action":
          return { verb: "Apply code action", target: tc.actionTitle || fileTarget.primary || "selected action", secondary: fileTarget.secondary, codeTarget: !!fileTarget.primary };
        case "diagnostics":
          return { verb: "Check diagnostics", target: fileTarget.primary || "workspace", secondary: fileTarget.secondary, codeTarget: !!fileTarget.primary };
        case "web_search":
          return { verb: "Search", target: tc.query || "the web", secondary: "", codeTarget: false };
        case "web_fetch":
          {
            const networkTarget = compactNetworkTarget(tc.url || "");
            return {
              verb: "Web Fetch",
              target: networkTarget.primary || tc.url || "page",
              secondary: networkTarget.secondary && networkTarget.secondary !== networkTarget.primary
                ? networkTarget.secondary
                : "",
              codeTarget: false,
            };
          }
        case "run_command":
          return { verb: "Run", target: tc.command || "command", secondary: "", codeTarget: true };
        case "grep":
          return { verb: "Search", target: tc.pattern || "code", secondary: tc.glob || "", codeTarget: true };
        case "glob":
        case "list_files":
          return { verb: "Find", target: tc.glob || tc.globPath || tc.filePath || "files", secondary: "", codeTarget: true };
        case "git_status":
          return { verb: "Check", target: "git status", secondary: "", codeTarget: true };
        case "git_diff":
          return { verb: "Check", target: "git diff", secondary: "", codeTarget: true };
        case "git_commit":
          return { verb: "Commit", target: tc.commitMessage || "changes", secondary: "", codeTarget: false };
        case "list_tools":
          return { verb: "Inspect", target: "tools", secondary: "", codeTarget: false };
        case "list_skills":
          return { verb: "Inspect", target: "skills", secondary: "", codeTarget: false };
        case "run_skill":
          return { verb: "Use", target: tc.skillName || "skill", secondary: "", codeTarget: false };
        case "todo_write":
          return { verb: "Update", target: "task list", secondary: "", codeTarget: false };
        case "memory_read":
          return { verb: "Read", target: tc.memoryName || tc.memoryType || "memory", secondary: "", codeTarget: false };
        case "memory_write":
          return { verb: "Write", target: tc.memoryName || tc.memoryType || "memory", secondary: "", codeTarget: false };
        case "memory_delete":
          return { verb: "Delete", target: tc.memoryName || tc.memoryType || "memory", secondary: "", codeTarget: false };
        default:
          return {
            verb: tc.type.replace(/_/g, " "),
            target: fileTarget.primary || tc.query || tc.command || tc.url || "",
            secondary: fileTarget.secondary,
            codeTarget: !!fileTarget.primary || !!tc.command,
          };
      }
    }

    function createActivityDetails(detailTitle, details, options) {
      const detailText = String(details || "").trim();
      if (!detailText) {
        return null;
      }

      const wrap = document.createElement("div");
      wrap.className = "activity-details";

      const detailsWrap = document.createElement("div");
      detailsWrap.className = "tool-details-content";
      detailsWrap.innerHTML = renderInlineMarkdown(detailText);

      const collapsedByDefault = options?.collapsedByDefault !== false;
      detailsWrap.style.display = collapsedByDefault ? "none" : "";

      const toggle = document.createElement("button");
      toggle.className = "tool-details-toggle";
      toggle.type = "button";
      toggle.textContent = collapsedByDefault ? "Show details" : "Hide details";
      toggle.title = detailTitle || "Details";
      toggle.onclick = () => {
        const expanded = detailsWrap.style.display !== "none";
        detailsWrap.style.display = expanded ? "none" : "";
        toggle.textContent = expanded ? "Show details" : "Hide details";
      };

      wrap.appendChild(toggle);
      wrap.appendChild(detailsWrap);
      return wrap;
    }

    function renderActivityRow(options) {
      const row = document.createElement("div");
      row.className = "tool-call-card" + (options.variant ? " activity-variant-" + options.variant : "");

      const header = document.createElement("div");
      header.className = "tool-call-header tool-call-header-inline";

      const left = document.createElement("div");
      left.className = "tool-call-main";

      const line = document.createElement("div");
      line.className = "tool-call-line";

      const dot = document.createElement("span");
      dot.className = "tool-call-dot " + (options.status || "executed");
      line.appendChild(dot);

      const verbEl = document.createElement("span");
      verbEl.className = "tool-call-verb";
      verbEl.textContent = options.verb || "Used";
      line.appendChild(verbEl);

      if (options.target) {
        const targetEl = document.createElement("span");
        targetEl.className = "tool-call-path" + (options.codeTarget ? " tool-call-inline-code" : "");
        targetEl.textContent = options.target;
        line.appendChild(targetEl);
      }

      left.appendChild(line);

      if (options.meta) {
        const metaEl = document.createElement("div");
        metaEl.className = "tool-call-meta";
        metaEl.textContent = options.meta;
        left.appendChild(metaEl);
      }

      if (options.secondary) {
        const secondaryEl = document.createElement("div");
        secondaryEl.className = "tool-call-secondary";
        secondaryEl.textContent = options.secondary;
        left.appendChild(secondaryEl);
      }

      const detailsEl = createActivityDetails(
        options.detailTitle,
        options.details,
        { collapsedByDefault: options.collapsedByDefault },
      );
      if (detailsEl) {
        left.appendChild(detailsEl);
      }

      header.appendChild(left);

      if (options.badgeText) {
        const badge = document.createElement("span");
        badge.className = "tool-status " + (options.status || "executed");
        badge.textContent = options.badgeText;
        header.appendChild(badge);
      }

      row.appendChild(header);
      return row;
    }

    function buildApprovalPrompt(toolCall, approval, pendingDiffSet, queuedCount) {
      const type = String(toolCall?.type || approval?.toolType || "tool_call");
      const fileTarget = compactActivityPath(toolCall?.filePath || approval?.filePath || "");
      const networkTarget = compactNetworkTarget(toolCall?.url || "");
      const diffReady = toolCall && pendingDiffSet.has(toolCall.id);

      let title = "Allow this action?";
      let subject = describePendingToolCall(toolCall, approval);
      let note = "PocketAI needs your confirmation before it continues.";

      switch (type) {
        case "web_fetch":
          title = "Allow fetching this URL?";
          subject = toolCall?.url || approval?.filePath || subject;
          note = "PocketAI wants to fetch this page before it answers.";
          break;
        case "web_search":
          title = "Allow searching the web?";
          subject = toolCall?.query || subject;
          note = "PocketAI wants to look up current information before it answers.";
          break;
        case "run_command":
          title = "Allow running this command?";
          subject = toolCall?.command || subject;
          note = "PocketAI wants to execute a shell command in your workspace.";
          break;
        case "read_file":
        case "open_file":
          title = "Allow reading this file?";
          subject = toolCall?.filePath || approval?.filePath || subject;
          note = "PocketAI wants to inspect a file before it responds.";
          break;
        case "edit_file":
        case "write_file":
        case "apply_code_action":
          title = diffReady ? "Allow applying this change?" : "Allow editing this file?";
          subject = toolCall?.filePath || approval?.filePath || subject;
          note = diffReady
            ? "PocketAI has a diff ready for review."
            : "PocketAI wants to change a file in your workspace.";
          break;
        case "git_commit":
          title = "Allow creating this commit?";
          subject = toolCall?.commitMessage || subject;
          note = "PocketAI wants to create a git commit.";
          break;
        case "grep":
        case "glob":
        case "list_files":
          title = "Allow workspace inspection?";
          note = "PocketAI wants to inspect your workspace before it answers.";
          break;
      }

      const detailBits = [];
      if (networkTarget.host) {
        detailBits.push(networkTarget.host);
      } else if (fileTarget.secondary) {
        detailBits.push(fileTarget.secondary);
      }
      if (queuedCount > 0) {
        detailBits.push(queuedCount + " more queued");
      }
      if (diffReady) {
        detailBits.push("diff ready");
      }

      return {
        type,
        title,
        subject,
        note,
        detail: detailBits.join(" · "),
        diffReady,
      };
    }

    function isToolPlaceholderAssistantMessage(entry) {
      if (!entry || entry.role !== "assistant" || !entry.toolCalls || !entry.toolCalls.length) {
        return false;
      }
      const text = String(entry.content || "").trim();
      return /^\\[Calling tools?:[\\s\\S]*\\]$/i.test(text);
    }

    function createCollapsibleToolDetails(summary, detailTitle, details, options) {
      const shell = document.createElement("div");
      shell.className = "tool-details-shell";

      const summaryEl = document.createElement("div");
      summaryEl.className = "tool-details-summary";
      summaryEl.textContent = summary;
      shell.appendChild(summaryEl);

      const detailText = String(details || "").trim();
      const shouldCollapse = !!options?.collapsedByDefault && !!detailText;

      if (!detailText) {
        return shell;
      }

      if (!shouldCollapse) {
        return shell;
      }

      const detailsWrap = document.createElement("div");
      detailsWrap.className = "tool-details-content";
      detailsWrap.innerHTML = renderInlineMarkdown(detailText);

      detailsWrap.style.display = "none";

      const toggle = document.createElement("button");
      toggle.className = "tool-details-toggle";
      toggle.type = "button";
      toggle.textContent = "Show details";
      toggle.title = detailTitle || "Tool details";
      toggle.onclick = () => {
        const expanded = detailsWrap.style.display !== "none";
        detailsWrap.style.display = expanded ? "none" : "";
        toggle.textContent = expanded ? "Show details" : "Hide details";
      };
      shell.appendChild(toggle);

      shell.appendChild(detailsWrap);
      return shell;
    }

    function findToolCallById(payload, toolCallId) {
      const transcript = Array.isArray(payload?.transcript) ? payload.transcript : [];
      for (let i = transcript.length - 1; i >= 0; i--) {
        const toolCalls = Array.isArray(transcript[i].toolCalls) ? transcript[i].toolCalls : [];
        for (const toolCall of toolCalls) {
          if (toolCall && toolCall.id === toolCallId) {
            return toolCall;
          }
        }
      }
      return null;
    }

    function describePendingToolCall(toolCall, approval) {
      if (toolCall) {
        if (toolCall.type === "web_search") return toolCall.query || "Search the web";
        if (toolCall.type === "web_fetch") return toolCall.url || "Fetch URL";
        if (toolCall.type === "run_command") return toolCall.command || "Run command";
        if (toolCall.type === "grep") {
          return toolCall.pattern
            ? toolCall.pattern + (toolCall.glob ? " (" + toolCall.glob + ")" : "")
            : "Search code";
        }
        if (toolCall.type === "glob") return toolCall.glob || "Find files";
        if (toolCall.type === "git_commit") return toolCall.commitMessage || "Create commit";
        if (toolCall.type === "git_status") return "Inspect git status";
        if (toolCall.type === "git_diff") return "Inspect git diff";
        if (toolCall.type === "list_tools") return toolCall.query || "List tools";
        if (toolCall.type === "list_skills") return toolCall.query || "List skills";
        if (toolCall.type === "run_skill") return toolCall.skillName || "Run skill";
        if (toolCall.type === "diagnostics") return toolCall.filePath || "Inspect diagnostics";
        if (toolCall.type === "find_references" || toolCall.type === "go_to_definition" || toolCall.type === "document_symbols" || toolCall.type === "workspace_symbols" || toolCall.type === "hover_symbol" || toolCall.type === "code_actions" || toolCall.type === "apply_code_action" || toolCall.type === "open_file" || toolCall.type === "open_definition") {
          return toolCall.filePath || "Inspect code";
        }
        return toolCall.filePath || approval?.filePath || "Pending action";
      }
      return approval?.filePath || "Pending action";
    }

    function renderApprovalDock(payload) {
      if (!approvalDock) return;

      const harnessState = getHarnessState(payload);
      const pendingApprovals = Array.isArray(harnessState.pendingApprovals)
        ? harnessState.pendingApprovals
        : [];
      const pendingDiffSet = getPendingDiffSet(payload);

      approvalDock.innerHTML = "";

      if (!pendingApprovals.length) {
        approvalDock.style.display = "none";
        approvalDock.classList.remove("active");
        return;
      }

      approvalDock.style.display = "";
      approvalDock.classList.add("active");
      const currentApproval = pendingApprovals[0];
      const queuedCount = Math.max(0, pendingApprovals.length - 1);
      const currentToolCall = findToolCallById(payload, currentApproval.toolCallId);
      const prompt = buildApprovalPrompt(
        currentToolCall,
        currentApproval,
        pendingDiffSet,
        queuedCount,
      );

      const shell = document.createElement("div");
      shell.className = "approval-dock-shell";

      if (queuedCount > 0) {
        const stack = document.createElement("div");
        stack.className = "approval-dock-stack";
        for (let i = 0; i < Math.min(2, queuedCount); i++) {
          const layer = document.createElement("div");
          layer.className = "approval-dock-stack-layer layer-" + (i + 1);
          stack.appendChild(layer);
        }
        shell.appendChild(stack);
      }

      const card = document.createElement("div");
      card.className = "approval-dock-card";

      const header = document.createElement("div");
      header.className = "approval-dock-header";

      const titleWrap = document.createElement("div");
      titleWrap.className = "approval-dock-title-wrap";

      const label = document.createElement("span");
      label.className = "approval-dock-label";
      label.textContent = "Approval Required";
      titleWrap.appendChild(label);

      const title = document.createElement("div");
      title.className = "approval-dock-title";
      title.textContent = prompt.title;
      titleWrap.appendChild(title);

      const copy = document.createElement("span");
      copy.className = "approval-dock-copy";
      copy.textContent = prompt.note;
      titleWrap.appendChild(copy);
      header.appendChild(titleWrap);

      const badge = document.createElement("span");
      badge.className = "harness-badge pending";
      badge.textContent = pendingApprovals.length === 1 ? "1 pending" : pendingApprovals.length + " pending";
      header.appendChild(badge);
      card.appendChild(header);

      const subject = document.createElement("div");
      subject.className = "approval-dock-path approval-dock-subject";
      subject.textContent = prompt.subject;
      card.appendChild(subject);

      if (prompt.detail) {
        const detail = document.createElement("div");
        detail.className = "approval-dock-detail";
        detail.textContent = prompt.detail;
        card.appendChild(detail);
      }

      const actionRow = document.createElement("div");
      actionRow.className = "approval-dock-actions approval-dock-primary-actions";

      const approveBtn = document.createElement("button");
      approveBtn.className = "tool-btn tool-btn-approve";
      approveBtn.textContent = "Yes";
      approveBtn.disabled = !!payload.busy;
      approveBtn.onclick = () =>
        vscode.postMessage({ type: "approveToolCall", toolCallId: currentApproval.toolCallId });
      actionRow.appendChild(approveBtn);

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "tool-btn tool-btn-reject";
      rejectBtn.textContent = "No";
      rejectBtn.disabled = !!payload.busy;
      rejectBtn.onclick = () =>
        vscode.postMessage({ type: "rejectToolCall", toolCallId: currentApproval.toolCallId });
      actionRow.appendChild(rejectBtn);

      card.appendChild(actionRow);

      const secondaryRow = document.createElement("div");
      secondaryRow.className = "approval-dock-actions approval-dock-secondary-actions";

      if (
        currentToolCall &&
        pendingDiffSet.has(currentApproval.toolCallId) &&
        (currentToolCall.type === "edit_file" || currentToolCall.type === "write_file")
      ) {
        const previewBtn = document.createElement("button");
        previewBtn.className = "tool-btn";
        previewBtn.textContent = "View Diff";
        previewBtn.disabled = !!payload.busy;
        previewBtn.onclick = () =>
          vscode.postMessage({ type: "openDiff", toolCallId: currentApproval.toolCallId });
        secondaryRow.appendChild(previewBtn);
      }

      if (queuedCount > 0) {
        const approveAll = document.createElement("button");
        approveAll.className = "tool-btn";
        approveAll.textContent = "Yes, allow remaining";
        approveAll.disabled = !!payload.busy;
        approveAll.onclick = () => vscode.postMessage({ type: "approveAllToolCalls" });
        secondaryRow.appendChild(approveAll);

        const rejectAll = document.createElement("button");
        rejectAll.className = "tool-btn";
        rejectAll.textContent = "No, decline all";
        rejectAll.disabled = !!payload.busy;
        rejectAll.onclick = () => vscode.postMessage({ type: "rejectAllToolCalls" });
        secondaryRow.appendChild(rejectAll);
      }

      if (secondaryRow.childElementCount) {
        card.appendChild(secondaryRow);
      }

      shell.appendChild(card);
      approvalDock.appendChild(shell);
    }

    /** Build a fingerprint string for a transcript entry so we can detect changes. */
    function msgFingerprint(entry, idx, pendingApprovalMap, pendingDiffSet) {
      const tcPart = entry.toolCalls
        ? entry.toolCalls
            .map((t) =>
              t.id +
              ":" +
              getEffectiveToolStatus(t, pendingApprovalMap) +
              ":" +
              (pendingDiffSet.has(t.id) ? "1" : "0") +
              ":" +
              (t.result || "").length,
            )
            .join(",")
        : "";
      const filePart = entry.files
        ? entry.files
            .map((file) => file.name + ":" + file.content.length + ":" + (file.truncated ? "1" : "0"))
            .join(",")
        : "";
      const imagePart = entry.images?.length || 0;
      return entry.role + ":" + idx + ":" + (entry.content || "").length + ":" + imagePart + ":" + filePart + ":" + tcPart;
    }

    let prevFingerprints = [];

    function renderMessages(payload) {
      const items = payload.transcript || [];
      const pendingApprovalMap = getPendingApprovalMap(payload);
      const pendingDiffSet = getPendingDiffSet(payload);
      const visibleItems = [];

      for (let i = 0; i < items.length; i++) {
        if (items[i].role === "system") continue;
        visibleItems.push({ entry: items[i], idx: i });
      }

      if (!visibleItems.length && !isStreaming) {
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

      const emptyStateEl = messagesEl.querySelector(":scope > .empty-state");
      if (emptyStateEl) {
        emptyStateEl.remove();
      }

      // Build new fingerprints and compare with previous render
      const newFingerprints = [];
      for (const item of visibleItems) {
        newFingerprints.push(
          msgFingerprint(item.entry, item.idx, pendingApprovalMap, pendingDiffSet),
        );
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
        appendMessage(
          visibleItems[j].entry,
          visibleItems[j].idx,
          pendingApprovalMap,
          pendingDiffSet,
        );
      }

      prevFingerprints = newFingerprints;

      // Only scroll if new messages were added at the end
      if (visibleItems.length > firstDiff) {
        scrollToBottom();
      }
    }

    function appendMessage(entry, msgIndex, pendingApprovalMap, pendingDiffSet) {
      const div = document.createElement("div");
      const roleClass = entry.role === "user"
        ? "msg-user"
        : entry.role === "tool"
          ? "msg-tool msg-tool-compact"
          : isToolPlaceholderAssistantMessage(entry)
            ? "msg-assistant msg-activity-group"
            : "msg-assistant";
      div.className = "msg " + roleClass;

      if (entry.role === "tool" && !div.classList.contains("msg-tool-compact")) {
        const label = document.createElement("div");
        label.className = "msg-label";
        label.textContent = "Tool";
        div.appendChild(label);
      }

      const body = document.createElement("div");
      body.className = "msg-body";

      if (entry.role === "assistant" && isToolPlaceholderAssistantMessage(entry)) {
        const thoughtSummary = describeAssistantToolPlan(entry.toolCalls);
        if (thoughtSummary) {
          body.appendChild(
            renderActivityRow({
              verb: "Thought",
              target: thoughtSummary,
              meta: "Preparing the next step.",
              details: "",
              detailTitle: "",
              collapsedByDefault: true,
              status: "executed",
              badgeText: "",
              codeTarget: false,
              variant: "thought",
            }),
          );
        }
      } else if (entry.role === "assistant") {
        body.innerHTML = formatThinkBlocks(entry.content);
      } else if (entry.role === "tool") {
        const toolSummary = summarizeToolContent(entry.content);
        body.appendChild(renderActivityRow({
          verb: "Tool",
          target: toolSummary.summary || "Used tool output",
          meta: "",
          details: toolSummary.shouldCollapse ? toolSummary.details : "",
          detailTitle: toolSummary.detailTitle,
          collapsedByDefault: true,
          status: "executed",
          badgeText: "",
          codeTarget: false,
        }));
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
      if (entry.files && entry.files.length) {
        const fileList = document.createElement("div");
        fileList.className = "msg-attachment-list";
        for (const file of entry.files) {
          const fileCard = document.createElement("div");
          fileCard.className = "msg-file-attachment";

          const nameEl = document.createElement("span");
          nameEl.className = "name";
          nameEl.textContent = file.name || "attached file";
          fileCard.appendChild(nameEl);

          const metaEl = document.createElement("span");
          metaEl.className = "meta";
          metaEl.textContent = buildFileMetaLabel(file) || "attached file";
          fileCard.appendChild(metaEl);

          fileList.appendChild(fileCard);
        }
        body.appendChild(fileList);
      }
      if (body.innerHTML.trim() || body.childNodes.length) {
        div.appendChild(body);
      }

      if (entry.role === "assistant" && messageStats.has(msgIndex)) {
        const stats = messageStats.get(msgIndex);
        div.classList.add("msg-has-stats");
        const statsEl = document.createElement("div");
        statsEl.className = "msg-stats";
        const responseModel = stats.responseModel || "";
        const tps = stats.tokPerSec > 0 ? stats.tokPerSec.toFixed(1) + " tok/s" : "";
        const tokens = stats.totalTokens ? "~" + stats.totalTokens + " tokens" : "";
        const elapsed = stats.elapsed > 0 ? stats.elapsed.toFixed(1) + "s" : "";
        statsEl.textContent = [responseModel, tps, tokens, elapsed].filter(Boolean).join(" \\u00b7 ");
        statsEl.title = responseModel
          ? "Actual model and generation stats for this response"
          : "Generation stats for this response";
        div.appendChild(statsEl);
      }

      if (entry.toolCalls && entry.toolCalls.length) {
        for (const tc of entry.toolCalls) {
          div.appendChild(renderToolCall(tc, pendingApprovalMap, pendingDiffSet));
        }
      }

      // Fork feature hidden for now — will be re-introduced via right-click context menu

      messagesEl.appendChild(div);
    }

    function renderToolCall(tc, pendingApprovalMap, pendingDiffSet) {
      const effectiveStatus = getEffectiveToolStatus(tc, pendingApprovalMap);
      const activity = describeToolActivity(tc);
      const toolSummary = tc.result ? summarizeToolContent(tc.result) : null;

      let meta = "";
      let details = "";
      let detailTitle = "Tool details";
      if (toolSummary) {
        meta = toolSummary.summary || "";
        if (toolSummary.details && toolSummary.shouldCollapse) {
          details = toolSummary.details;
          detailTitle = toolSummary.detailTitle;
        }
      } else if (effectiveStatus === "pending") {
        meta = pendingDiffSet.has(tc.id) ? "Diff ready. Waiting for approval." : "Waiting for approval.";
      } else if (effectiveStatus === "rejected") {
        meta = "Skipped.";
      } else if (effectiveStatus === "error") {
        meta = "Tool failed.";
      }

      if (!meta && activity.secondary) {
        meta = activity.secondary;
      }

      return renderActivityRow({
        verb: activity.verb,
        target: activity.target,
        meta,
        details,
        detailTitle,
        collapsedByDefault: true,
        status: effectiveStatus,
        badgeText:
          effectiveStatus === "pending"
            ? "awaiting approval"
            : effectiveStatus === "error"
              ? "error"
              : effectiveStatus === "rejected"
                ? "declined"
                : "",
        codeTarget: activity.codeTarget,
        secondary: !meta ? activity.secondary : "",
      });
    }

    function renderHarnessPane(payload) {
      if (!harnessPane) return;

      const harnessState = getHarnessState(payload);
      const pendingApprovals = Array.isArray(harnessState.pendingApprovals)
        ? harnessState.pendingApprovals
        : [];
      const todoItems = Array.isArray(harnessState.todoItems)
        ? harnessState.todoItems
        : [];
      const runtimeHealth = getRuntimeHealth(payload);
      const now = Date.now();
      const backgroundTasks = (Array.isArray(harnessState.backgroundTasks)
        ? harnessState.backgroundTasks
        : []
      ).filter((task) => {
        const updatedAt = typeof task.updatedAt === "number" ? task.updatedAt : 0;
        return (
          task.status === "running" ||
          task.status === "failed" ||
          task.status === "interrupted" ||
          now - updatedAt < 15000
        );
      }).slice(0, 3);

      harnessPane.innerHTML = "";

      if (
        runtimeHealth.level === "ok" &&
        !todoItems.length &&
        !backgroundTasks.length
      ) {
        harnessPane.style.display = "none";
        harnessPane.classList.remove("active");
        return;
      }

      harnessPane.style.display = "";
      harnessPane.classList.add("active");

      if (runtimeHealth.level !== "ok") {
        const card = document.createElement("div");
        card.className = "harness-card";

        const header = document.createElement("div");
        header.className = "harness-card-header";

        const title = document.createElement("div");
        title.className = "harness-card-title";

        const label = document.createElement("span");
        label.className = "harness-card-label";
        label.textContent = "Status";
        title.appendChild(label);

        const copy = document.createElement("span");
        copy.className = "harness-card-copy";
        copy.textContent = runtimeHealth.summary || "Harness status update.";
        title.appendChild(copy);
        header.appendChild(title);

        const badge = document.createElement("span");
        badge.className = "harness-badge " + runtimeHealth.level;
        badge.textContent = runtimeHealth.level;
        header.appendChild(badge);
        card.appendChild(header);

        if (Array.isArray(runtimeHealth.issues) && runtimeHealth.issues.length) {
          const issues = document.createElement("div");
          issues.className = "harness-health-list";
          for (const issue of runtimeHealth.issues.slice(0, 3)) {
            const item = document.createElement("div");
            item.className = "harness-health-item";
            item.textContent = issue;
            issues.appendChild(item);
          }
          card.appendChild(issues);
        }

        if (Array.isArray(runtimeHealth.suggestions) && runtimeHealth.suggestions.length) {
          const meta = document.createElement("div");
          meta.className = "harness-card-meta";
          meta.textContent = "Next: " + runtimeHealth.suggestions[0];
          card.appendChild(meta);
        }

        if (Array.isArray(runtimeHealth.actions) && runtimeHealth.actions.length) {
          const actions = document.createElement("div");
          actions.className = "harness-card-actions";

          for (const action of runtimeHealth.actions) {
            const btn = document.createElement("button");
            btn.className = "tool-btn tool-btn-approve";
            btn.disabled = !!payload.busy;

            if (action === "compact") {
              btn.textContent = "Compact";
              btn.onclick = () =>
                vscode.postMessage({ type: "sendPrompt", prompt: "/compact" });
            } else if (action === "refresh-models") {
              btn.textContent = "Refresh Models";
              btn.onclick = () => vscode.postMessage({ type: "refreshModels" });
            } else if (action === "show-jobs") {
              btn.textContent = "Jobs";
              btn.onclick = () =>
                vscode.postMessage({ type: "sendPrompt", prompt: "/jobs" });
            } else {
              continue;
            }

            actions.appendChild(btn);
          }

          if (actions.childElementCount) {
            card.appendChild(actions);
          }
        }

        harnessPane.appendChild(card);
      }

      if (todoItems.length) {
        const card = document.createElement("div");
        card.className = "harness-card";

        const header = document.createElement("div");
        header.className = "harness-card-header";

        const title = document.createElement("div");
        title.className = "harness-card-title";

        const label = document.createElement("span");
        label.className = "harness-card-label";
        label.textContent = "Plan";
        title.appendChild(label);

        const copy = document.createElement("span");
        copy.className = "harness-card-copy";
        copy.textContent =
          todoItems.length === 1
            ? "1 tracked step for the current task."
            : todoItems.length + " tracked steps for the current task.";
        title.appendChild(copy);
        header.appendChild(title);

        const inProgressCount = todoItems.filter((item) => item.status === "in_progress").length;
        const completedCount = todoItems.filter((item) => item.status === "completed").length;
        const badge = document.createElement("span");
        badge.className =
          "harness-badge " + (
            inProgressCount
              ? "in_progress"
              : completedCount === todoItems.length
                ? "completed"
                : "pending"
          );
        badge.textContent = inProgressCount
          ? inProgressCount + " active"
          : completedCount === todoItems.length
            ? "done"
            : (todoItems.length - completedCount) + " open";
        header.appendChild(badge);
        card.appendChild(header);

        const list = document.createElement("div");
        list.className = "harness-task-list";

        for (const item of todoItems) {
          const row = document.createElement("div");
          row.className = "harness-task-row harness-todo-row " + item.status;

          const top = document.createElement("div");
          top.className = "harness-task-top";

          const content = document.createElement("div");
          content.className = "harness-todo-content";
          content.textContent = item.content;
          top.appendChild(content);

          const itemBadge = document.createElement("span");
          itemBadge.className = "harness-badge " + item.status;
          itemBadge.textContent =
            item.status === "in_progress"
              ? "in progress"
              : item.status;
          top.appendChild(itemBadge);

          row.appendChild(top);
          list.appendChild(row);
        }

        card.appendChild(list);
        harnessPane.appendChild(card);
      }

      if (backgroundTasks.length) {
        const card = document.createElement("div");
        card.className = "harness-card";

        const header = document.createElement("div");
        header.className = "harness-card-header";

        const title = document.createElement("div");
        title.className = "harness-card-title";

        const label = document.createElement("span");
        label.className = "harness-card-label";
        label.textContent = "Tasks";
        title.appendChild(label);

        const copy = document.createElement("span");
        copy.className = "harness-card-copy";
        copy.textContent =
          backgroundTasks.length === 1
            ? "1 background command is active or recently finished."
            : backgroundTasks.length + " background commands are active or recently finished.";
        title.appendChild(copy);
        header.appendChild(title);

        const runningCount = backgroundTasks.filter((task) => task.status === "running").length;
        const cancelledCount = backgroundTasks.filter((task) => task.status === "cancelled").length;
        const interruptedCount = backgroundTasks.filter((task) => task.status === "interrupted").length;
        const badge = document.createElement("span");
        badge.className =
          "harness-badge " + (
            runningCount
              ? "running"
              : backgroundTasks.some((task) => task.status === "failed")
                ? "failed"
                : interruptedCount
                  ? "interrupted"
                : cancelledCount
                  ? "cancelled"
                  : "completed"
          );
        badge.textContent = runningCount
          ? runningCount + " running"
          : backgroundTasks.some((task) => task.status === "failed")
            ? "attention"
            : interruptedCount
              ? interruptedCount + " interrupted"
            : cancelledCount
              ? cancelledCount + " cancelled"
              : "recent";
        header.appendChild(badge);
        card.appendChild(header);

        const clearableCount = backgroundTasks.filter((task) => task.status !== "running").length;
        if (clearableCount) {
          const actions = document.createElement("div");
          actions.className = "harness-card-actions";

          const clearBtn = document.createElement("button");
          clearBtn.className = "tool-btn";
          clearBtn.textContent =
            clearableCount === 1 ? "Clear Finished Job" : "Clear Finished Jobs";
          clearBtn.disabled = !!payload.busy;
          clearBtn.onclick = () =>
            vscode.postMessage({ type: "clearBackgroundTasks" });
          actions.appendChild(clearBtn);

          card.appendChild(actions);
        }

        const list = document.createElement("div");
        list.className = "harness-task-list";

        for (const task of backgroundTasks) {
          const row = document.createElement("div");
          row.className = "harness-task-row";

          const top = document.createElement("div");
          top.className = "harness-task-top";

          const command = document.createElement("div");
          command.className = "harness-task-command";
          command.textContent = task.command || task.id;
          command.title = task.command || task.id;
          top.appendChild(command);

          const taskBadge = document.createElement("span");
          taskBadge.className = "harness-badge " + task.status;
          taskBadge.textContent =
            task.status === "completed" && typeof task.exitCode === "number"
              ? "completed (" + task.exitCode + ")"
              : task.status === "failed" && typeof task.exitCode === "number"
                ? "failed (" + task.exitCode + ")"
                : task.status === "interrupted"
                  ? "interrupted"
                : task.status;
          top.appendChild(taskBadge);
          row.appendChild(top);

          if (task.status === "running") {
            const actions = document.createElement("div");
            actions.className = "harness-task-actions";

            const detailsBtn = document.createElement("button");
            detailsBtn.className = "tool-btn";
            detailsBtn.textContent = "Details";
            detailsBtn.disabled = !!payload.busy;
            detailsBtn.onclick = () =>
              vscode.postMessage({ type: "sendPrompt", prompt: "/jobs " + task.id });
            actions.appendChild(detailsBtn);

            const cancelBtn = document.createElement("button");
            cancelBtn.className = "tool-btn tool-btn-reject";
            cancelBtn.textContent = "Cancel";
            cancelBtn.disabled = !!payload.busy;
            cancelBtn.onclick = () =>
              vscode.postMessage({ type: "cancelBackgroundTask", taskId: task.id });
            actions.appendChild(cancelBtn);

            row.appendChild(actions);
          } else {
            const actions = document.createElement("div");
            actions.className = "harness-task-actions";

            const detailsBtn = document.createElement("button");
            detailsBtn.className = "tool-btn";
            detailsBtn.textContent = "Details";
            detailsBtn.disabled = !!payload.busy;
            detailsBtn.onclick = () =>
              vscode.postMessage({ type: "sendPrompt", prompt: "/jobs " + task.id });
            actions.appendChild(detailsBtn);

            const rerunBtn = document.createElement("button");
            rerunBtn.className = "tool-btn tool-btn-approve";
            rerunBtn.textContent = "Rerun";
            rerunBtn.disabled = !!payload.busy;
            rerunBtn.onclick = () =>
              vscode.postMessage({ type: "rerunBackgroundTask", taskId: task.id });
            actions.appendChild(rerunBtn);

            row.appendChild(actions);
          }

          if (task.outputPreview) {
            const preview = document.createElement("div");
            preview.className = "harness-task-preview";
            preview.textContent = task.outputPreview.length > 220
              ? task.outputPreview.slice(-220)
              : task.outputPreview;
            row.appendChild(preview);
          }

          list.appendChild(row);
        }

        card.appendChild(list);
        harnessPane.appendChild(card);
      }
    }

    function renderActiveSkills(payload) {
      if (!activeSkillsEl) return;

      const activeSkills = Array.isArray(payload.activeSkills) ? payload.activeSkills : [];
      activeSkillsEl.innerHTML = "";

      if (!activeSkills.length) {
        activeSkillsEl.style.display = "none";
        activeSkillsEl.classList.remove("active");
        return;
      }

      activeSkillsEl.style.display = "";
      activeSkillsEl.classList.add("active");

      const label = document.createElement("span");
      label.className = "active-skills-label";
      label.textContent = activeSkills.length === 1 ? "Active skill" : "Active skills";
      activeSkillsEl.appendChild(label);

      const list = document.createElement("div");
      list.className = "active-skills-list";

      for (const skill of activeSkills) {
        const chip = document.createElement("div");
        chip.className = "active-skill-chip";
        chip.title = skill.description || skill.name;

        const name = document.createElement("span");
        name.className = "active-skill-name";
        name.textContent = skill.name;
        chip.appendChild(name);

        if (skill.note) {
          const note = document.createElement("span");
          note.className = "active-skill-note";
          note.textContent = skill.note;
          note.title = skill.note;
          chip.appendChild(note);
        }

        if (!payload.busy) {
          const removeBtn = document.createElement("button");
          removeBtn.className = "active-skill-remove";
          removeBtn.type = "button";
          removeBtn.title = "Remove skill";
          removeBtn.textContent = "×";
          removeBtn.onclick = () =>
            vscode.postMessage({ type: "removeActiveSkill", skillId: skill.id });
          chip.appendChild(removeBtn);
        }

        list.appendChild(chip);
      }

      activeSkillsEl.appendChild(list);

      if (activeSkills.length > 1 && !payload.busy) {
        const clearBtn = document.createElement("button");
        clearBtn.className = "active-skills-clear";
        clearBtn.type = "button";
        clearBtn.textContent = "Clear";
        clearBtn.onclick = () => vscode.postMessage({ type: "clearActiveSkills" });
        activeSkillsEl.appendChild(clearBtn);
      }
    }

    function scrollToBottom() {
      requestAnimationFrame(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    }

    function normalizeStreamingPreviewText(text) {
      return String(text || "")
        .replace(/\\r/g, "")
        // Some providers stream with single newlines inside words; join those
        // for preview purposes so the live draft does not look typo-ridden.
        .replace(/([\\p{L}\\p{N}])\\n(?=[\\p{L}\\p{N}])/gu, "$1")
        .replace(/[ \\t]+/g, " ")
        .replace(/\\n{3,}/g, "\\n\\n")
        .trim();
    }

    function summarizeStreamingDraft(text) {
      const normalized = normalizeStreamingPreviewText(text);
      if (!normalized) return "";

      const punctuationBoundaries = [
        ". ",
        "? ",
        "! ",
        ".\\n",
        "?\\n",
        "!\\n",
        ": ",
        ":\\n",
      ];
      let boundary = -1;
      for (const marker of punctuationBoundaries) {
        boundary = Math.max(boundary, normalized.lastIndexOf(marker));
      }

      if (boundary >= 0) {
        const stable = normalized
          .slice(0, boundary + 1)
          .trim();
        if (!stable) return "";
        return stable.length > 140
          ? stable.slice(0, 139).trimEnd() + "…"
          : stable;
      }

      // Without a stable sentence/list boundary yet, keep the live preview
      // conservative so we do not flash half-formed words.
      return "";
    }

    function getStreamingBaseDetail(label, explicitDetail) {
      const provided = String(explicitDetail || "").trim();
      if (provided) return provided;
      const normalizedLabel = String(label || "").trim().toLowerCase();
      if (!normalizedLabel || normalizedLabel === DEFAULT_STREAM_LABEL.toLowerCase()) {
        return "";
      }
      if (normalizedLabel.includes("continuing")) {
        return "Picking up from the previous partial response.";
      }
      if (normalizedLabel.includes("thinking")) {
        return "";
      }
      return "Working on the next step.";
    }

    function getActiveSpinnerVerb() {
      return spinnerVerbRendered || STREAM_SPINNER_VERBS[spinnerVerbIndex % STREAM_SPINNER_VERBS.length] || "Thinking";
    }

    function advanceSpinnerVerb() {
      if (!STREAM_SPINNER_VERBS.length) return;
      spinnerVerbIndex = (spinnerVerbIndex + 1) % STREAM_SPINNER_VERBS.length;
    }

    function stopSpinnerVerbTyping() {
      if (spinnerVerbTypingTimer) {
        clearInterval(spinnerVerbTypingTimer);
        spinnerVerbTypingTimer = null;
      }
    }

    function typeSpinnerVerb(word) {
      stopSpinnerVerbTyping();
      const target = String(word || "").trim();
      spinnerVerbRendered = "";
      refreshStreamingView();
      if (!target) return;

      let idx = 0;
      spinnerVerbTypingTimer = setInterval(() => {
        idx += 1;
        spinnerVerbRendered = target.slice(0, idx);
        refreshStreamingView();
        if (idx >= target.length) {
          stopSpinnerVerbTyping();
        }
      }, 70);
    }

    function stopSpinnerVerbRotation() {
      if (spinnerVerbTimer) {
        clearInterval(spinnerVerbTimer);
        spinnerVerbTimer = null;
      }
      stopSpinnerVerbTyping();
    }

    function startSpinnerVerbRotation() {
      stopSpinnerVerbRotation();
      if (!STREAM_SPINNER_VERBS.length) return;
      spinnerVerbIndex = Math.floor(Math.random() * STREAM_SPINNER_VERBS.length);
      typeSpinnerVerb(STREAM_SPINNER_VERBS[spinnerVerbIndex]);
      spinnerVerbTimer = setInterval(() => {
        advanceSpinnerVerb();
        typeSpinnerVerb(STREAM_SPINNER_VERBS[spinnerVerbIndex]);
      }, 6600);
    }

    function inferStreamingPhase(label) {
      const normalized = String(label || "").trim().toLowerCase();
      if (
        normalized.includes("tool") ||
        normalized.includes("search") ||
        normalized.includes("read") ||
        normalized.includes("fetch") ||
        normalized.includes("run") ||
        normalized.includes("inspect") ||
        normalized.includes("resolve") ||
        normalized.includes("apply") ||
        normalized.includes("update") ||
        normalized.includes("commit")
      ) {
        return "tool";
      }
      if (normalized.includes("draft") || normalized.includes("write") || normalized.includes("continu")) {
        return "draft";
      }
      return "thinking";
    }

    function describeStreamingToolHint(toolName, toolTarget, detail) {
      const target = String(toolTarget || "").trim();
      const extra = String(detail || "").trim();
      switch (toolName) {
        case "read_file":
          return { label: "Reading file...", detail: target || extra || "Inspecting a file." };
        case "write_file":
        case "edit_file":
          return { label: "Preparing edit...", detail: target || extra || "Updating a file." };
        case "run_command":
          return { label: "Running command...", detail: target || extra || "Executing a shell command." };
        case "web_search":
          return { label: "Searching the web...", detail: target || "Looking up information." };
        case "web_fetch":
          return { label: "Fetching page...", detail: target || "Loading a page." };
        case "grep":
          return { label: "Searching code...", detail: [target, extra].filter(Boolean).join(" · ") || "Searching the repo." };
        case "glob":
        case "list_files":
          return { label: "Finding files...", detail: [target, extra].filter(Boolean).join(" · ") || "Scanning the workspace." };
        case "list_tools":
          return { label: "Inspecting tools...", detail: "Checking which actions are available." };
        case "list_skills":
          return { label: "Inspecting skills...", detail: "Checking which skills are available." };
        case "run_skill":
          return { label: "Activating skill...", detail: target || "Preparing a skill-guided response." };
        case "diagnostics":
          return { label: "Inspecting diagnostics...", detail: target || extra || "Checking current issues." };
        case "go_to_definition":
        case "open_definition":
          return { label: "Resolving definition...", detail: target || extra || "Tracing implementation." };
        case "find_references":
          return { label: "Finding references...", detail: target || extra || "Looking for usages." };
        case "document_symbols":
        case "workspace_symbols":
          return { label: "Inspecting symbols...", detail: target || extra || "Scanning symbols." };
        case "hover_symbol":
          return { label: "Inspecting symbol...", detail: target || extra || "Loading symbol details." };
        case "code_actions":
          return { label: "Checking code actions...", detail: target || extra || "Looking for editor fixes." };
        case "apply_code_action":
          return { label: "Applying code action...", detail: target || extra || "Applying an editor fix." };
        case "git_status":
          return { label: "Checking git status...", detail: "Inspecting repository changes." };
        case "git_diff":
          return { label: "Getting diff...", detail: "Reviewing changed lines." };
        case "git_commit":
          return { label: "Committing...", detail: target || "Creating a commit." };
        case "todo_write":
          return { label: "Updating tasks...", detail: target || "Refreshing the task list." };
        case "memory_read":
          return { label: "Reading memory...", detail: target || "Checking saved project memory." };
        case "memory_write":
          return { label: "Writing memory...", detail: target || "Saving project memory." };
        case "memory_delete":
          return { label: "Deleting memory...", detail: target || "Removing saved memory." };
        default:
          return { label: "Using tool...", detail: [target, extra].filter(Boolean).join(" · ") || "" };
      }
    }

    function describeTextToolCall(text) {
      const trimmed = String(text || "").trim();
      if (!trimmed || trimmed.includes("\\n")) return null;

      const patterns = [
        { re: /^@list_tools(?::\s*(.+))?$/i, toolName: "list_tools", targetGroup: 1 },
        { re: /^@list_skills(?::\s*(.+))?$/i, toolName: "list_skills", targetGroup: 1 },
        { re: /^@run_skill:\s*(.+)$/i, toolName: "run_skill", targetGroup: 1 },
        { re: /^@diagnostics(?::\s*(.+))?$/i, toolName: "diagnostics", targetGroup: 1 },
        { re: /^@go_to_definition:\s*(.+)$/i, toolName: "go_to_definition", targetGroup: 1 },
        { re: /^@find_references:\s*(.+)$/i, toolName: "find_references", targetGroup: 1 },
        { re: /^@document_symbols:\s*(.+)$/i, toolName: "document_symbols", targetGroup: 1 },
        { re: /^@read_file:\s*(.+)$/i, toolName: "read_file", targetGroup: 1 },
        { re: /^@web_search:\s*(.+)$/i, toolName: "web_search", targetGroup: 1 },
        { re: /^@list_files:\s*(.+)$/i, toolName: "list_files", targetGroup: 1 },
        { re: /^@run_command:\s*(.+)$/i, toolName: "run_command", targetGroup: 1 },
        { re: /^@grep:\s*(.+)$/i, toolName: "grep", targetGroup: 1 },
        { re: /^@glob:\s*(.+)$/i, toolName: "glob", targetGroup: 1 },
        { re: /^@git_status$/i, toolName: "git_status", targetGroup: 0 },
        { re: /^@git_diff$/i, toolName: "git_diff", targetGroup: 0 },
        { re: /^@git_commit:\s*(.+)$/i, toolName: "git_commit", targetGroup: 1 },
      ];

      for (const pattern of patterns) {
        const match = trimmed.match(pattern.re);
        if (!match) continue;
        const target = pattern.targetGroup ? (match[pattern.targetGroup] || "").trim() : "";
        return describeStreamingToolHint(pattern.toolName, target, "");
      }

      return null;
    }

    function renderStreamingState(options) {
      const label = String(options?.label || DEFAULT_STREAM_LABEL);
      const detail = String(options?.detail || "").trim();
      const draft = String(options?.draft || "").trim();
      const phase = inferStreamingPhase(label);
      const spinnerVerb = String(options?.spinnerVerb || "").trim();
      const elapsed = streamStartTime
        ? ((Date.now() - streamStartTime) / 1000).toFixed(1) + "s"
        : "";

      let html = '<div class="stream-panel">';
      html += '<div class="stream-status-row">';
      html += '<div class="stream-status">';
      html += '<span class="stream-phase-dot ' + escapeHtml(phase) + '"></span>';
      html += '<span class="stream-status-label">' + escapeHtml(label) + "</span>";
      html += "</div>";
      if (elapsed) {
        html += '<div class="stream-elapsed">' + escapeHtml(elapsed) + "</div>";
      }
      html += "</div>";
      if (detail) {
        html += '<div class="stream-detail">' + escapeHtml(detail) + "</div>";
      }
      if (spinnerVerb) {
        html += '<div class="stream-verb-row"><span class="stream-verb-chip">' + escapeHtml(spinnerVerb) + "</span></div>";
      }
      if (draft) {
        html += '<div class="stream-preview">' + escapeHtml(draft) + "</div>";
      }
      html += "</div>";
      return html;
    }

    function refreshStreamingView() {
      if (!streamingEl) return;

      if (streamingToolMode) {
        const currentTool = streamingToolHint
          ? describeStreamingToolHint(
              streamingToolHint.toolName,
              streamingToolHint.toolTarget,
              streamingToolHint.detail,
            )
          : { label: "Calling tools...", detail: "Waiting for the tool payload." };
        streamingEl.innerHTML = renderStreamingState({
          ...currentTool,
          spinnerVerb: getActiveSpinnerVerb(),
        });
        scrollToBottom();
        return;
      }

      const trimmed = streamingText.trim();
      const textToolStatus = describeTextToolCall(trimmed);
      const draftPreview =
        textToolStatus || !trimmed
          ? ""
          : summarizeStreamingDraft(trimmed);

      streamingEl.innerHTML = textToolStatus
        ? renderStreamingState({
            ...textToolStatus,
            spinnerVerb: getActiveSpinnerVerb(),
          })
        : draftPreview
          ? renderStreamingState({
              label: "Drafting response...",
              detail: "The model has started writing.",
              draft: draftPreview,
              spinnerVerb: getActiveSpinnerVerb(),
            })
          : renderStreamingState({
              label: streamingBaseLabel || DEFAULT_STREAM_LABEL,
              detail: streamingBaseDetail || DEFAULT_STREAM_DETAIL,
              spinnerVerb: getActiveSpinnerVerb(),
            });
      scrollToBottom();
    }

    /* ── Streaming ── */
    function startStreaming(options) {
      isStreaming = true;
      streamingText = "";
      streamingToolMode = false;
      streamingToolHint = null;
      streamingBaseLabel = String(options?.label || DEFAULT_STREAM_LABEL).trim() || DEFAULT_STREAM_LABEL;
      streamingBaseDetail = getStreamingBaseDetail(streamingBaseLabel, options?.detail);
      streamStartTime = Date.now();
      streamChunkCount = 0;
      startSpinnerVerbRotation();

      const div = document.createElement("div");
      div.className = "msg msg-assistant";
      div.id = "streaming-msg";

      const body = document.createElement("div");
      body.className = "msg-body";
      body.id = "streaming-body";
      div.appendChild(body);

      messagesEl.appendChild(div);
      streamingEl = body;
      refreshStreamingView();
      scrollToBottom();
    }

    function appendStreamChunk(text) {
      streamingText += text;
      streamChunkCount++;
      refreshStreamingView();
    }

    function endStreaming() {
      isStreaming = false;
      stopSpinnerVerbRotation();
      if (streamingEl) {
        streamingEl.innerHTML = formatThinkBlocks(streamingText);
      }
      streamingEl = null;
      streamingText = "";
      streamingToolMode = false;
      streamingToolHint = null;
      streamingBaseLabel = "";
      streamingBaseDetail = "";
    }

    /* ── Session menu ── */
    function getActiveSession() {
      if (!state?.activeSessionId) return null;
      return {
        id: state.activeSessionId,
        title: state.activeSessionTitle || "PocketAI Code",
      };
    }

    function syncSessionTitle() {
      const activeSession = getActiveSession();
      const title = activeSession ? activeSession.title : "PocketAI Code";
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
        (editingSessionId && editingSessionId === state?.activeSessionId
          ? state?.activeSessionTitle
          : (state?.sessions || []).find(s => s.id === editingSessionId)?.title) ||
        sessionLabel.textContent ||
        "PocketAI Code";
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

    function renderSessionItems(sessions, activeSessionId) {
      sessionList.innerHTML = "";
      for (const s of sessions || []) {
        const item = document.createElement("div");
        const isPendingDelete = pendingDeleteSessionId === s.id;
        item.className =
          "session-menu-item" +
          (s.id === activeSessionId ? " active" : "") +
          (isPendingDelete ? " delete-confirming" : "");
        item.onclick = () => {
          pendingDeleteSessionId = "";
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
        delBtn.className = "delete-btn" + (isPendingDelete ? " confirm" : "");
        delBtn.textContent = isPendingDelete ? "Confirm" : "\\u00d7";
        delBtn.title = isPendingDelete
          ? "Are you sure you want to delete this chat?"
          : "Delete chat";
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (pendingDeleteSessionId === s.id) {
            pendingDeleteSessionId = "";
            vscode.postMessage({ type: "deleteSession", sessionId: s.id });
            return;
          }
          pendingDeleteSessionId = s.id;
          renderSessionItems(visibleSessions, activeSessionId);
        };
        item.appendChild(delBtn);

        sessionList.appendChild(item);
      }
    }

    function renderSessions(payload) {
      visibleSessions = payload.sessions || [];
      syncSessionTitle();
      renderSessionItems(visibleSessions, payload.activeSessionId);
    }

    /* ── State handler ── */
    let lastRenderedSessionId = "";

    function handleState(payload) {
      state = payload;
      pendingDeleteSessionId = "";

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
      streamingToolMode = false;

      const currentMode = payload.mode || "auto";
      if (modeTriggerLabel) {
        modeTriggerLabel.textContent = MODE_LABELS[currentMode] || "Auto";
      }
      if (modeMenu) {
        modeMenu.querySelectorAll("[data-mode]").forEach((btn) => {
          btn.classList.toggle("active", btn.getAttribute("data-mode") === currentMode);
        });
      }

      statusText.textContent = payload.status || "";
      promptEl.disabled = !!payload.busy;
      if (attachmentBtn) attachmentBtn.disabled = !!payload.busy;
      if (attachUploadAction) attachUploadAction.disabled = !!payload.busy;
      if (attachmentInput) attachmentInput.disabled = !!payload.busy;
      if (modeTrigger) modeTrigger.disabled = !!payload.busy;
      if (modelTrigger) {
        modelTrigger.disabled =
          !!payload.busy ||
          (!Array.isArray(payload.models) || payload.models.length === 0) &&
            !payload.selectedModel;
      }
      if (reasoningTrigger) {
        reasoningTrigger.disabled =
          !!payload.busy ||
          !payload.showReasoningControl ||
          !Array.isArray(payload.reasoningOptions) ||
          payload.reasoningOptions.length === 0;
      }

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
      renderActiveSkills(payload);

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
      renderHarnessPane(payload);
      renderApprovalDock(payload);
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
      if (modelMenu) modelMenu.innerHTML = "";

      if (selectedModel && !models.includes(selectedModel)) {
        const unavailableOpt = document.createElement("option");
        unavailableOpt.value = selectedModel;
        unavailableOpt.textContent = selectedModel + " (unavailable)";
        unavailableOpt.selected = true;
        modelSelect.appendChild(unavailableOpt);

        if (modelMenu) {
          const unavailableBtn = document.createElement("button");
          unavailableBtn.className = "composer-menu-item active";
          unavailableBtn.type = "button";
          unavailableBtn.setAttribute("data-model-id", selectedModel);
          unavailableBtn.textContent = selectedModel + " (unavailable)";
          modelMenu.appendChild(unavailableBtn);
        }
      }

      for (const modelId of models) {
        const opt = document.createElement("option");
        opt.value = modelId;
        opt.textContent = modelId;
        if (modelId === selectedModel) opt.selected = true;
        modelSelect.appendChild(opt);

        if (modelMenu) {
          const item = document.createElement("button");
          item.className =
            "composer-menu-item" + (modelId === selectedModel ? " active" : "");
          item.type = "button";
          item.setAttribute("data-model-id", modelId);
          item.textContent = modelId;
          modelMenu.appendChild(item);
        }
      }

      if (!modelSelect.options.length) {
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "No models available";
        emptyOpt.selected = true;
        modelSelect.appendChild(emptyOpt);

        if (modelMenu) {
          const emptyItem = document.createElement("button");
          emptyItem.className = "composer-menu-item";
          emptyItem.type = "button";
          emptyItem.disabled = true;
          emptyItem.textContent = "No models available";
          modelMenu.appendChild(emptyItem);
        }
      }

      if (models.length && !selectedModel) {
        modelSelect.value = models[0];
      }

      if (modelTriggerLabel) {
        modelTriggerLabel.textContent =
          selectedModel ||
          modelSelect.value ||
          "No models available";
      }
      if (modelTrigger) {
        modelTrigger.title =
          selectedModel ||
          modelSelect.value ||
          "No models available";
      }

      modelSelect.disabled = !!payload.busy || models.length === 0;
    }

    function renderReasoningSelect(payload) {
      const showControl = !!payload.showReasoningControl;
      const options = Array.isArray(payload.reasoningOptions) ? payload.reasoningOptions : [];
      const selectedReasoningEffort = payload.selectedReasoningEffort || "";

      reasoningSelect.style.display = "none";
      if (reasoningMenuWrap) {
        reasoningMenuWrap.style.display = showControl ? "" : "none";
      }
      reasoningSelect.innerHTML = "";
      if (reasoningMenu) reasoningMenu.innerHTML = "";

      if (!showControl) {
        closeReasoningMenu();
        return;
      }

      if (selectedReasoningEffort && !options.includes(selectedReasoningEffort)) {
        const unavailableOpt = document.createElement("option");
        unavailableOpt.value = selectedReasoningEffort;
        unavailableOpt.textContent = formatReasoningLabel(selectedReasoningEffort) + " (unavailable)";
        unavailableOpt.selected = true;
        reasoningSelect.appendChild(unavailableOpt);

        if (reasoningMenu) {
          const unavailableItem = document.createElement("button");
          unavailableItem.className = "composer-menu-item active";
          unavailableItem.type = "button";
          unavailableItem.setAttribute("data-reasoning-effort", selectedReasoningEffort);
          unavailableItem.textContent = formatReasoningLabel(selectedReasoningEffort) + " (unavailable)";
          reasoningMenu.appendChild(unavailableItem);
        }
      }

      const autoOpt = document.createElement("option");
      autoOpt.value = "";
      autoOpt.textContent = "Auto";
      autoOpt.selected = selectedReasoningEffort === "";
      reasoningSelect.appendChild(autoOpt);
      if (reasoningMenu) {
        const autoItem = document.createElement("button");
        autoItem.className =
          "composer-menu-item" + (selectedReasoningEffort === "" ? " active" : "");
        autoItem.type = "button";
        autoItem.setAttribute("data-reasoning-effort", "");
        autoItem.textContent = "Auto";
        reasoningMenu.appendChild(autoItem);
      }

      for (const option of options) {
        const opt = document.createElement("option");
        opt.value = option;
        opt.textContent = formatReasoningLabel(option);
        if (option === selectedReasoningEffort) opt.selected = true;
        reasoningSelect.appendChild(opt);

        if (reasoningMenu) {
          const item = document.createElement("button");
          item.className =
            "composer-menu-item" + (option === selectedReasoningEffort ? " active" : "");
          item.type = "button";
          item.setAttribute("data-reasoning-effort", option);
          item.textContent = formatReasoningLabel(option);
          reasoningMenu.appendChild(item);
        }
      }

      if (reasoningTriggerLabel) {
        reasoningTriggerLabel.textContent = formatReasoningLabel(selectedReasoningEffort);
      }
      if (reasoningTrigger) {
        reasoningTrigger.title = "Reasoning: " + formatReasoningLabel(selectedReasoningEffort);
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
            startStreaming({
              label: msg.label || DEFAULT_STREAM_LABEL,
              detail: msg.detail || "",
            });
            break;
          case "streamChunk":
            appendStreamChunk(msg.text);
            break;
          case "streamToolCallDetected":
            streamingToolMode = true;
            streamingToolHint = {
              toolName: msg.toolName || "",
              toolTarget: msg.toolTarget || "",
              detail: msg.detail || "",
            };
            streamingText = "";
            refreshStreamingView();
            break;
          case "streamEnd": {
            const elapsedMs = streamStartTime ? Date.now() - streamStartTime : 0;
            const elapsedSec = elapsedMs / 1000;
            const completionTokens = msg.tokenUsage ? msg.tokenUsage.completionTokens : Math.ceil(streamingText.length / 4);
            const tokPerSec = elapsedSec > 0.1 ? (completionTokens / elapsedSec) : 0;

            endStreaming();

            if (state && state.transcript) {
              messageStats.set("__pending__", {
                responseModel: msg.responseModel || "",
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

    /* ── Composer attachments ── */
    let pendingImages = [];
    let pendingFiles = [];
    const attachmentPreviewEl = document.getElementById("attachmentPreview");

    function addImage(data, mimeType, name) {
      pendingImages.push({ data, mimeType, name });
      renderAttachmentPreviews();
    }

    function addFileAttachment(file) {
      pendingFiles.push(file);
      renderAttachmentPreviews();
    }

    function renderAttachmentPreviews() {
      if (!attachmentPreviewEl) return;
      attachmentPreviewEl.innerHTML = "";
      if (!pendingImages.length && !pendingFiles.length) {
        attachmentPreviewEl.style.display = "none";
        return;
      }

      attachmentPreviewEl.style.display = "flex";

      pendingImages.forEach((img, i) => {
        const wrap = document.createElement("div");
        wrap.className = "attachment-preview-item image";

        const thumbWrap = document.createElement("div");
        thumbWrap.className = "attachment-preview-thumb";

        const thumb = document.createElement("img");
        thumb.src = "data:" + img.mimeType + ";base64," + img.data;
        thumb.alt = img.name || "image";
        thumbWrap.appendChild(thumb);
        wrap.appendChild(thumbWrap);

        const contentWrap = document.createElement("div");
        contentWrap.className = "attachment-preview-content";

        const nameEl = document.createElement("div");
        nameEl.className = "attachment-file-name";
        nameEl.textContent = img.name || "Image attachment";
        contentWrap.appendChild(nameEl);

        const metaEl = document.createElement("div");
        metaEl.className = "attachment-file-meta";
        metaEl.textContent = buildPendingImageMetaLabel(img);
        contentWrap.appendChild(metaEl);

        wrap.appendChild(contentWrap);

        const removeBtn = document.createElement("button");
        removeBtn.className = "attachment-preview-remove";
        removeBtn.textContent = "\\u00d7";
        removeBtn.onclick = () => {
          pendingImages.splice(i, 1);
          renderAttachmentPreviews();
        };
        wrap.appendChild(removeBtn);
        attachmentPreviewEl.appendChild(wrap);
      });

      pendingFiles.forEach((file, i) => {
        const wrap = document.createElement("div");
        wrap.className = "attachment-preview-item file";

        const contentWrap = document.createElement("div");
        contentWrap.className = "attachment-preview-content";

        const nameEl = document.createElement("div");
        nameEl.className = "attachment-file-name";
        nameEl.textContent = file.name || "attached file";
        contentWrap.appendChild(nameEl);

        const metaEl = document.createElement("div");
        metaEl.className = "attachment-file-meta";
        metaEl.textContent = buildFileMetaLabel(file) || "attached file";
        contentWrap.appendChild(metaEl);

        wrap.appendChild(contentWrap);

        const removeBtn = document.createElement("button");
        removeBtn.className = "attachment-preview-remove";
        removeBtn.textContent = "\\u00d7";
        removeBtn.onclick = () => {
          pendingFiles.splice(i, 1);
          renderAttachmentPreviews();
        };
        wrap.appendChild(removeBtn);
        attachmentPreviewEl.appendChild(wrap);
      });
    }

    function isProbablyTextFile(file) {
      const type = (file.type || "").toLowerCase();
      const name = (file.name || "").split(/[\\\\/]/).pop() || "";
      if (!type && TEXT_ATTACHMENT_NAME_RE.test(name)) return true;
      if (type.startsWith("text/")) return true;
      if (
        type.includes("json") ||
        type.includes("xml") ||
        type.includes("yaml") ||
        type.includes("javascript") ||
        type.includes("typescript") ||
        type.includes("markdown") ||
        type.includes("graphql") ||
        type.includes("sql") ||
        type.includes("x-sh")
      ) {
        return true;
      }
      return TEXT_ATTACHMENT_EXTENSION_RE.test(name) || TEXT_ATTACHMENT_NAME_RE.test(name);
    }

    function looksBinaryText(text) {
      const sample = (text || "").slice(0, 4000);
      if (!sample) return false;
      const nullCount = (sample.match(/\\u0000/g) || []).length;
      const replacementCount = (sample.match(/\\uFFFD/g) || []).length;
      return nullCount > 0 || replacementCount > sample.length * 0.02;
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
        reader.readAsDataURL(file);
      });
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
        reader.readAsText(file);
      });
    }

    async function handleSelectedFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;

      let attachedCount = 0;
      let truncatedCount = 0;
      let skippedBinaryCount = 0;
      let skippedLargeCount = 0;

      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const result = await readFileAsDataUrl(file);
          if (typeof result !== "string") continue;
          const base64 = result.split(",")[1];
          addImage(base64, file.type, file.name || "attached-image");
          attachedCount += 1;
          continue;
        }

        if (file.size > MAX_TEXT_ATTACHMENT_BYTES) {
          skippedLargeCount += 1;
          continue;
        }

        const result = await readFileAsText(file);
        if (typeof result !== "string") continue;

        const normalized = result.replace(/\\r\\n/g, "\\n");
        if (!isProbablyTextFile(file) && looksBinaryText(normalized)) {
          skippedBinaryCount += 1;
          continue;
        }
        const truncated = normalized.length > MAX_TEXT_ATTACHMENT_CHARS;
        const content = truncated
          ? normalized.slice(0, MAX_TEXT_ATTACHMENT_CHARS) + "\\n... [truncated]"
          : normalized;

        addFileAttachment({
          name: file.name || "attached-file",
          mimeType: file.type || "text/plain",
          content,
          sizeBytes: file.size || content.length,
          truncated,
        });

        attachedCount += 1;
        if (truncated) truncatedCount += 1;
      }

      if (attachedCount || truncatedCount || skippedBinaryCount || skippedLargeCount) {
        const parts = [];
        if (attachedCount) {
          parts.push(
            "Attached " +
              attachedCount +
              " item" +
              (attachedCount === 1 ? "" : "s"),
          );
        }
        if (truncatedCount) {
          parts.push(
            truncatedCount +
              " truncated",
          );
        }
        if (skippedBinaryCount) {
          parts.push(
            skippedBinaryCount +
              " binary file" +
              (skippedBinaryCount === 1 ? "" : "s") +
              " skipped",
          );
        }
        if (skippedLargeCount) {
          parts.push(
            skippedLargeCount +
              " large file" +
              (skippedLargeCount === 1 ? "" : "s") +
              " skipped",
          );
        }
        setComposerNotice(parts.join(" · "));
      }
    }

    function buildAttachmentOnlyPrompt() {
      if (pendingImages.length && pendingFiles.length) return "(see attached files and images)";
      if (pendingFiles.length > 1) return "(see attached files)";
      if (pendingFiles.length === 1) return "(see attached file)";
      if (pendingImages.length > 1) return "(see attached images)";
      return "(see attached image)";
    }

    attachmentBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state && state.busy) return;
      closeModeMenu();
      closeModelMenu();
      closeReasoningMenu();
      attachMenu.classList.toggle("open");
    });

    attachUploadAction.addEventListener("click", () => {
      closeAttachMenu();
      attachmentInput.click();
    });

    attachmentInput.addEventListener("change", async () => {
      try {
        await handleSelectedFiles(attachmentInput.files);
      } catch (error) {
        setComposerNotice(
          "Attachment error: " +
            (error && error.message ? error.message : "Could not read file."),
        );
      } finally {
        attachmentInput.value = "";
        promptEl.focus();
      }
    });

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
            setComposerNotice("Image attached");
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    });

    function submitPrompt() {
      const text = promptEl.value.trim();
      if (!text && !pendingImages.length && !pendingFiles.length) return;
      if (state && state.busy) return;
      closeComposerMenus();
      const msg = {
        type: "sendPrompt",
        prompt: text || buildAttachmentOnlyPrompt(),
      };
      if (pendingImages.length) {
        msg.images = pendingImages.slice();
      }
      if (pendingFiles.length) {
        msg.files = pendingFiles.slice();
      }
      vscode.postMessage(msg);
      promptEl.value = "";
      pendingImages = [];
      pendingFiles = [];
      renderAttachmentPreviews();
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

    modeTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state && state.busy) return;
      closeAttachMenu();
      closeModelMenu();
      closeReasoningMenu();
      modeMenu.classList.toggle("open");
    });

    modeMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      const mode = btn.getAttribute("data-mode");
      closeModeMenu();
      vscode.postMessage({ type: "setMode", mode: mode });
    });

    modelTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state && state.busy) return;
      closeAttachMenu();
      closeModeMenu();
      closeReasoningMenu();
      modelMenu.classList.toggle("open");
    });

    modelMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-model-id]");
      if (!btn) return;
      const modelId = btn.getAttribute("data-model-id");
      if (!modelId) return;
      closeModelMenu();
      vscode.postMessage({ type: "selectModel", modelId: modelId });
    });

    reasoningTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state && state.busy) return;
      closeAttachMenu();
      closeModeMenu();
      closeModelMenu();
      reasoningMenu.classList.toggle("open");
    });

    reasoningMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-reasoning-effort]");
      if (!btn) return;
      const reasoningEffort = btn.getAttribute("data-reasoning-effort");
      if (reasoningEffort === null) return;
      closeReasoningMenu();
      vscode.postMessage({
        type: "selectReasoningEffort",
        reasoningEffort: reasoningEffort,
      });
    });

    sessionTrigger.addEventListener("click", () => {
      sessionMenu.classList.toggle("open");
      const isOpen = sessionMenu.classList.contains("open");
      sessionSearchWrap.style.display = isOpen ? "block" : "none";
      if (!isOpen) {
        pendingDeleteSessionId = "";
        renderSessionItems(visibleSessions, state ? state.activeSessionId : "");
      }
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
      pendingDeleteSessionId = "";
      vscode.postMessage({ type: "newSession" });
      sessionMenu.classList.remove("open");
      sessionSearchWrap.style.display = "none";
    });

    document.addEventListener("click", (e) => {
      if (!sessionMenu.contains(e.target) && !sessionTrigger.contains(e.target)) {
        pendingDeleteSessionId = "";
        sessionMenu.classList.remove("open");
        sessionSearchWrap.style.display = "none";
        renderSessionItems(visibleSessions, state ? state.activeSessionId : "");
      }
      if (modeMenuWrap && !modeMenuWrap.contains(e.target)) {
        closeModeMenu();
      }
      if (modelMenuWrap && !modelMenuWrap.contains(e.target)) {
        closeModelMenu();
      }
      if (reasoningMenuWrap && !reasoningMenuWrap.contains(e.target)) {
        closeReasoningMenu();
      }
      if (attachMenuWrap && !attachMenuWrap.contains(e.target)) {
        closeAttachMenu();
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
      pendingDeleteSessionId = "";
      vscode.postMessage({ type: "searchSessions", query: sessionSearch.value });
    });

    function renderFilteredSessions(sessions) {
      visibleSessions = sessions || [];
      renderSessionItems(visibleSessions, state ? state.activeSessionId : "");
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
