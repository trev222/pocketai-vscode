import {
  TOOL_DEFINITIONS,
  type OpenAITool,
} from "../../tool-definitions";
import type { ToolCallType } from "../../types";
import type { ToolLoopDeps } from "../../tool-loop";
import { classifyToolRisk } from "../policy";
import {
  getHarnessSkillById,
  listHarnessSkills,
} from "../skills/registry";
import { activateSessionSkill } from "../skills/active";
import {
  executeEditFileTool,
  executeGitCommitTool,
  executeGitDiffTool,
  executeGitStatusTool,
  executeGlobTool,
  executeGrepTool,
  executeListFilesTool,
  executeMemoryDeleteTool,
  executeMemoryReadTool,
  executeMemoryWriteTool,
  executeReadFileTool,
  executeRunCommandTool,
  executeTodoWriteTool,
  executeWebFetchTool,
  executeWebSearchTool,
  executeWriteFileTool,
} from "./core";
import {
  executeCodeActionsTool,
  executeDefinitionTool,
  executeDiagnosticsTool,
  executeDocumentSymbolsTool,
  executeHoverSymbolTool,
  executeOpenFileTool,
  executeOpenDefinitionTool,
  executeWorkspaceSymbolsTool,
  executeReferencesTool,
} from "./ide";
import type {
  HarnessToolDescriptor,
  HarnessToolRegistry,
} from "../types";

function createBuiltinToolBehaviors(
  deps: ToolLoopDeps,
): Partial<
  Record<
    ToolCallType,
    Pick<
      HarnessToolDescriptor,
      "approvalPolicy" | "previewKind" | "execute"
    >
  >
> {
  return {
  list_tools: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall, registry }) => {
      const query = toolCall.query?.trim().toLowerCase() || "";
      const tools = registry.list().filter((tool) => {
        if (!query) return true;
        const haystack = `${tool.name} ${tool.description}`.toLowerCase();
        return haystack.includes(query);
      });

      if (tools.length === 0) {
        return query
          ? `No tools matched "${toolCall.query}".`
          : "No tools are currently available.";
      }

      const label = query
        ? `Available tools matching "${toolCall.query}" (${tools.length}):`
        : `Available tools (${tools.length}):`;
      return `${label}\n${tools
        .map(
          (tool) =>
            `- ${tool.name} [${tool.source}, ${tool.risk}, ${tool.approvalPolicy}, ${tool.previewKind}]: ${tool.description}`,
        )
        .join("\n")}`;
    },
  },
  list_skills: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall, registry }) => {
      const query = toolCall.query?.trim().toLowerCase() || "";
      const skills = registry.listSkills(query);

      if (skills.length === 0) {
        return query
          ? `No skills matched "${toolCall.query}".`
          : "No skills are currently available.";
      }

      const label = query
        ? `Available skills matching "${toolCall.query}" (${skills.length}):`
        : `Available skills (${skills.length}):`;
      return `${label}\n${skills
        .map((skill) => {
          const location =
            skill.source === "workspace" && skill.path
              ? `, ${skill.path}`
              : "";
          return `- ${skill.id} [${skill.source}${location}]: ${skill.description}`;
        })
        .join("\n")}`;
    },
  },
  run_skill: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall, registry }) => {
      const skillId = toolCall.skillName?.trim() || toolCall.query?.trim() || "";
      if (!skillId) {
        return "No skill name was provided. Use list_skills first to discover available skills.";
      }

      const skill = registry.getSkill(skillId);
      if (!skill) {
        return `Unknown skill "${skillId}". Use list_skills to discover available skills.`;
      }

      const extraPrompt = toolCall.skillPrompt?.trim();
      activateSessionSkill(session, skill, extraPrompt);
      const activeCount = session.activeSkills.length;
      return extraPrompt
        ? `Skill "${skill.name}" is now active for this request (${activeCount} active). Apply it to: ${extraPrompt}`
        : `Skill "${skill.name}" is now active for this request (${activeCount} active).`;
    },
  },
  diagnostics: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeDiagnosticsTool(toolCall),
  },
  open_file: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeOpenFileTool(toolCall),
  },
  open_definition: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeOpenDefinitionTool(toolCall),
  },
  workspace_symbols: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeWorkspaceSymbolsTool(toolCall),
  },
  hover_symbol: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeHoverSymbolTool(toolCall),
  },
  code_actions: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeCodeActionsTool(toolCall),
  },
  go_to_definition: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeDefinitionTool(toolCall),
  },
  find_references: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeReferencesTool(toolCall),
  },
  document_symbols: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ toolCall }) => executeDocumentSymbolsTool(toolCall),
  },
  read_file: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeReadFileTool(deps, session, toolCall),
  },
  web_search: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeWebSearchTool(deps, session, toolCall),
  },
  web_fetch: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeWebFetchTool(deps, session, toolCall),
  },
  list_files: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeListFilesTool(deps, session, toolCall),
  },
  grep: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeGrepTool(deps, session, toolCall),
  },
  glob: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeGlobTool(deps, session, toolCall),
  },
  git_status: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeGitStatusTool(deps, session, toolCall),
  },
  git_diff: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeGitDiffTool(deps, session, toolCall),
  },
  todo_write: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeTodoWriteTool(deps, session, toolCall),
  },
  memory_read: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeMemoryReadTool(deps, session, toolCall),
  },
  memory_write: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeMemoryWriteTool(deps, session, toolCall),
  },
  memory_delete: {
    approvalPolicy: "always-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeMemoryDeleteTool(deps, session, toolCall),
  },
  edit_file: {
    approvalPolicy: "mode-auto",
    previewKind: "inline-diff",
    execute: async ({ session, toolCall }) =>
      executeEditFileTool(deps, session, toolCall),
  },
  write_file: {
    approvalPolicy: "mode-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeWriteFileTool(deps, session, toolCall),
  },
  run_command: {
    approvalPolicy: "mode-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeRunCommandTool(deps, session, toolCall),
  },
  git_commit: {
    approvalPolicy: "mode-auto",
    previewKind: "none",
    execute: async ({ session, toolCall }) =>
      executeGitCommitTool(deps, session, toolCall),
  },
  };
}

