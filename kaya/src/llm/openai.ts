import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

// ─── Claude Code Brain ──────────────────────────────────────────────────────
// Instead of calling an external LLM API, this queues requests as JSON files.
// Claude Code (running in terminal) monitors the queue and processes them
// using its own intelligence via sub-agents.

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = join(__dirname, '..', '..', 'brain');
const BRAIN_INBOX = join(BRAIN_DIR, 'inbox');
const BRAIN_OUTBOX = join(BRAIN_DIR, 'outbox');

// Ensure directories exist
mkdirSync(BRAIN_INBOX, { recursive: true });
mkdirSync(BRAIN_OUTBOX, { recursive: true });

// ─── Local Type Definitions ─────────────────────────────────────────────────
// These match the shapes used by the agent loop and the rest of the codebase.

/** A tool definition for the LLM */
export interface Tool {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

/** A single message in the conversation history */
export interface MessageParam {
    role: string;
    content: string | any[];
}

/** A tool_use content block returned by chat() */
export interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

/** A tool result sent back to the LLM after executing a tool */
export interface ToolResultBlockParam {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
}

/** A generic content block (text or tool_use) */
export interface ContentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const FULL_SYSTEM_PROMPT = `You are Kaya 💼 — an autonomous Sales SDR for Beautiful Websites Kit.

You find local businesses with outdated websites, qualify them, and pitch free redesigns.
You are helpful, concise, and security-conscious. You run locally on the user's machine.
Keep responses conversational and to-the-point. Use markdown formatting when helpful.

## MEMORY — CRITICAL INSTRUCTIONS

You MUST proactively manage the user's memory. This is automatic, not optional.

**ALWAYS use \`remember_fact\` when the user shares:**
- Personal info (name, location, timezone, birthday, job, preferences)
- Opinions or preferences ("I like X", "I hate Y", "I prefer Z")
- Projects they're working on
- People they mention (friends, colleagues, family)
- Goals, plans, or decisions
- Technical setup (OS, tools, languages they use)
- Any fact they'd expect you to know next time

**ALWAYS use \`recall_memories\` when:**
- The user asks about something you might have stored
- You need context about their preferences or past conversations
- The conversation topic might relate to previously stored facts

Do NOT ask "should I remember this?" — just remember it silently.
Do NOT announce that you're storing a memory unless the user explicitly asked you to remember something.
When you recall memories, use them naturally in your response without saying "according to my memories".

## YOUR TOOLS — Sales SDR

**Lead Management:**
- \`search_leads\` — Search existing leads in the database
- \`add_lead\` — Add a new lead (name, company, email, phone, website, industry)
- \`score_lead\` — Calculate ICP fit score (0-100)
- \`update_lead_status\` — Move lead through pipeline: new→researching→qualified→contacted→replied→meeting→won/lost
- \`get_pipeline_stats\` — Pipeline summary statistics

**Outreach:**
- \`send_outreach\` — Queue an email outreach to a lead
- \`get_outreach_history\` — View all messages sent to a lead

**Pipeline Integration (Beautiful Websites Kit):**
- \`read_pipeline_leads\` — Read scrape_results.json from the BWK pipeline
- \`read_qualifications\` — Read qualify_results.json (YES/NO per site)
- \`read_build_log\` — Read sites/build-log.md (deployed sites)
- \`import_pipeline_leads\` — Import qualified BWK leads into the leads database
- \`send_website_pitch\` — Send a pitch email with the redesigned website URL

## CONTEXT

Your messages may include <core_memory> and <relevant_memories> blocks. Use this information naturally.
You do NOT have internet access beyond your tools. You cannot browse the web unless given a tool for it.`;

// ─── Chat Options & Response Types ──────────────────────────────────────────

export interface ChatOptions {
    messages: MessageParam[];
    tools?: Tool[];
}

export interface ChatResponse {
    content: ContentBlock[];
    stopReason: string | null;
}

// ─── Token Cost Tracking ─────────────────────────────────────────────────────
// Estimates tokens from message text length (~4 chars/token) and logs to console.

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function logCost(inputTokens: number, outputTokens: number): void {
    // Estimate cost based on typical pricing: input $3/M, output $15/M
    const costUsd = (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;
    if (costUsd > 0.001) {
        console.log(`  💰 Est. cost: $${costUsd.toFixed(4)} (in: ${inputTokens}, out: ${outputTokens})`);
    }
}

// ─── Direct OpenAI API Call ─────────────────────────────────────────────────
// Used when BRAIN_MODE=direct or as fallback in hybrid mode.
// Makes real API calls to OpenAI/local LLM, no terminal required.

async function chatDirect(options: ChatOptions): Promise<ChatResponse> {
    const { default: OpenAI } = await import('openai');

    // Support local LLM (MLX/Ollama) via custom base URL — no API key needed
    const baseURL = config.brainDirectBaseUrl;
    const isLocal = baseURL.includes('localhost') || baseURL.includes('127.0.0.1');

    if (!isLocal && !config.openAiApiKey) {
        return {
            content: [{ type: 'text', text: '⚠️ BRAIN_MODE=direct but OPENAI_API_KEY is missing. Add it to .env.' }],
            stopReason: 'end_turn',
        };
    }

    const client = new OpenAI({
        apiKey: isLocal ? 'local' : config.openAiApiKey,
        baseURL,
    });

    // Convert tool format → OpenAI tool format
    const openaiTools = (options.tools || []).map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
        },
    }));

    // Convert message history — handle tool_result blocks
    const openaiMessages: any[] = [
        { role: 'system', content: FULL_SYSTEM_PROMPT },
    ];

    for (const msg of options.messages) {
        if (typeof msg.content === 'string') {
            openaiMessages.push({ role: msg.role, content: msg.content });
        } else if (Array.isArray(msg.content)) {
            // Handle tool result blocks (from previous tool calls)
            const toolResults = msg.content.filter((b: any) => b.type === 'tool_result');
            const textBlocks  = msg.content.filter((b: any) => b.type === 'text');

            if (toolResults.length > 0) {
                for (const tr of toolResults) {
                    openaiMessages.push({
                        role: 'tool',
                        tool_call_id: tr.tool_use_id,
                        content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
                    });
                }
            } else if (textBlocks.length > 0) {
                openaiMessages.push({
                    role: msg.role,
                    content: textBlocks.map((b: any) => b.text).join(''),
                });
            } else {
                // Tool use blocks from previous assistant turn — reconstruct
                const toolUses = msg.content.filter((b: any) => b.type === 'tool_use');
                if (toolUses.length > 0) {
                    openaiMessages.push({
                        role: 'assistant',
                        tool_calls: toolUses.map((b: any) => ({
                            id: b.id,
                            type: 'function',
                            function: { name: b.name, arguments: JSON.stringify(b.input) },
                        })),
                    });
                }
            }
        }
    }

    const MAX_RETRIES = isLocal ? 3 : 1;
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model: config.brainDirectModel,
                messages: openaiMessages,
                tools: openaiTools.length > 0 ? openaiTools : undefined,
                tool_choice: openaiTools.length > 0 ? 'auto' : undefined,
                max_tokens: 2048,
                temperature: 0.3,
            });

            const choice = response.choices[0];
            const content: ContentBlock[] = [];

            // Text content
            if (choice.message.content) {
                content.push({ type: 'text', text: choice.message.content });
            }

            // Tool calls → tool_use blocks
            if (choice.message.tool_calls) {
                for (const tc of choice.message.tool_calls) {
                    let parsed: Record<string, unknown> = {};
                    try { parsed = JSON.parse(tc.function.arguments); } catch {}
                    content.push({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.function.name,
                        input: parsed,
                    });
                }
            }

            const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';

            // Log estimated cost
            if (response.usage) {
                logCost(response.usage.prompt_tokens, response.usage.completion_tokens);
            }

            console.log(`  🤖 [Direct] Response: ${stopReason}, ${content.length} block(s) (${config.brainDirectModel})`);
            return { content, stopReason };

        } catch (err: any) {
            lastError = err;
            if (attempt < MAX_RETRIES && isLocal) {
                console.warn(`  🤖 [Direct] Retry ${attempt}/${MAX_RETRIES}: ${err?.message}`);
                await new Promise(r => setTimeout(r, 3000 * attempt)); // 3s, 6s backoff
                continue;
            }
            console.error('  🤖 [Direct] OpenAI API error:', err?.message);
            return {
                content: [{ type: 'text', text: `⚠️ LLM API error: ${err?.message || 'unknown error'}` }],
                stopReason: 'end_turn',
            };
        }
    }

    // All retries exhausted
    return {
        content: [{ type: 'text', text: `⚠️ LLM connection error (${MAX_RETRIES} attempts): ${lastError?.message || 'unknown'}` }],
        stopReason: 'end_turn',
    };
}

