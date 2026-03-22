import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Persistent, file-based memory system for PocketAI.
 *
 * Memories are stored in `.pocketai/memory/` inside the workspace root.
 * Each memory is a JSON entry in `memories.json`. Memories persist across
 * sessions and conversations, allowing the model to recall context about
 * the user, project, and past decisions.
 *
 * Memory types (modeled after Claude Code):
 *   - user:      Info about the user's role, preferences, expertise
 *   - feedback:   Corrections or guidance the user has given
 *   - project:   Ongoing work, goals, decisions not derivable from code
 *   - reference: Pointers to external resources (URLs, tools, dashboards)
 */

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  name: string;
  description: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryStore {
  version: number;
  memories: MemoryEntry[];
}

const MEMORY_DIR = ".pocketai/memory";
const MEMORY_FILE = "memories.json";
const MAX_MEMORIES = 100;

export class MemoryManager {
  private memories: MemoryEntry[] = [];
  private rootPath: string;
  private loaded = false;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /** Directory where memories are stored. */
  private get memoryDir(): string {
    return path.join(this.rootPath, MEMORY_DIR);
  }

  /** Full path to the memories JSON file. */
  private get memoryFilePath(): string {
    return path.join(this.memoryDir, MEMORY_FILE);
  }

  /** Load memories from disk. */
  load(): void {
    try {
      if (fs.existsSync(this.memoryFilePath)) {
        const raw = fs.readFileSync(this.memoryFilePath, "utf-8");
        const store: MemoryStore = JSON.parse(raw);
        this.memories = store.memories || [];
      }
    } catch {
      this.memories = [];
    }
    this.loaded = true;
  }

  /** Save memories to disk. */
  private save(): void {
    try {
      fs.mkdirSync(this.memoryDir, { recursive: true });

      // Add .pocketai to .gitignore if not already there
      this.ensureGitignore();

      const store: MemoryStore = {
        version: 1,
        memories: this.memories,
      };
      fs.writeFileSync(
        this.memoryFilePath,
        JSON.stringify(store, null, 2),
        "utf-8",
      );
    } catch (e) {
      // Silently fail — memory is a nice-to-have, not critical
      console.error("Failed to save memories:", e);
    }
  }

  /** Ensure .pocketai/ is in .gitignore. */
  private ensureGitignore(): void {
    try {
      const gitignorePath = path.join(this.rootPath, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, "utf-8");
        if (!content.includes(".pocketai/")) {
          fs.appendFileSync(gitignorePath, "\n# PocketAI memory\n.pocketai/\n");
        }
      }
    } catch {
      // Not critical
    }
  }

  /** Get all memories. */
  getAll(): MemoryEntry[] {
    if (!this.loaded) this.load();
    return [...this.memories];
  }

  /** Get memories by type. */
  getByType(type: MemoryType): MemoryEntry[] {
    if (!this.loaded) this.load();
    return this.memories.filter((m) => m.type === type);
  }

  /** Search memories by keyword in name, description, or content. */
  search(query: string): MemoryEntry[] {
    if (!this.loaded) this.load();
    const lower = query.toLowerCase();
    return this.memories.filter(
      (m) =>
        m.name.toLowerCase().includes(lower) ||
        m.description.toLowerCase().includes(lower) ||
        m.content.toLowerCase().includes(lower),
    );
  }

  /** Add or update a memory. If a memory with the same name exists, update it. */
  upsert(
    type: MemoryType,
    name: string,
    description: string,
    content: string,
  ): MemoryEntry {
    if (!this.loaded) this.load();

    const existing = this.memories.find(
      (m) => m.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      existing.type = type;
      existing.description = description;
      existing.content = content;
      existing.updatedAt = Date.now();
      this.save();
      return existing;
    }

    // Enforce max memories
    if (this.memories.length >= MAX_MEMORIES) {
      // Remove the oldest memory
      this.memories.sort((a, b) => a.updatedAt - b.updatedAt);
      this.memories.shift();
    }

    const entry: MemoryEntry = {
      id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      name,
      description,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.memories.push(entry);
    this.save();
    return entry;
  }

  /** Remove a memory by name or ID. */
  remove(nameOrId: string): boolean {
    if (!this.loaded) this.load();
    const lower = nameOrId.toLowerCase();
    const index = this.memories.findIndex(
      (m) =>
        m.id === nameOrId || m.name.toLowerCase() === lower,
    );
    if (index >= 0) {
      this.memories.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  /** Clear all memories. */
  clear(): void {
    this.memories = [];
    this.save();
  }

  /**
   * Build a memory context string to inject into the system prompt.
   * Only includes memories if they exist. Keeps it concise.
   */
  buildMemoryContext(): string {
    if (!this.loaded) this.load();
    if (this.memories.length === 0) return "";

    const sections: string[] = ["[Memory — persistent context from previous conversations]"];

    const byType = new Map<MemoryType, MemoryEntry[]>();
    for (const m of this.memories) {
      const list = byType.get(m.type) || [];
      list.push(m);
      byType.set(m.type, list);
    }

    const typeLabels: Record<MemoryType, string> = {
      user: "User Profile",
      feedback: "User Feedback",
      project: "Project Context",
      reference: "References",
    };

    for (const [type, entries] of byType) {
      sections.push(`\n## ${typeLabels[type]}`);
      for (const entry of entries) {
        sections.push(`- **${entry.name}**: ${entry.content}`);
      }
    }

    return sections.join("\n");
  }
}
