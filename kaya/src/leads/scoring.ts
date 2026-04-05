import { getLeadById, updateLead, listLeadsByStatus } from './db.js';
import type { Lead, LeadStatus } from './types.js';

// ─── Lead Scoring ───────────────────────────────────────────────────────────
// Weighted scoring (0-100) adapted for website redesign outreach.
// Qualified threshold: score >= 60

interface ScoreRule {
    name: string;
    points: number;
    test: (lead: Lead) => boolean;
}

const DECISION_MAKER_TITLES = /\b(ceo|cto|cfo|coo|cmo|founder|co-founder|owner|head of|director|vp |vice president|managing partner)\b/i;

const TARGET_COUNTRIES = ['TR'];

const SCORING_RULES: ScoreRule[] = [
    {
        name: 'Has outdated website (qualify YES)',
        points: 30,
        test: (lead) => {
            if (!lead.enrichment_data || lead.enrichment_data === '{}') return false;
            try {
                const data = JSON.parse(lead.enrichment_data);
                // qualify_result comes from site-qualify step
                return data.qualify_result === 'YES' || data.outdated_website === true;
            } catch {
                return false;
            }
        },
    },
    {
        name: 'Has both email and website',
        points: 25,
        test: (lead) => !!lead.email && !!lead.website,
    },
    {
        name: 'Decision maker role',
        points: 20,
        test: (lead) => !!lead.title && DECISION_MAKER_TITLES.test(lead.title),
    },
    {
        name: 'Target market (TR)',
        points: 15,
        test: (lead) => TARGET_COUNTRIES.includes(lead.country.toUpperCase()),
    },
    {
        name: 'Has email',
        points: 10,
        test: (lead) => !!lead.email,
    },
];

export function scoreLead(leadId: number): Lead | undefined {
    const lead = getLeadById(leadId);
    if (!lead) return undefined;

    let totalScore = 0;
    const reasons: string[] = [];

    for (const rule of SCORING_RULES) {
        if (rule.test(lead)) {
            totalScore += rule.points;
            reasons.push(`+${rule.points} ${rule.name}`);
        }
    }

    // Cap at 100
    totalScore = Math.min(totalScore, 100);

    return updateLead(leadId, {
        lead_score: totalScore,
        score_reasons: JSON.stringify(reasons),
    });
}

export function rescoreAllLeads(): number {
    const activeStatuses: LeadStatus[] = ['new', 'researching', 'qualified', 'contacted', 'replied', 'meeting'];
    let count = 0;

    for (const status of activeStatuses) {
        const leads = listLeadsByStatus(status, 1000);
        for (const lead of leads) {
            scoreLead(lead.id);
            count++;
        }
    }

    return count;
}
