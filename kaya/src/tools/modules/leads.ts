import type { Tool } from '../../llm/openai.js';
import { searchLeads, saveLead, getLeadById, getPipelineStats } from '../../leads/db.js';
import { scoreLead } from '../../leads/scoring.js';
import { advanceLead } from '../../leads/pipeline.js';

// ─── Lead Management Tools ──────────────────────────────────────────────────
// Core lead CRUD, scoring, and pipeline operations for Kaya SDR.

type ToolHandler = (input: Record<string, unknown>) => string | Promise<string>;

export const toolHandlers: Record<string, ToolHandler> = {
    add_lead: (input) => {
        const fullName = String(input.full_name || '');
        if (!fullName) return JSON.stringify({ error: 'full_name is required' });
        const lead = saveLead({
            full_name: fullName,
            company: input.company ? String(input.company) : null,
            title: input.title ? String(input.title) : null,
            email: input.email ? String(input.email) : null,
            phone: input.phone ? String(input.phone) : null,
            telegram_id: input.telegram_id ? String(input.telegram_id) : null,
            website: input.website ? String(input.website) : null,
            industry: input.industry ? String(input.industry) : null,
            country: String(input.country || 'TR'),
            source: (input.source as any) || 'manual',
            status: 'new',
            persona_tag: null,
            tags: String(input.tags || ''),
            enrichment_data: '{}',
            notes: input.notes ? String(input.notes) : null,
        });
        return JSON.stringify({ success: true, lead });
    },

    search_leads: (input) => {
        const query = String(input.query || '');
        if (!query) return JSON.stringify({ error: 'No query provided' });
        const status = input.status ? String(input.status) : undefined;
        const results = searchLeads(query, { status: status as any });
        const limit = typeof input.limit === 'number' ? input.limit : 20;
        return JSON.stringify({ count: results.length, leads: results.slice(0, limit) });
    },

    get_lead: (input) => {
        const id = Number(input.lead_id);
        if (!id) return JSON.stringify({ error: 'lead_id is required' });
        const lead = getLeadById(id);
        if (!lead) return JSON.stringify({ error: `Lead ${id} not found` });
        return JSON.stringify(lead);
    },

    score_lead: (input) => {
        const id = Number(input.lead_id);
        if (!id) return JSON.stringify({ error: 'lead_id is required' });
        const lead = scoreLead(id);
        if (!lead) return JSON.stringify({ error: `Lead ${id} not found` });
        return JSON.stringify({ lead_id: lead.id, score: lead.lead_score, reasons: lead.score_reasons });
    },

    update_lead_status: (input) => {
        const id = Number(input.lead_id);
        const status = String(input.status || '');
        if (!id || !status) return JSON.stringify({ error: 'lead_id and status are required' });
        const result = advanceLead(id, status as any);
        return JSON.stringify(result);
    },

    get_pipeline_stats: () => {
        const stats = getPipelineStats();
        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        return JSON.stringify({ total, byStatus: stats });
    },
};

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const toolDefinitions: Tool[] = [
    {
        name: 'add_lead',
        description: 'Add a new lead to the pipeline.',
        input_schema: {
            type: 'object',
            properties: {
                full_name: { type: 'string', description: 'Full name of the lead' },
                company: { type: 'string', description: 'Company name' },
                title: { type: 'string', description: 'Job title' },
                email: { type: 'string', description: 'Email address' },
                phone: { type: 'string', description: 'Phone number' },
                telegram_id: { type: 'string', description: 'Telegram ID' },
                website: { type: 'string', description: 'Website URL' },
                industry: { type: 'string', description: 'Industry vertical' },
                country: { type: 'string', description: 'Country code (default: TR)' },
                source: { type: 'string', description: 'Lead source (manual, web_scrape, pipeline, etc.)' },
                tags: { type: 'string', description: 'Comma-separated tags' },
                notes: { type: 'string', description: 'Notes about the lead' },
            },
            required: ['full_name'],
        },
    },
    {
        name: 'search_leads',
        description: 'Search the leads database by name, company, industry, or notes using full-text search.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                status: { type: 'string', description: 'Filter by pipeline status' },
                limit: { type: 'number', description: 'Max results to return (default: 20)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_lead',
        description: 'Get full details of a lead by its ID.',
        input_schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'number', description: 'Lead ID' },
            },
            required: ['lead_id'],
        },
    },
    {
        name: 'score_lead',
        description: 'Calculate ICP fit score (0-100) for a lead based on scoring rules. Updates the lead record with the new score.',
        input_schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'number', description: 'Lead ID to score' },
            },
            required: ['lead_id'],
        },
    },
    {
        name: 'update_lead_status',
        description: 'Advance a lead to a new pipeline status. Valid flow: new -> researching -> qualified -> contacted -> replied -> meeting -> won/lost.',
        input_schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'number', description: 'Lead ID' },
                status: { type: 'string', description: 'New pipeline status' },
            },
            required: ['lead_id', 'status'],
        },
    },
    {
        name: 'get_pipeline_stats',
        description: 'Get a summary of leads in each pipeline stage with totals.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
];
