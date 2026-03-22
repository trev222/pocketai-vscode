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
        "Always read a file before editing it.",
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
        "The old_string must match the file content EXACTLY including whitespace and indentation. " +
        "The edit will FAIL if old_string is not unique in the file — include more surrounding context to make it unique. " +
        "Use replace_all to change every occurrence (e.g. renaming a variable). " +
        "You MUST read a file before editing it. " +
        "Prefer editing existing files over creating new ones.",
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
        "Creates parent directories automatically.",
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
        "Use this when you need to find files by name or extension.",
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
        "Output modes: \"content\" shows matching lines with context, " +
        '"files_with_matches" shows only file paths (default), ' +
        '"count" shows match counts per file. ' +
        "Use glob parameter to filter files (e.g. \"*.ts\").",
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
        "Use this for system commands and terminal operations that require shell execution. " +
        "Do NOT use this to read files (use read_file), search files (use grep/glob), or edit files (use edit_file). " +
        "Requires user approval. You can specify a timeout up to 600000ms (10 minutes). " +
        "Use background mode for long-running processes.",
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
        "For finding files by pattern, prefer glob instead.",
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
        "Never skip hooks or force push.",
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
