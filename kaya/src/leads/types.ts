// ─── Lead Management Types ──────────────────────────────────────────────────

export type LeadStatus = 'new' | 'researching' | 'qualified' | 'contacted' | 'replied' | 'meeting' | 'won' | 'lost';
export type OutreachChannel = 'email' | 'telegram' | 'whatsapp';
export type LeadSource = 'web_scrape' | 'telegram_group' | 'manual' | 'referral' | 'inbound' | 'partner_discovery';

export interface Lead {
    id: number;
    full_name: string;
    company: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    telegram_id: string | null;
    website: string | null;
    industry: string | null;
    country: string;
    source: LeadSource;
    lead_score: number;
    score_reasons: string;       // JSON string
    status: LeadStatus;
    persona_tag: string | null;
    tags: string;                // comma-separated
    enrichment_data: string;     // JSON string
    notes: string | null;
    conversation_stage?: string;  // cold|introduction|qualification|value_prop|objection_handling|close|won|lost
    created_at: string;
    updated_at: string;
}

export interface OutreachMessage {
    id: number;
    lead_id: number;
    channel: OutreachChannel;
    message_type: string;        // 'cold_intro' | 'follow_up_1' | 'follow_up_2' | 'follow_up_3' | 'custom'
    template_id: string | null;
    message_content: string;
    personalization_data: string; // JSON
    sent_at: string;
    replied_at: string | null;
    reply_content: string | null;
    reply_sentiment: string | null; // 'positive' | 'negative' | 'neutral'
    status: string;              // 'sent' | 'delivered' | 'opened' | 'replied' | 'bounced'
}

export interface Campaign {
    id: number;
    name: string;
    target_industry: string | null;
    target_country: string | null;
    status: string;              // 'draft' | 'active' | 'paused' | 'completed'
    created_at: string;
}
