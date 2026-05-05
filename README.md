<p align="center">
  <img src="media/logo-black2-zoom.png" alt="PocketAI" width="80" />
</p>

<h1 align="center">PocketAI for VS Code</h1>

<p align="center">
  An agentic AI coding assistant powered by local language models.<br/>
  Works with any OpenAI-compatible API — Ollama, llama.cpp, LM Studio, vLLM, and more.
</p>

<p align="center">
  <a href="https://pocketaihub.com">pocketaihub.com</a> &middot;
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#configuration">Configuration</a> &middot;
  <a href="#license">License</a>
</p>

---

## Getting Started

1. **Install** the extension from the VS Code marketplace (or build from source)
2. **Start** a local model server — e.g. `ollama serve`
3. **Open** PocketAI with `Cmd+L` (or `Ctrl+L` on Windows/Linux)
4. **Chat** — ask it to read, edit, refactor, debug, or explain your code

PocketAI connects to `http://127.0.0.1:39457` by default. Add additional endpoints in settings.

## Using Codex CLI

PocketAI now includes a built-in **Connect to Codex** section in the settings sidebar.

1. Open the PocketAI sidebar
2. In the settings view, click **Connect to Codex**
3. If you are not signed in yet, PocketAI opens a VS Code terminal and runs `codex login` for you
4. When sign-in completes, PocketAI refreshes the Codex endpoint automatically

What this setup does for you:

- Adds a `Codex Bridge` endpoint at `http://127.0.0.1:39458`
- Starts the local compatibility bridge automatically
- Switches PocketAI to that endpoint for chat
- Keeps Codex chat-first without changing tool behavior for your other endpoints

Manual fallback:

```bash
codex login
npm run codex-bridge
```

Notes:

- `apiKey` is ignored by the bridge. Authentication comes from your local `codex login` session.
- PocketAI remains the executable tool system. The bridge disables Codex-native tools and translates PocketAI tool requests back into PocketAI approvals, inline diffs, and tool execution.
- PocketAI may still send `temperature`, `top_p`, and `max_tokens`, but Codex app-server does not expose Chat Completions-style tuning controls, so those values are not forwarded 1:1.
- If you want Codex to use a different workspace root, you can still launch the bridge manually with `CODEX_BRIDGE_CWD=/path/to/project npm run codex-bridge`.

## Using Claude CLI

PocketAI also includes a built-in **Connect to Claude** section in the settings sidebar.

1. Open the PocketAI sidebar
2. In the settings view, click **Connect to Claude**
3. If you are not signed in yet, PocketAI opens a VS Code terminal and runs `claude auth login` for you
4. When sign-in completes, PocketAI refreshes the Claude endpoint automatically

What this setup does for you:

- Adds a `Claude Bridge` endpoint at `http://127.0.0.1:39460`
- Starts the local compatibility bridge automatically
- Switches PocketAI to that endpoint for chat
- Keeps PocketAI in charge of tool calling while Claude provides the assistant responses

Manual fallback:

```bash
claude auth login
npm run claude-bridge
```

Notes:

- `apiKey` is ignored by the bridge. Authentication comes from your local `claude auth login` session.
- PocketAI remains the executable tool system. The bridge disables Claude-native tools and translates PocketAI tool requests back into PocketAI approvals, inline diffs, and tool execution.
- The bridge runs Claude in print mode with Claude-native tools disabled and slash commands turned off, so the experience stays consistent with PocketAI's own harness.
- If you want Claude to use a different workspace root, you can still launch the bridge manually with `CLAUDE_BRIDGE_CWD=/path/to/project npm run claude-bridge`.

## Features

### Agentic Tool Loop

PocketAI doesn't just generate text — it acts. The model can chain together file reads, edits, terminal commands, searches, and git operations autonomously, looping until the task is done.

### Three Interaction Modes

| Mode | Behavior |
|------|----------|
| **Ask** | Presents each change for approval before applying |
| **Auto** | Non-destructive tools run automatically; destructive ones still require approval |
| **Plan** | Describes what it would do without making any changes |

