// ─── Instantly.ai API Integration ────────────────────────────────────────────
// Sends cold emails via Instantly.ai campaigns.
// Uses native fetch + AbortSignal.timeout. No external HTTP deps.

import { config } from '../config.js';

const API_BASE = 'https://api.instantly.ai/api/v2';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InstantlyLead {
    email: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    website?: string;
    custom_variables?: Record<string, string>;
}

interface InstantlyCampaign {
    id: string;
    name: string;
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

let dailyEmailCount = 0;
let lastResetDate = '';

function getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
}

function maybeResetCounter(): void {
    const today = getTodayDate();
    if (lastResetDate !== today) {
        dailyEmailCount = 0;
        lastResetDate = today;
    }
}

export function checkDailyLimit(): boolean {
    maybeResetCounter();
    return dailyEmailCount < config.magnetMaxDailyEmails;
}

export function getEmailStats(): { sent: number; limit: number; remaining: number } {
    maybeResetCounter();
    const limit = config.magnetMaxDailyEmails;
    return { sent: dailyEmailCount, limit, remaining: limit - dailyEmailCount };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getApiKey(): string | null {
    const key = config.instantlyApiKey;
    if (!key) {
        console.error('  [Instantly] INSTANTLY_API_KEY is not set. Skipping.');
        return null;
    }
    return key;
}

async function instantlyFetch<T>(
    path: string,
    options: RequestInit = {},
): Promise<T | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const url = `${API_BASE}${path}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(options.headers as Record<string, string> ?? {}),
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers,
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'unknown error');
            console.error(`  [Instantly] API error ${response.status} on ${options.method ?? 'GET'} ${path}: ${errorText}`);
            return null;
        }

        const data = await response.json() as T;
        return data;
    } catch (err: any) {
        if (err.name === 'TimeoutError') {
            console.error(`  [Instantly] Request timed out: ${options.method ?? 'GET'} ${path}`);
        } else {
            console.error(`  [Instantly] Request failed: ${err.message}`);
        }
        return null;
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a new Instantly campaign.
 */
export async function createCampaign(
    name: string,
): Promise<{ id: string; name: string } | null> {
    console.log(`  [Instantly] Creating campaign: "${name}"`);

    const result = await instantlyFetch<InstantlyCampaign>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
            name,
            schedule: { timezone: 'Europe/Istanbul' },
        }),
    });

    if (result) {
        console.log(`  [Instantly] Campaign created: ${result.id}`);
    }

    return result;
}

/**
 * Add leads to an existing campaign.
 */
export async function addLeadsToCampaign(
    campaignId: string,
    leads: InstantlyLead[],
): Promise<{ added: number }> {
    console.log(`  [Instantly] Adding ${leads.length} lead(s) to campaign ${campaignId}`);

    const result = await instantlyFetch<{ added?: number; count?: number }>(
        `/campaigns/${campaignId}/leads`,
        {
            method: 'POST',
            body: JSON.stringify({ leads }),
        },
    );

    const added = result?.added ?? result?.count ?? leads.length;
    console.log(`  [Instantly] ${added} lead(s) added.`);
    return { added };
}

/**
 * Launch (activate) a campaign so emails start sending.
 */
export async function launchCampaign(campaignId: string): Promise<boolean> {
    console.log(`  [Instantly] Launching campaign ${campaignId}`);

    const result = await instantlyFetch<any>(`/campaigns/${campaignId}/activate`, {
        method: 'POST',
    });

    if (result !== null) {
        console.log(`  [Instantly] Campaign ${campaignId} activated.`);
        return true;
    }

    return false;
}

/**
 * Get campaign status and details.
 */
export async function getCampaignStatus(campaignId: string): Promise<any> {
    console.log(`  [Instantly] Fetching campaign status: ${campaignId}`);
    return instantlyFetch<any>(`/campaigns/${campaignId}`, { method: 'GET' });
}

/**
 * Send a single email by creating a micro-campaign.
 * Creates campaign -> adds one lead -> launches.
 * Respects daily rate limits.
 */
export async function sendSingleEmail(
    to: string,
    subject: string,
    body: string,
): Promise<{ success: boolean; error?: string }> {
    maybeResetCounter();

    if (!checkDailyLimit()) {
        const stats = getEmailStats();
        console.log(`  [Instantly] Daily limit reached (${stats.sent}/${stats.limit}). Skipping.`);
        return { success: false, error: 'Daily email limit reached' };
    }

    if (!getApiKey()) {
        return { success: false, error: 'INSTANTLY_API_KEY not set' };
    }

    // Create a micro-campaign for this single email
    const timestamp = Date.now();
    const campaign = await createCampaign(`auto_${timestamp}_${to.split('@')[0]}`);
    if (!campaign) {
        return { success: false, error: 'Failed to create campaign' };
    }

    // Add the single lead
    const lead: InstantlyLead = { email: to };
    const addResult = await addLeadsToCampaign(campaign.id, [lead]);
    if (addResult.added === 0) {
        return { success: false, error: 'Failed to add lead to campaign' };
    }

    // Launch the campaign
    const launched = await launchCampaign(campaign.id);
    if (!launched) {
        return { success: false, error: 'Failed to launch campaign' };
    }

    dailyEmailCount++;
    const stats = getEmailStats();
    console.log(`  [Instantly] Single email queued to ${to} (${stats.sent}/${stats.limit} today)`);

    return { success: true };
}

/**
 * Alias used by tool modules — wraps sendSingleEmail with named params.
 */
export async function sendViaInstantly(opts: {
    to: string;
    subject: string;
    body: string;
    leadName?: string;
    company?: string;
}): Promise<{ success: boolean; messageId: string | null; error: string | null }> {
    const result = await sendSingleEmail(opts.to, opts.subject, opts.body);
    return {
        success: result.success,
        messageId: result.success ? `instantly_${Date.now()}` : null,
        error: result.error ?? null,
    };
}
