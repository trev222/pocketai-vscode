<p align="center">
  <img src="media/logo-black2-zoom.png" alt="PocketAI" width="80" />
</p>

<h1 align="center">PocketAI for VS Code</h1>

<p align="center">
  An agentic AI coding assistant powered by local language models.<br/>
  Works with any OpenAI-compatible API — Ollama, llama.cpp, LM Studio, vLLM, and more.
</p>

<p align="center">
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

PocketAI connects to `http://127.0.0.1:11434` by default (Ollama's default port). Add additional endpoints in settings.

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
| `pocketai.useStructuredTools` | `false` | Use OpenAI function calling instead of text-based tool parsing (enable if your model supports it) |
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
