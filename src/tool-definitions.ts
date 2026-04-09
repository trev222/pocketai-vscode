/**
 * OpenAI-compatible function/tool definitions for structured tool calling.
 * Modeled after Claude Code's tool interface — detailed descriptions, full
 * parameter sets, and explicit usage guidance in each description.
 */

export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const TOOL_DEFINITIONS: OpenAITool[] = [
  /* ------------------------------------------------------------------ */
  /*  Tool Discovery                                                     */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "list_tools",
      description:
        "Lists the tools currently available to you, including their safety/risk level and what they are for. " +
        "Use this when you are unsure which tool to use or want to discover capabilities before acting. " +
        "Optionally pass a query to filter tools by name or description.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Optional search text to filter the available tools by name or description.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_skills",
      description:
        "Lists reusable built-in and workspace-local skills you can activate for the current request. " +
        "Use this when you want to discover higher-level workflows like debugging, review, testing, or refactoring before acting. " +
        "Optionally pass a query to filter skills by name or description.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Optional search text to filter available skills by name or description.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_skill",
      description:
        "Activates a reusable skill for the rest of the current request. " +
        "Use this when a known workflow should guide how you approach the task, such as debugging, reviewing, or writing tests. " +
        "After activating the skill, continue solving the user's task with the skill instructions in mind.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "The skill id to activate. Use list_skills first if you do not know what skills are available.",
          },
          prompt: {
            type: "string",
            description:
              "Optional note describing how to apply the skill to the current task.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "diagnostics",
      description:
        "Reads current VS Code diagnostics (errors and warnings) for the workspace or a single file. " +
        "Use this to inspect compile errors, type errors, lint failures, and warnings before editing. " +
        "Prefer this over guessing from the user's error summary when diagnostics are likely available.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Optional relative file path to scope diagnostics to one file. Omit to inspect workspace-wide diagnostics.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "go_to_definition",
      description:
        "Resolves the definition of the symbol at a specific file position using VS Code's language intelligence. " +
        "Use this after reading a file when you need to jump to an imported function, type, variable, or method definition.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the source file that contains the symbol usage.",
          },
          line: {
            type: "number",
            description: "1-based line number of the symbol usage.",
          },
          character: {
            type: "number",
            description:
              "0-based character offset on the line. If unsure, use the start of the symbol.",
          },
        },
        required: ["path", "line", "character"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_file",
      description:
        "Opens a workspace file in the VS Code editor and optionally reveals a specific line or position. " +
        "Use this when you want to surface the exact file for the user, verify the active editor location, or move attention to a concrete implementation site after analysis.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the file to open in the editor.",
          },
          line: {
            type: "number",
            description:
              "Optional 1-based line number to reveal. If omitted, opens the file at its current/default position.",
          },
          character: {
            type: "number",
            description:
              "Optional 0-based character offset on the target line. Defaults to 0 when line is provided.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_definition",
      description:
        "Finds the definition for the symbol at a specific file position and opens that definition directly in the VS Code editor. " +
        "Use this when you want to navigate from a usage site to the real implementation instead of only listing candidate definition locations.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the source file that contains the symbol usage.",
          },
          line: {
            type: "number",
            description: "1-based line number of the symbol usage.",
          },
          character: {
            type: "number",
            description:
              "0-based character offset on the line. If unsure, use the start of the symbol.",
          },
        },
        required: ["path", "line", "character"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace_symbols",
      description:
        "Searches for matching symbols across the workspace using VS Code's language intelligence. " +
        "Use this when you know a class, function, method, type, or constant name but not the file where it is defined.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search text for the symbol name. Partial names are allowed.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hover_symbol",
      description:
        "Reads hover/type/documentation information for the symbol at a specific file position using VS Code's language intelligence. " +
        "Use this to inspect inferred types, signatures, docs, or quick info before editing or explaining code.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the source file that contains the symbol usage.",
          },
          line: {
            type: "number",
            description: "1-based line number of the symbol usage.",
          },
          character: {
            type: "number",
            description:
              "0-based character offset on the line. If unsure, use the start of the symbol.",
          },
        },
        required: ["path", "line", "character"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "code_actions",
      description:
        "Lists available VS Code code actions at a specific file position, such as quick fixes, refactors, or source actions. " +
        "Use this to see what the language server/editor suggests before making manual edits.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the source file to inspect.",
          },
          line: {
            type: "number",
            description: "1-based line number to inspect for code actions.",
          },
          character: {
            type: "number",
            description:
              "0-based character offset on the line. If unsure, use the start of the symbol or error.",
          },
        },
        required: ["path", "line", "character"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_references",
      description:
        "Finds references to the symbol at a specific file position using VS Code's language intelligence. " +
        "Use this to understand call sites, usages, and impact before refactoring.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the source file that contains the symbol usage.",
          },
          line: {
            type: "number",
            description: "1-based line number of the symbol usage.",
          },
          character: {
            type: "number",
            description:
              "0-based character offset on the line. If unsure, use the start of the symbol.",
          },
          include_declaration: {
            type: "boolean",
            description:
              "Whether to include the declaration/reference site itself. Defaults to true.",
          },
        },
        required: ["path", "line", "character"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "document_symbols",
      description:
        "Lists the symbols in a file using VS Code's language intelligence. " +
        "Use this to quickly inspect functions, classes, methods, constants, and nested members before reading or editing.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the source file to inspect.",
          },
        },
        required: ["path"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Read                                                               */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Reads a file from the workspace. Returns contents with line numbers (cat -n format). " +
        "By default reads up to 2000 lines. Use offset/limit for large files. " +
        "Lines longer than 2000 characters are truncated. " +
        "Always read a file before editing it. " +
        "Use this instead of run_command with cat, head, or tail. " +
        "If you need to find a file first, use glob or grep — not this tool with a guessed path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the file to read",
          },
          offset: {
            type: "number",
            description:
              "Line number to start reading from (1-based). Only provide for large files.",
          },
          limit: {
            type: "number",
            description:
              "Number of lines to read. Only provide if the file is too large to read at once.",
          },
        },
        required: ["path"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Edit                                                               */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Performs exact string replacements in files. " +
        "The old_string must match the file content EXACTLY including whitespace and indentation — copy it from the read_file output, preserving everything after the line number prefix. " +
        "The edit will FAIL if old_string is not unique in the file — provide a larger string with more surrounding context to make it unique. " +
        "Use replace_all to change every occurrence (e.g. renaming a variable). " +
        "You MUST read a file with read_file before editing it. " +
        "Prefer editing existing files over creating new ones. " +
        "Use this instead of run_command with sed or awk.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the file to modify",
          },
          old_string: {
            type: "string",
            description: "The exact text to find and replace",
          },
          new_string: {
            type: "string",
            description: "The replacement text (must be different from old_string)",
          },
          replace_all: {
            type: "boolean",
            description:
              "Replace all occurrences of old_string (default false). Useful for renaming variables or strings across the file.",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Write                                                              */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Writes a file to the workspace. Overwrites the existing file if one exists. " +
        "If this is an existing file, you MUST use read_file first. " +
        "Prefer edit_file for modifying existing files — it only sends the diff. " +
        "Only use this tool to create new files or for complete rewrites. " +
        "Creates parent directories automatically. " +
        "Do not create documentation files (*.md, README) unless the user explicitly asks. " +
        "Do not create files unless they are necessary for the task.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path for the file",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Glob                                                               */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "glob",
      description:
        'Fast file pattern matching. Supports glob patterns like "**/*.ts" or "src/**/*.tsx". ' +
        "Returns matching file paths sorted by modification time. " +
        "Use this when you need to find files by name, extension, or path pattern. " +
        "For searching file contents, use grep instead. " +
        "For a known specific file path, use read_file directly instead.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: 'Glob pattern to match files (e.g. "**/*.ts", "src/**/*.tsx")',
          },
          path: {
            type: "string",
            description:
              "Directory to search in. Defaults to workspace root. Useful for scoping searches.",
          },
        },
        required: ["pattern"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Grep                                                               */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "Search file contents across the workspace using regex. " +
        'Supports full regex syntax (e.g. "log.*Error", "function\\\\s+\\\\w+"). ' +
        "Output modes: \"files_with_matches\" (default) returns file paths — use when you just need to locate files. " +
        '"content" returns matching lines with optional context — use when you need to see the actual code. ' +
        '"count" returns match counts per file — use when you need to gauge frequency. ' +
        "Use glob parameter to filter files (e.g. \"*.ts\"). " +
        "Use this for searching content. For finding files by name/extension, use glob instead. " +
        "Do not use run_command with grep or rg — use this tool.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for in file contents",
          },
          glob: {
            type: "string",
            description:
              'Glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")',
          },
          type: {
            type: "string",
            description:
              'File type filter (e.g. "ts", "py", "js"). More efficient than glob for standard types.',
          },
          path: {
            type: "string",
            description:
              "File or directory to search in. Defaults to workspace root.",
          },
          output_mode: {
            type: "string",
            enum: ["content", "files_with_matches", "count"],
            description:
              'Output mode. "content" shows matching lines, "files_with_matches" shows file paths (default), "count" shows match counts.',
          },
          context: {
            type: "number",
            description:
              "Number of lines to show before and after each match. Only used with output_mode: content.",
          },
          before: {
            type: "number",
            description:
              "Lines to show before each match (-B). Only with output_mode: content.",
          },
          after: {
            type: "number",
            description:
              "Lines to show after each match (-A). Only with output_mode: content.",
          },
          case_insensitive: {
            type: "boolean",
            description: "Case insensitive search (default false)",
          },
          multiline: {
            type: "boolean",
            description:
              "Enable multiline mode where . matches newlines and patterns can span lines (default false)",
          },
          head_limit: {
            type: "number",
            description:
              "Limit output to first N results. Works across all output modes.",
          },
        },
        required: ["pattern"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Bash (run_command)                                                 */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Executes a shell command in the workspace root and returns its output. " +
        "Use ONLY for operations that have no dedicated tool: builds, installs, test runners, linters, package managers, etc. " +
        "Do NOT use for: reading files (use read_file), searching files (use grep/glob), editing files (use edit_file), writing files (use write_file), or git status/diff (use git_status/git_diff). " +
        "Requires user approval unless in auto mode. " +
        "Timeout: up to 600000ms (10 minutes), default 120000ms (2 minutes). " +
        "Use background mode for long-running processes (dev servers, watchers). " +
        "After starting a background command, you can check it with 'bg_status <taskId>' or stop it with 'bg_cancel <taskId>'. " +
        "Provide a description so the user understands what the command does before approving.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          description: {
            type: "string",
            description:
              "Brief description of what this command does (shown to user for approval)",
          },
          timeout: {
            type: "number",
            description:
              "Timeout in milliseconds (max 600000 / 10 minutes). Default 120000 (2 minutes).",
          },
          background: {
            type: "boolean",
            description:
              "Run in background. Returns immediately with a task ID. Use for long-running processes.",
          },
        },
        required: ["command"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  List Files                                                         */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List the contents of a directory with file sizes. " +
        "For finding files by name pattern, use glob instead. " +
        "For searching file contents, use grep instead. " +
        "Use this when you need to see the immediate contents of a specific directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the directory",
          },
        },
        required: ["path"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Web Search                                                         */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for up-to-date information using DuckDuckGo. " +
        "Returns top results with titles and snippets. " +
        "Use when you need current information that may not be in your training data.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["query"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Web Fetch                                                          */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch the content of a URL. Extracts readable text from HTML pages. " +
        "Use for reading documentation, API references, or any web page content. " +
        "Do NOT use to generate or guess URLs — only fetch URLs provided by the user or found in search results.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
        },
        required: ["url"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Git Status                                                         */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Show the current git working tree status (short format).",
      parameters: { type: "object", properties: {} },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Git Diff                                                           */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "git_diff",
      description:
        "Show current unstaged and staged git changes. Shows both staged and unstaged diffs.",
      parameters: { type: "object", properties: {} },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Git Commit                                                         */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "git_commit",
      description:
        "Stage modified files and create a git commit. Requires user approval. " +
        "Only commit files that were modified during this session. " +
        "Write a concise commit message that focuses on the 'why' rather than the 'what'. " +
        "Never skip hooks or force push. Prefer new commits over amending existing ones.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Commit message",
          },
        },
        required: ["message"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Todo Write                                                         */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "todo_write",
      description:
        "Create or update a task list to track multi-step work. " +
        "Helps organize complex tasks and shows progress to the user. " +
        "Each todo has a content description and status (pending/in_progress/completed).",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string", description: "Task description" },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "Task status",
                },
              },
              required: ["content", "status"],
            },
            description: "The complete todo list (replaces previous list)",
          },
        },
        required: ["todos"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Memory Read                                                        */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "memory_read",
      description:
        "Read persistent memories from previous conversations. " +
        "Use when specific known memories seem relevant, or when the user asks you to recall something. " +
        "Without a query, returns all memories. With a query, searches by keyword.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Optional search query to filter memories by keyword",
          },
          type: {
            type: "string",
            enum: ["user", "feedback", "project", "reference"],
            description: "Optional filter by memory type",
          },
        },
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Memory Write                                                       */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "memory_write",
      description:
        "Save a persistent memory that will be available in future conversations. " +
        "Use when you learn something about the user, receive feedback/correction, " +
        "learn about ongoing project work, or discover useful external references. " +
        "If a memory with the same name exists, it will be updated. " +
        "Types: user (role/preferences), feedback (corrections), project (ongoing work), reference (external pointers).",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["user", "feedback", "project", "reference"],
            description: "Memory type",
          },
          name: {
            type: "string",
            description:
              "Short identifier for this memory (e.g. 'user_role', 'testing_preference')",
          },
          description: {
            type: "string",
            description:
              "One-line description of what this memory is about",
          },
          content: {
            type: "string",
            description: "The memory content to store",
          },
        },
        required: ["type", "name", "content"],
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Memory Delete                                                      */
  /* ------------------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "memory_delete",
      description:
        "Remove a persistent memory by name. Use when the user asks you to forget something.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the memory to remove",
          },
        },
        required: ["name"],
      },
    },
  },
];
