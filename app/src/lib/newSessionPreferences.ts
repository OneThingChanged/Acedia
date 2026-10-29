import { AI_TOOLS, toolForId } from "../types";
import { loadAgentDefaults } from "./agentDefaults";
import { defaultAiToolId } from "./projectCreation";

export const NEW_SESSION_PREFERENCES_KEY = "multiagent.newSessionPreferences.v1";

type NewSessionPreferences = {
  aiToolId?: string;
  dangerousByTool: Record<string, boolean>;
};

function readPreferences(): NewSessionPreferences {
  try {
    const raw = JSON.parse(localStorage.getItem(NEW_SESSION_PREFERENCES_KEY) || "{}");
    const dangerousByTool: Record<string, boolean> = {};
    for (const tool of AI_TOOLS) {
      const dangerous = raw?.dangerousByTool?.[tool.id];
      if (tool.dangerousFlag && typeof dangerous === "boolean") dangerousByTool[tool.id] = dangerous;
    }
    return {
      aiToolId: AI_TOOLS.some(tool => tool.id === raw?.aiToolId) ? raw.aiToolId : undefined,
      dangerousByTool,
    };
  } catch {
    return { dangerousByTool: {} };
  }
}

export function newSessionDangerous(toolId: string, explicitChoice?: boolean): boolean {
  if (!toolForId(toolId).dangerousFlag) return false;
  if (typeof explicitChoice === "boolean") return explicitChoice;
  const defaults = loadAgentDefaults(toolId);
  return defaults.dangerousDefaultMode === "remember"
    ? readPreferences().dangerousByTool[toolId] ?? defaults.dangerous
    : defaults.dangerous;
}

export function newSessionToolId(disabledTools: readonly string[], parentToolId?: string): string {
  const enabled = (id: string | undefined): id is string =>
    typeof id === "string" && AI_TOOLS.some(tool => tool.id === id) && (id === "none" || !disabledTools.includes(id));
  const remembered = readPreferences().aiToolId;
  return enabled(parentToolId) ? parentToolId : enabled(remembered) ? remembered : defaultAiToolId(disabledTools);
}

export function rememberNewSession(toolId: string, dangerous: boolean): void {
  const tool = AI_TOOLS.find(candidate => candidate.id === toolId);
  if (!tool) return;
  const preferences = readPreferences();
  preferences.aiToolId = tool.id;
  if (tool.dangerousFlag) preferences.dangerousByTool[tool.id] = dangerous;
  localStorage.setItem(NEW_SESSION_PREFERENCES_KEY, JSON.stringify(preferences));
}