// ─── Queue-based Chat (Claude Code Brain) ───────────────────────────────────

const POLL_INTERVAL_MS = 500;
const RESPONSE_TIMEOUT_MS = 120_000; // 2 minutes

async function chatBrainQueue(options: ChatOptions, timeoutMs = RESPONSE_TIMEOUT_MS): Promise<ChatResponse | null> {
    const id = randomUUID();

    // Build request payload
    const request = {
        id,
        type: 'chat',
        agent: 'kaya',
        agentDisplay: 'Kaya',
        agentEmoji: '💼',
        system: FULL_SYSTEM_PROMPT,
        messages: options.messages,
        tools: options.tools || [],
        timestamp: new Date().toISOString(),
    };

    // Write request to inbox
    const requestFile = join(BRAIN_INBOX, `${id}.json`);
    writeFileSync(requestFile, JSON.stringify(request, null, 2));
    console.log(`  🧠 [Brain] Request queued: ${id.slice(0, 8)} (Kaya)`);

    // Poll for response
    const responseFile = join(BRAIN_OUTBOX, `${id}.json`);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        if (existsSync(responseFile)) {
            try {
                const raw = readFileSync(responseFile, 'utf-8');
                const responseData = JSON.parse(raw) as ChatResponse;

                // Cleanup
                try { unlinkSync(responseFile); } catch {}
                try { unlinkSync(requestFile); } catch {}

                console.log(`  🧠 [Brain] Response received: ${id.slice(0, 8)} (Kaya)`);

                // Estimate and log token costs
                const inputText = options.messages.map(m =>
                    typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                ).join('');
                const outputText = responseData.content
                    .filter((b: any) => b.type === 'text')
                    .map((b: any) => b.text || '')
                    .join('');
                logCost(estimateTokens(inputText), estimateTokens(outputText));

                return responseData;
            } catch (err) {
                console.error(`  🧠 [Brain] Failed to parse response: ${err}`);
                try { unlinkSync(responseFile); } catch {}
                return null;
            }
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Timeout — cleanup and return null (caller decides fallback)
    console.warn(`  🧠 [Brain] TIMEOUT waiting for response: ${id.slice(0, 8)}`);
    try { unlinkSync(requestFile); } catch {}
    return null;
}

// ─── Main chat() entry point ─────────────────────────────────────────────────
// Selects brain mode based on BRAIN_MODE config:
//   'queue'  — brain queue only (original behavior)
//   'direct' — OpenAI API directly (terminal not needed)
//   'hybrid' — brain queue with short timeout, fall back to OpenAI API

export async function chat(options: ChatOptions): Promise<ChatResponse> {
    const mode = config.brainMode;

    if (mode === 'direct') {
        // Fully autonomous — call LLM API directly, no terminal needed
        return chatDirect(options);
    }

    if (mode === 'hybrid') {
        // Try brain queue first (short timeout), fall back to direct API
        const result = await chatBrainQueue(options, config.brainQueueTimeoutMs);
        if (result !== null) return result;
        console.log(`  🔄 [Brain] Queue timeout — falling back to ${config.brainDirectModel}`);
        return chatDirect(options);
    }

    // mode === 'queue' — brain queue only (original behavior)
    const result = await chatBrainQueue(options, RESPONSE_TIMEOUT_MS);
    if (result !== null) return result;
    return {
        content: [{ type: 'text', text: '⚠️ Brain did not respond (timeout). Is the Claude Code session running?' }],
        stopReason: 'end_turn',
    };
}

// Export system prompt for external use
export function getSystemPrompt(): string {
    return FULL_SYSTEM_PROMPT;
}