function toBuiltinDescriptor(
  tool: OpenAITool,
  behaviors: Partial<
    Record<
      ToolCallType,
      Pick<
        HarnessToolDescriptor,
        "approvalPolicy" | "previewKind" | "execute"
      >
    >
  >,
): HarnessToolDescriptor {
  const behavior = behaviors[tool.function.name as ToolCallType] ?? {
      approvalPolicy: "mode-auto" as const,
      previewKind: "none" as const,
    };
  return {
    name: tool.function.name,
    description: tool.function.description,
    risk: classifyToolRisk(tool.function.name),
    source: "builtin",
    definition: tool,
    approvalPolicy: behavior.approvalPolicy,
    previewKind: behavior.previewKind,
    execute: behavior.execute,
  };
}

function toMcpDescriptor(tool: OpenAITool): HarnessToolDescriptor {
  return {
    name: tool.function.name,
    description: tool.function.description,
    risk: classifyToolRisk(tool.function.name, true),
    source: "mcp",
    definition: tool,
    approvalPolicy: "mode-auto",
    previewKind: "none",
  };
}

export function createHarnessToolRegistry(
  deps: ToolLoopDeps,
): HarnessToolRegistry {
  const mcpManager = deps.mcpManager;
  const builtinToolBehaviors = createBuiltinToolBehaviors(deps);
  const builtinToolDescriptors = TOOL_DEFINITIONS.map((tool) =>
    toBuiltinDescriptor(tool, builtinToolBehaviors),
  );
  const builtinToolDescriptorMap = new Map(
    builtinToolDescriptors.map((tool) => [tool.name, tool]),
  );

  return {
    list() {
      const mcpTools = (mcpManager?.getToolDefinitions() ?? []).map(
        toMcpDescriptor,
      );
      return [...builtinToolDescriptors, ...mcpTools];
    },

    getToolDescriptor(toolName: string) {
      if (mcpManager?.isMcpTool(toolName)) {
        const tool = (mcpManager.getToolDefinitions() ?? []).find(
          (candidate) => candidate.function.name === toolName,
        );
        return tool ? toMcpDescriptor(tool) : undefined;
      }

      return builtinToolDescriptorMap.get(toolName);
    },

    isMcpTool(toolName: string) {
      return mcpManager?.isMcpTool(toolName) ?? false;
    },

    getStructuredToolDefinitions() {
      const extraTools = mcpManager?.getToolDefinitions() ?? [];
      return extraTools.length
        ? [...TOOL_DEFINITIONS, ...extraTools]
        : TOOL_DEFINITIONS;
    },

    listSkills(query) {
      const normalizedQuery = query?.trim().toLowerCase() || "";
      return listHarnessSkills().filter((skill) => {
        if (!normalizedQuery) return true;
        const haystack =
          `${skill.id} ${skill.name} ${skill.description}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    },

    getSkill(skillId) {
      return getHarnessSkillById(skillId);
    },
  };
}
