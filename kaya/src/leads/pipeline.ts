import { getLeadById, updateLead, listLeadsByStatus, getOutreachForLead } from './db.js';
import type { Lead, LeadStatus } from './types.js';

// ─── Pipeline Management ────────────────────────────────────────────────────
// Valid status transitions enforce a structured sales pipeline.

const VALID_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
    new:         ['researching', 'lost'],
    researching: ['qualified', 'lost'],
    qualified:   ['contacted', 'lost'],
    contacted:   ['replied', 'lost'],
    replied:     ['meeting', 'lost'],
    meeting:     ['won', 'lost'],
    won:         [],
    lost:        ['new'],  // allow re-opening
};

export function advanceLead(leadId: number, newStatus: LeadStatus): { success: boolean; lead?: Lead; error?: string } {
    const lead = getLeadById(leadId);
    if (!lead) return { success: false, error: `Lead ${leadId} not found` };

    const allowed = VALID_TRANSITIONS[lead.status];
    if (!allowed.includes(newStatus)) {
        return {
            success: false,
            error: `Invalid transition: ${lead.status} -> ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
        };
    }

    const updated = updateLead(leadId, { status: newStatus });
    return { success: true, lead: updated };
}

export function getLeadsReadyForOutreach(): Lead[] {
    const qualified = listLeadsByStatus('qualified', 200);
    return qualified.filter((lead) => lead.lead_score >= 60);
}

export function getLeadsNeedingFollowUp(): Lead[] {
    const contacted = listLeadsByStatus('contacted', 200);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    return contacted.filter((lead) => {
        const messages = getOutreachForLead(lead.id);
        if (messages.length === 0) return true;
        // Most recent outreach sent_at older than 3 days
        return messages[0].sent_at < threeDaysAgo;
    });
}