Switch modes with `/mode ask`, `/mode auto`, or `/mode plan`.

### Inline Diffs

Pending edits appear directly in your editor with highlighted removed lines and ghost-text previews of replacements. Accept or reject changes via CodeLens buttons without leaving the file.

### Integrated Terminal

Shell commands execute in VS Code's integrated terminal so you can see exactly what's running. Output is captured and fed back to the model for the next step.

### Context-Aware

PocketAI automatically gathers context with each message:

- Workspace file tree and active file contents
- Open editor tabs
- Git branch and status
- VS Code diagnostics (errors and warnings)

All configurable — disable any context source in settings.

### More

- **MCP Servers** — Connect external tool servers via [Model Context Protocol](https://modelcontextprotocol.io) for additional capabilities
- **Multi-Session** — Create, fork, search, and switch between independent chat sessions
- **Checkpoints & Undo** — Every file edit creates a checkpoint; rewind code and conversation at any time
- **Project Instructions** — Drop a `.pocketai.md` in your repo root to customize system behavior per-project
- **Hooks** — Run shell commands on lifecycle events (`postEdit`, `preToolUse`, `postCreate`, etc.)
- **Permission Rules** — Allow or deny tool calls with glob patterns (e.g. deny `run_command(rm *)`)
- **Session Compaction** — Auto-summarizes long conversations to stay within your model's context window
- **@ Mentions** — Reference files with `@filename` autocomplete in the chat input
- **Web Search** — The model can search the web when it needs external information
- **Image Support** — Paste or attach images to your prompts (for multimodal models)

## Configuration

All settings live under `pocketai.*` in VS Code settings.

### Endpoints & Models

| Setting | Default | Description |
|---------|---------|-------------|
| `pocketai.endpoints` | Local Ollama | List of OpenAI-compatible API endpoints with per-endpoint model, token limit, and system prompt |
| `pocketai.useStructuredTools` | `true` | Use OpenAI function calling instead of text-based tool parsing (disable if your model does not support it) |
| `pocketai.contextWindowSize` | `8192` | Your model's context window size — used by the token meter and auto-compaction |

### Behavior

| Setting | Default | Description |
|---------|---------|-------------|
| `pocketai.useIntegratedTerminal` | `true` | Run commands in VS Code's terminal instead of a background process |
| `pocketai.includeGitContext` | `true` | Include git branch and status in context |
| `pocketai.includeDiagnostics` | `true` | Include VS Code errors/warnings in context |
| `pocketai.projectInstructionsFile` | `.pocketai.md` | Filename for per-project system prompt instructions |
| `pocketai.maxContinuations` | `3` | Max auto-continuations when the model hits its token limit mid-response |

### MCP Servers

```jsonc
"pocketai.mcpServers": [
  {
    "name": "filesystem",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
  }
]
```

### Permission Rules

```jsonc
"pocketai.permissions": {
  "allow": ["read_file(**)", "grep(**)", "glob(**)"],
  "deny": ["read_file(*.env)", "run_command(rm *)"]
}
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/clear` | Clear the conversation |
| `/model <name>` | Switch model |
| `/mode <ask\|auto\|plan>` | Switch interaction mode |
| `/compact` | Summarize conversation to free context |
| `/fork` | Fork the current session into a new tab |
| `/branch [name]` | Show, create, or switch git branches |
| `/tokens` | Show cumulative token usage for the session |
| `/endpoint [name]` | Switch between configured endpoints |
| `/sessions` | List all sessions |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+L` / `Ctrl+L` | Focus chat input |
| `Cmd+Shift+L` / `Ctrl+Shift+L` | Send current selection to chat |

## Building from Source

```bash
git clone https://github.com/trev222/pocketai-vscode.git
cd pocketai-vscode
npm install
npm run build
```

Then press `F5` in VS Code to launch the extension in a development host.

## License

[MIT](LICENSE)
