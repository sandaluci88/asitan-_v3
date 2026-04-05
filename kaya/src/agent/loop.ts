import { chat } from '../llm/openai.js';
import { allToolDefinitions, executeTool } from '../tools/registry.js';
import { config } from '../config.js';
import { getCoreMemory, recall, remember } from '../memory/index.js';
import type { MessageParam, ToolResultBlockParam, ToolUseBlock } from '../llm/openai.js';

// ─── Agent Loop ──────────────────────────────────────────────────────────────
// Agentic tool-calling loop: LLM → tool calls → results → LLM (repeat).
// Injects core memory + relevant memories as context.
// Auto-saves conversation summaries to memory.

export interface AgentFile {
    path: string;
    type: 'photo' | 'document' | 'voice';
    caption?: string;
}

export interface AgentResult {
    reply: string;
    toolsUsed: string[];
    iterations: number;
    files?: AgentFile[];
}

/** Build memory context prefix for the LLM */
function buildMemoryContext(userMessage: string): string {
    const parts: string[] = [];

    const core = getCoreMemory();
    if (core) {
        parts.push(`<core_memory>\n${core}\n</core_memory>`);
    }

    try {
        const relevant = recall(userMessage, 3);
        if (relevant.length > 0) {
            const formatted = relevant
                .map((m) => `- [${m.source}, ${m.created_at}] ${m.content}`)
                .join('\n');
            parts.push(`<relevant_memories>\n${formatted}\n</relevant_memories>`);
        }
    } catch {
        // Memory search failure shouldn't block the conversation
    }

    return parts.length > 0
        ? parts.join('\n\n') + '\n\n---\n\nUser message follows:\n\n'
        : '';
}

/** Auto-save a brief conversation summary to memory */
function autoSaveConversation(userMessage: string, reply: string): void {
    try {
        if (userMessage.length < 10 && reply.length < 50) return;

        const summary = `User asked: "${userMessage.slice(0, 100)}${userMessage.length > 100 ? '…' : ''}" → discussed ${reply.slice(0, 80)}${reply.length > 80 ? '…' : ''}`;
        remember(summary, 'auto');
    } catch {
        // Auto-save failure is non-critical
    }
}

// Global short-term history buffer (max 20 messages per user, aka 10 turns)
export const chatHistory = new Map<number, MessageParam[]>();

// Global file queue — tools push files here, agent loop returns them
export const pendingFiles: AgentFile[] = [];

export function queueFile(file: AgentFile): void {
    pendingFiles.push(file);
}

export async function runAgentLoop(userId: number, userMessage: string): Promise<AgentResult> {
    const maxIterations = config.maxAgentIterations;
    const toolsUsed: string[] = [];
    let iterations = 0;

    const memoryContext = buildMemoryContext(userMessage);
    const augmentedMessage = memoryContext + userMessage;

    let userHistory = chatHistory.get(userId) || [];

    const messages: MessageParam[] = [
        ...userHistory,
        { role: 'user', content: augmentedMessage },
    ];

    while (iterations < maxIterations) {
        iterations++;

        const response = await chat({
            messages,
            tools: allToolDefinitions.length > 0 ? allToolDefinitions : undefined,
        });

        if (response.stopReason === 'tool_use') {
            messages.push({ role: 'assistant', content: response.content });

            const toolResults: ToolResultBlockParam[] = [];
            for (const block of response.content) {
                if (block.type === 'tool_use') {
                    const toolBlock = block as ToolUseBlock;
                    toolsUsed.push(toolBlock.name);

                    console.log(`  🔧 Tool: ${toolBlock.name}`);

                    const result = await executeTool(
                        toolBlock.name,
                        toolBlock.input as Record<string, unknown>,
                    );

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolBlock.id,
                        content: result,
                    });
                }
            }

            messages.push({ role: 'user', content: toolResults });
            continue;
        }

        const textBlocks = response.content
            .filter((block) => block.type === 'text')
            .map((block) => {
                if (block.type === 'text') return block.text;
                return '';
            });

        const reply = textBlocks.join('\n') || '(No response)';

        autoSaveConversation(userMessage, reply);

        userHistory.push({ role: 'user', content: userMessage });
        userHistory.push({ role: 'assistant', content: reply });

        if (userHistory.length > 20) {
            userHistory = userHistory.slice(userHistory.length - 20);
        }
        chatHistory.set(userId, userHistory);

        const files = pendingFiles.splice(0, pendingFiles.length);

        return {
            reply,
            toolsUsed,
            iterations,
            files: files.length > 0 ? files : undefined,
        };
    }

    const files = pendingFiles.splice(0, pendingFiles.length);
    return {
        reply: '⚠️ I hit my thinking limit. Please try a simpler request.',
        toolsUsed,
        iterations,
        files: files.length > 0 ? files : undefined,
    };
}
