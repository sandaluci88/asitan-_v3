import type { Tool } from '../llm/openai.js';

// ─── Tool Registry ───────────────────────────────────────────────────────────
// Loads all tool modules and provides a unified dispatch interface.
// No fleet tools, no MCP security checks — standalone Kaya agent.

type ToolHandler = (input: Record<string, unknown>) => string | Promise<string>;

interface ToolModule {
    toolHandlers: Record<string, ToolHandler>;
    toolDefinitions: Tool[];
}

const handlers: Record<string, ToolHandler> = {};

/** All tool definitions for the LLM (populated by initAllTools) */
export const allToolDefinitions: Tool[] = [];

/** All registered tool names (for reference) */
const registeredToolNames: string[] = [];

/**
 * Initialize all tools by loading each module.
 * Must be called once at startup before any tool execution.
 */
export async function initAllTools(): Promise<void> {
    const moduleNames = ['core', 'leads', 'outreach', 'website-pitch'];

    for (const modName of moduleNames) {
        try {
            const mod: ToolModule = await import(`./modules/${modName}.js`);
            Object.assign(handlers, mod.toolHandlers);
            allToolDefinitions.push(...mod.toolDefinitions);
            for (const def of mod.toolDefinitions) {
                registeredToolNames.push(def.name);
            }
        } catch (e) {
            console.warn(`Warning: Tool module '${modName}' not loaded:`, e instanceof Error ? e.message : e);
        }
    }

    console.log(`  Tools loaded: ${moduleNames.join(', ')} (${registeredToolNames.length} tools)`);
}

/**
 * Execute a tool by name and return its JSON result string.
 */
export async function executeTool(
    name: string,
    input: Record<string, unknown>,
): Promise<string> {
    const handler = handlers[name];
    if (!handler) {
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    try {
        return await handler(input);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: `Tool "${name}" failed: ${message}` });
    }
}
