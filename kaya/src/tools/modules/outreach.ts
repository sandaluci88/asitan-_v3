import type { Tool } from '../../llm/openai.js';
import { getLeadById, getOutreachForLead, saveOutreach } from '../../leads/db.js';
import { advanceLead } from '../../leads/pipeline.js';

// ─── Outreach Tools ─────────────────────────────────────────────────────────
// Send outreach via Instantly.ai and track outreach history.

type ToolHandler = (input: Record<string, unknown>) => string | Promise<string>;

export const toolHandlers: Record<string, ToolHandler> = {
    send_outreach: async (input) => {
        const leadId = Number(input.lead_id);
        if (!leadId) return JSON.stringify({ error: 'lead_id is required' });
        const lead = getLeadById(leadId);
        if (!lead) return JSON.stringify({ error: `Lead ${leadId} not found` });

        const channel = String(input.channel || (lead.email ? 'email' : 'telegram'));
        const customMessage = input.custom_message ? String(input.custom_message) : null;

        // Auto-advance pipeline if still early stage
        if (lead.status === 'new') advanceLead(leadId, 'researching');
        const after1 = getLeadById(leadId)!;
        if (after1.status === 'researching') advanceLead(leadId, 'qualified');

        const finalLead = getLeadById(leadId)!;

        // ─── Email Channel (via Instantly.ai) ────────────────────────────
        if (channel === 'email') {
            if (!finalLead.email) {
                return JSON.stringify({
                    status: 'skipped',
                    reason: 'no_email',
                    lead_id: leadId,
                    message: 'Lead has no email address. Add email first or use telegram channel.',
                });
            }

            let subject: string;
            let body: string;

            if (customMessage) {
                subject = `Website Redesign — ${finalLead.company || finalLead.full_name}`;
                body = customMessage;
            } else {
                // Default cold outreach for website pitch
                const firstName = finalLead.full_name?.split(' ')[0] || 'there';
                subject = `Free website redesign for ${finalLead.company || finalLead.full_name}`;
                body = `Hi ${firstName},\n\nI came across ${finalLead.website || 'your website'} and noticed it could use a modern refresh. I've already built a free redesign — would you like to see it?\n\nBest regards`;
            }

            // Send via Instantly.ai
            let result = { success: false, messageId: null as string | null, error: null as string | null };
            try {
                const { sendViaInstantly } = await import('../../outreach/instantly.js');
                result = await sendViaInstantly({
                    to: finalLead.email,
                    subject,
                    body,
                    leadName: finalLead.full_name ?? undefined,
                    company: finalLead.company ?? undefined,
                });
            } catch (err) {
                result.error = err instanceof Error ? err.message : 'Instantly send failed';
            }

            // Log outreach
            try {
                saveOutreach({
                    lead_id: leadId,
                    channel: 'email',
                    message_type: 'cold_intro',
                    template_id: null,
                    message_content: body,
                    personalization_data: JSON.stringify({ subject, instantly_id: result.messageId, error: result.error }),
                    status: result.success ? 'sent' : 'failed',
                });
            } catch { /* non-critical */ }

            // Advance to contacted if sent successfully
            if (result.success && finalLead.status === 'qualified') {
                advanceLead(leadId, 'contacted');
            }

            return JSON.stringify({
                status: result.success ? 'sent' : 'failed',
                lead_id: leadId,
                lead_status: getLeadById(leadId)?.status ?? finalLead.status,
                channel: 'email',
                to: finalLead.email,
                subject,
                instantly_id: result.messageId,
                error: result.error,
            });
        }

        // ─── Telegram / Other Channels ────────────────────────────────────
        // Queue for manual sending or future integration
        try {
            saveOutreach({
                lead_id: leadId,
                channel: channel as any,
                message_type: 'cold_intro',
                template_id: null,
                message_content: customMessage || `Outreach queued for ${finalLead.full_name} via ${channel}`,
                personalization_data: '{}',
                status: 'queued',
            });
        } catch { /* non-critical */ }

        return JSON.stringify({
            status: 'queued',
            lead_id: leadId,
            lead_status: finalLead.status,
            channel,
            message: `Lead is now '${finalLead.status}'. Queued for ${channel} outreach.`,
        });
    },

    get_outreach_history: (input) => {
        const leadId = Number(input.lead_id);
        if (!leadId) return JSON.stringify({ error: 'lead_id is required' });
        const messages = getOutreachForLead(leadId);
        return JSON.stringify({ count: messages.length, messages });
    },
};

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const toolDefinitions: Tool[] = [
    {
        name: 'send_outreach',
        description: 'Send outreach to a lead. Email is sent via Instantly.ai. Other channels are queued. Auto-advances pipeline status.',
        input_schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'number', description: 'Lead ID to contact' },
                channel: { type: 'string', description: 'Channel: "email" or "telegram". Auto-detected from lead data if omitted.' },
                custom_message: { type: 'string', description: 'Custom message body (skips default template).' },
            },
            required: ['lead_id'],
        },
    },
    {
        name: 'get_outreach_history',
        description: 'Get all outreach messages sent to a lead, ordered by most recent first.',
        input_schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'number', description: 'Lead ID' },
            },
            required: ['lead_id'],
        },
    },
];
