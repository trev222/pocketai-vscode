export type BuiltinHarnessSkill = {
  id: string;
  slashCommand: string;
  name: string;
  description: string;
  prompt: string;
  autoRoutePriority?: number;
  autoRouteMatchers?: RegExp[];
};

const BUILTIN_HARNESS_SKILLS: ReadonlyArray<BuiltinHarnessSkill> = [
  {
    id: "explain",
    slashCommand: "/explain",
    name: "Explain Code",
    description:
      "Explain code clearly, starting with a one-line summary and then walking through the important pieces.",
    prompt:
      "The user wants a clear explanation of code or project behavior. " +
      "Prefer reading the exact file first. Use document_symbols to map the file structure, hover_symbol for type or doc context, go_to_definition for unfamiliar imports or symbols, and find_references when usage context matters. " +
      "Start with a one-sentence summary, then explain the main flow, key data structures, and important edge cases. " +
      "Do not suggest changes unless the user asks for them.",
    autoRoutePriority: 30,
    autoRouteMatchers: [
      /^(?:can you |could you |please |help me )?(?:explain|walk me through|help me understand)\b/i,
      /^(?:what|how)\s+does\b/i,
    ],
  },
  {
    id: "debug",
    slashCommand: "/debug",
    name: "Debug",
    description:
      "Investigate an error or bug, verify the cause with tools, and make the smallest correct fix.",
    prompt:
      "The user wants help debugging a bug, runtime error, failed command, or broken behavior. " +
      "Use diagnostics first when relevant, then read the failing file, inspect document_symbols, use hover_symbol for signatures or inferred types, and use go_to_definition/find_references to trace the real control flow before editing. " +
      "If a command likely reproduces the issue, use run_command carefully. " +
      "State the most likely root cause in one sentence, verify it with evidence from tools, and then apply the smallest correct fix. " +
      "Do not refactor unrelated code while debugging.",
    autoRoutePriority: 100,
    autoRouteMatchers: [
      /^(?:can you |could you |please |help me )?debug\b/i,
      /\b(?:stack trace|traceback|exception|runtime error)\b/i,
      /\bwhy (?:is|does|did)\b[\s\S]*\b(?:failing|fail|broken|crash|error|not work(?:ing)?)\b/i,
    ],
  },
  {
    id: "convert",
    slashCommand: "/convert",
    name: "Convert Code",
    description:
      "Convert code to another language or pattern while preserving the original behavior and structure.",
    prompt:
      "The user wants code converted to another language, framework, or style. " +
      "Read the source carefully first, and use document_symbols or go_to_definition if needed to understand surrounding types or helpers. " +
      "Preserve the original logic and behavior. Output the converted code clearly, and only add brief comments where the translation is non-obvious.",
    autoRoutePriority: 70,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?(?:convert|port|translate)\b/i,
      /\brewrite\b[\s\S]*\bin\b/i,
    ],
  },
  {
    id: "review",
    slashCommand: "/review",
    name: "Code Review",
    description:
      "Review code for bugs, regressions, security issues, and quality risks with concrete evidence.",
    prompt:
      "The user wants a code review. Focus on findings first: bugs, behavioral regressions, security issues, and missing test coverage. " +
      "Read the relevant files, use diagnostics for current editor signals, and use find_references when impact analysis matters. " +
      "Report issues with file references and concise reasoning. Do not rewrite code unless the user asks for fixes.",
    autoRoutePriority: 90,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?(?:review|audit)\b/i,
      /\bcode review\b/i,
    ],
  },
  {
    id: "test",
    slashCommand: "/test",
    name: "Write Tests",
    description:
      "Add focused tests that match the existing test stack and cover the main behavior plus edge cases.",
    prompt:
      "The user wants tests. First inspect the relevant source files and the existing test patterns in the repository. " +
      "Use glob and grep to find nearby tests, then read them to match style and framework. " +
      "Write focused tests for the main behavior and meaningful edge cases. Avoid changing production code unless it is necessary and the user asked for it.",
    autoRoutePriority: 80,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?(?:write|add|create)\s+tests?\b/i,
      /\btests?\s+for\b/i,
    ],
  },
  {
    id: "commit",
    slashCommand: "/commit",
    name: "Commit Changes",
    description:
      "Review current changes, craft a strong commit message, and create a safe, scoped git commit.",
    prompt:
      "The user wants a commit. Use git_status and git_diff first to inspect all changes. " +
      "Summarize the real intent of the change, then produce a concise commit message focused on why. " +
      "Stage only the specific relevant files and commit safely. Verify the result with git_status afterward.",
    autoRoutePriority: 85,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?(?:commit|make a commit|create a commit)\b/i,
      /\bcommit these changes\b/i,
    ],
  },
  {
    id: "simplify",
    slashCommand: "/simplify",
    name: "Simplify Code",
    description:
      "Reduce unnecessary complexity, duplication, and over-engineering while keeping behavior intact.",
    prompt:
      "The user wants code simplified. Read the targeted files, inspect how the code is used with find_references if needed, and look for duplication, over-abstraction, dead code, or needless complexity. " +
      "Keep changes minimal and behavior-preserving. Do not introduce new abstractions unless they clearly remove existing complexity.",
    autoRoutePriority: 60,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?(?:simplify|reduce complexity)\b/i,
      /\bmake this simpler\b/i,
    ],
  },
  {
    id: "pr",
    slashCommand: "/pr",
    name: "Create Pull Request",
    description:
      "Understand the current branch and changes, then draft a solid pull request title and body.",
    prompt:
      "The user wants help creating a pull request. Use git_status and git_diff to inspect all changes, then identify the purpose of the branch. " +
      "Draft a concise PR title and a useful body with summary and test plan. If asked to create the PR, use run_command carefully with the appropriate git hosting CLI.",
    autoRoutePriority: 85,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?(?:open|create|draft|make)\s+(?:a\s+)?pr\b/i,
      /\bpull request\b/i,
    ],
  },
  {
    id: "init",
    slashCommand: "/init",
    name: "Initialize Project",
    description:
      "Quickly understand the project structure, stack, and run/test workflow, then summarize it clearly.",
    prompt:
      "The user wants an overview of the project. Start with glob, list_files, and read_file on key files like README, package manifests, build configs, and entrypoints. " +
      "Use document_symbols on important source files when that helps explain architecture. " +
      "Summarize what the project is, the main stack, key directories, and how to run or test it. Save durable context to memory when useful.",
    autoRoutePriority: 75,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?(?:initialize|init|onboard me|get me oriented)\b/i,
      /\bunderstand this (?:project|repo|repository)\b/i,
      /\bwhat is this (?:project|repo|repository)\b/i,
    ],
  },
  {
    id: "fix",
    slashCommand: "/fix",
    name: "Fix Diagnostics",
    description:
      "Use current VS Code diagnostics to find the most important errors or warnings and fix them cleanly.",
    prompt:
      "The user wants diagnostics fixed. Start with the diagnostics tool, prioritize errors before warnings, inspect code_actions when a likely quick fix exists, and read each affected file before editing. " +
      "Use document_symbols, go_to_definition, and find_references when the root cause spans multiple files. " +
      "Fix the real issue, not just the symptom, and avoid changing unrelated code.",
    autoRoutePriority: 95,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?fix\b[\s\S]*\b(?:diagnostics|errors|warnings|type errors|lint|compile errors?)\b/i,
      /\bresolve\b[\s\S]*\b(?:diagnostics|errors|warnings)\b/i,
    ],
  },
  {
    id: "implement",
    slashCommand: "/implement",
    name: "Implement Feature",
    description:
      "Scope a feature carefully, update the right files, and carry the change through tests or verification.",
    prompt:
      "The user wants a feature or behavior change. Start by locating the relevant entrypoints with glob, grep, workspace_symbols, document_symbols, and find_references. " +
      "Read the surrounding files before editing, make the smallest complete implementation that satisfies the request, and update or add tests when the repository already has test coverage for that area. " +
      "When verification is useful and safe, use run_command to run the narrowest relevant check. " +
      "Keep the change focused and mention any follow-up verification that still remains.",
    autoRoutePriority: 55,
    autoRouteMatchers: [
      /^(?:can you |could you |please |let'?s |lets )?implement\b/i,
      /^(?:can you |could you |please |let'?s |lets )?(?:add|build|create|wire up)\b[\s\S]*\b(?:feature|support|button|setting|endpoint|command|flow|panel|section|option|toggle|dropdown|model|reasoning|tool|skill|ui|chat|integration|bridge)\b/i,
    ],
  },
  {
    id: "refactor",
    slashCommand: "/refactor",
    name: "Refactor Safely",
    description:
      "Reshape code without changing behavior by tracing usage first and preserving coverage.",
    prompt:
      "The user wants a refactor. Before editing, use document_symbols and find_references to map the impacted API surface and read the nearby tests. " +
      "Preserve behavior, keep public interfaces stable unless the user asked otherwise, and prefer a sequence of small exact edits over broad rewrites. " +
      "After the refactor, update tests only when necessary to reflect renamed internals or moved code, then run the most targeted verification command that makes sense.",
    autoRoutePriority: 65,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?refactor\b/i,
      /\brestructure\b/i,
    ],
  },
  {
    id: "investigate",
    slashCommand: "/investigate",
    name: "Investigate Issue",
    description:
      "Gather evidence across diagnostics, code paths, and commands before deciding whether a fix is needed.",
    prompt:
      "The user wants an investigation rather than an immediate patch. Start with diagnostics if they apply, inspect the relevant files with read_file and document_symbols, use hover_symbol for quick type/docs context, and trace flow with go_to_definition and find_references before proposing any edit. " +
      "If a command would reveal useful evidence, use run_command carefully and summarize the result. " +
      "Lead with the most likely cause, the evidence you gathered, and the smallest next action instead of jumping straight into broad code changes.",
    autoRoutePriority: 88,
    autoRouteMatchers: [
      /^(?:can you |could you |please )?(?:investigate|look into)\b/i,
      /\bfigure out why\b/i,
      /\bwhat(?:'s| is) going on with\b/i,
    ],
  },
];

const BUILTIN_HARNESS_SKILL_MAP = new Map(
  BUILTIN_HARNESS_SKILLS.map((skill) => [skill.id, skill]),
);
const BUILTIN_HARNESS_SKILL_SLASH_MAP = new Map(
  BUILTIN_HARNESS_SKILLS.map((skill) => [skill.slashCommand, skill]),
);

export function listBuiltinHarnessSkills() {
  return BUILTIN_HARNESS_SKILLS;
}

export function getBuiltinHarnessSkill(skillId: string) {
  return BUILTIN_HARNESS_SKILL_MAP.get(normalizeSkillId(skillId));
}

export function getBuiltinHarnessSkillBySlashCommand(command: string) {
  return BUILTIN_HARNESS_SKILL_SLASH_MAP.get(command.trim().toLowerCase());
}

export function inferBuiltinHarnessSkillFromPrompt(
  prompt: string,
  excludeSkillIds: string[] = [],
) {
  const trimmed = prompt.trim();
  if (!trimmed) return undefined;

  const excluded = new Set(excludeSkillIds.map(normalizeSkillId));
  return BUILTIN_HARNESS_SKILLS
    .filter((skill) => !excluded.has(skill.id))
    .filter((skill) => skill.autoRouteMatchers?.some((matcher) => matcher.test(trimmed)))
    .sort(
      (a, b) =>
        (b.autoRoutePriority ?? 0) - (a.autoRoutePriority ?? 0),
    )[0];
}

function normalizeSkillId(value: string) {
  return value.trim().toLowerCase().replace(/^\//, "");
}
