// ─── Outreach Message Templates ──────────────────────────────────────────────
// 24 templates (Turkish + English) for cold outreach, follow-ups, value offers,
// re-engagement, and website pitch campaigns. Variables use {{var}} syntax.
//
// Template variables (TemplateVars):
//   {{name}}                — lead's first/full name
//   {{company}}             — company name
//   {{title}}               — job title
//   {{industry}}            — industry
//   {{pain_point}}          — identified pain point
//   {{personalization_hook}}— LLM-generated personalization line
//   {{vercel_url}}          — live Vercel preview URL (website_pitch only)

export interface OutreachTemplate {
    id: string;
    name: string;
    category: 'cold_intro' | 'follow_up' | 'value_offer' | 'reengagement' | 'website_pitch';
    language: 'tr' | 'en';
    subject: string;
    body: string;
}

export type TemplateVars = Record<string, string>;

// ─── Cold Intro Templates ────────────────────────────────────────────────────

const cold_intro_tr_1: OutreachTemplate = {
    id: 'cold_intro_tr_1',
    name: 'Direct Value - TR',
    category: 'cold_intro',
    language: 'tr',
    subject: '{{company}} icin profesyonel web tasarimi',
    body: `Merhaba {{name}},

{{company}} web sitesini inceledim — sizin icin modern ve profesyonel bir tasarim hazırlayabiliriz. {{industry}} sektorundeki isletmelere premium web siteleri olusturuyoruz.

{{personalization_hook}}

5 dakikalik kisa bir gorusme icin musait misiniz?

Iyi calismalar`,
};

const cold_intro_tr_2: OutreachTemplate = {
    id: 'cold_intro_tr_2',
    name: 'Question Hook - TR',
    category: 'cold_intro',
    language: 'tr',
    subject: '{{company}} - web sitenizi yenileyebiliriz',
    body: `Merhaba {{name}},

{{company}} web sitesine baktim — {{pain_point}} konusunda iyilestirme yapilabilecek alanlar goruyorum.

{{industry}} sektorundeki isletmelere modern, mobil uyumlu ve profesyonel web tasarimlari sunuyoruz. {{personalization_hook}}

Konusmak ister misiniz?

Saygilarimla`,
};

const cold_intro_tr_3: OutreachTemplate = {
    id: 'cold_intro_tr_3',
    name: 'Social Proof - TR',
    category: 'cold_intro',
    language: 'tr',
    subject: '{{industry}} isletmeleri web sitelerini nasil donusturuyor',
    body: `Merhaba {{name}},

Gecen ay 3 {{industry}} isletmesi icin web sitesi yeniledik — hepsi ilk haftada online gorunurluklerini artirdi.

{{personalization_hook}}

{{company}} icin de benzer bir donusum mumkun. Ucretsiz bir tasarim ornegi gonderebilir miyim?

Iyi gunler`,
};

const cold_intro_en_1: OutreachTemplate = {
    id: 'cold_intro_en_1',
    name: 'Direct Value - EN',
    category: 'cold_intro',
    language: 'en',
    subject: 'Premium website redesign for {{company}}',
    body: `Hi {{name}},

We help {{industry}} businesses look more professional online with modern, premium website designs. We've redesigned dozens of sites — all free, no strings attached.

{{personalization_hook}}

Would love to show you what we could do for {{company}}. Got 5 minutes this week?

Best`,
};

const cold_intro_en_2: OutreachTemplate = {
    id: 'cold_intro_en_2',
    name: 'Question Hook - EN',
    category: 'cold_intro',
    language: 'en',
    subject: 'Quick question about {{company}}\'s website',
    body: `Hey {{name}},

Quick question — when was the last time {{company}}'s website got a refresh?

We build modern, mobile-first websites for {{industry}} businesses. {{personalization_hook}}

Happy to share a free mockup if you're curious.

Cheers`,
};

const cold_intro_en_3: OutreachTemplate = {
    id: 'cold_intro_en_3',
    name: 'Results-Led - EN',
    category: 'cold_intro',
    language: 'en',
    subject: 'How {{industry}} businesses are upgrading their online presence',
    body: `Hi {{name}},

We recently redesigned a {{industry}} business's website — they saw a noticeable jump in online bookings within the first week.

{{personalization_hook}}

I think {{company}} could see similar results with a fresh design. Want me to send you a free preview?

Best regards`,
};

// ─── Follow-Up Templates ─────────────────────────────────────────────────────

const follow_up_1_tr: OutreachTemplate = {
    id: 'follow_up_1_tr',
    name: 'Gentle Reminder (3 days) - TR',
    category: 'follow_up',
    language: 'tr',
    subject: 'Re: {{company}} icin web tasarimi',
    body: `Merhaba {{name}},

Gecen gonderdigim mesaji gormus muydunuz? Mesgul oldugunuzu biliyorum.

{{company}} icin hazirladigim tasarim ornegini gormek ister misiniz? 2 dakikanizi alir ve ne kadar farkli gorunebilecegini gosterir.

Iyi calismalar`,
};

const follow_up_1_en: OutreachTemplate = {
    id: 'follow_up_1_en',
    name: 'Gentle Reminder (3 days) - EN',
    category: 'follow_up',
    language: 'en',
    subject: 'Re: Website redesign for {{company}}',
    body: `Hi {{name}},

Just wanted to make sure my previous message didn't get buried. I know things get busy.

Can I send over a quick preview of what {{company}}'s new website could look like? Takes 30 seconds to check out.

Best`,
};

const follow_up_2_tr: OutreachTemplate = {
    id: 'follow_up_2_tr',
    name: 'Value Add (7 days) - TR',
    category: 'follow_up',
    language: 'tr',
    subject: '{{industry}} sektorune ozel tasarim ornegi',
    body: `{{name}},

Sizin {{industry}} sektorunuze ozel bir web tasarim ornegi hazirladim. Benzer bir isletme yeni sitesini kullanmaya basladiktan sonra online randevu sayisini 3 katina cikardi.

Gormek ister misiniz? Hicbir baglayiciligi yok, sadece deger sunmak istiyorum.

Saygilarimla`,
};

const follow_up_2_en: OutreachTemplate = {
    id: 'follow_up_2_en',
    name: 'Value Add (7 days) - EN',
    category: 'follow_up',
    language: 'en',
    subject: 'Before & after: {{industry}} website redesign',
    body: `{{name}},

I put together a quick before/after showing how a similar {{industry}} business transformed their online presence. They saw a noticeable increase in bookings within weeks.

Want me to share? No strings attached — just thought it'd be useful.

Cheers`,
};

const follow_up_3_tr: OutreachTemplate = {
    id: 'follow_up_3_tr',
    name: 'Breakup (14 days) - TR',
    category: 'follow_up',
    language: 'tr',
    subject: 'Son mesajim - {{company}}',
    body: `Merhaba {{name}},

Birkac kez ulastim ama cevap alamadim. Tamamen anlayisla karsiliyorum - zamanlama her zaman dogru olmayabilir.

Eger ileride web sitenizi yenilemek isterseniz, bu mesaji referans alabilirsiniz. Kapimiz her zaman acik.

Basarilar dilerim`,
};

const follow_up_3_en: OutreachTemplate = {
    id: 'follow_up_3_en',
    name: 'Breakup (14 days) - EN',
    category: 'follow_up',
    language: 'en',
    subject: 'Closing the loop - {{company}}',
    body: `Hi {{name}},

I've reached out a couple of times but haven't heard back. Totally understand - timing isn't always right.

If a website refresh ever becomes a priority for {{company}}, feel free to circle back to this thread. Happy to help anytime.

All the best`,
};

// ─── Value Offer Templates ───────────────────────────────────────────────────

const value_offer_tr: OutreachTemplate = {
    id: 'value_offer_tr',
    name: 'Free AI Audit - TR',
    category: 'value_offer',
    language: 'tr',
    subject: '{{company}} icin ucretsiz web site analizi',
    body: `{{name}},

{{company}} icin ucretsiz bir "Web Site Analizi" cikarabiliriz — sitenizin neleri iyi yaptigini ve nelerin iyilestirilebilecegini gosteren kisa bir rapor.

{{industry}} sektorundeki bir isletme bu analiz sonrasi sitesini yeniledikten sonra online randevularda ciddi artis gordu.

{{personalization_hook}}

Ilgilenir misiniz?

Iyi calismalar`,
};

const value_offer_en: OutreachTemplate = {
    id: 'value_offer_en',
    name: 'Free AI Audit - EN',
    category: 'value_offer',
    language: 'en',
    subject: 'Free website audit for {{company}}',
    body: `{{name}},

We're offering a free "Website Audit" for {{industry}} businesses — a quick report showing what's working, what could be better, and how a modern redesign would look.

One of our clients went live with their new site and saw bookings increase significantly.

{{personalization_hook}}

Interested?

Best regards`,
};

// ─── Re-engagement Templates ─────────────────────────────────────────────────

const reengagement_tr: OutreachTemplate = {
    id: 'reengagement_tr',
    name: 'Update & Re-engage - TR',
    category: 'reengagement',
    language: 'tr',
    subject: 'Yeni ozellikler - {{company}} icin faydali olabilir',
    body: `Merhaba {{name}},

Gecen konustugumuzdan beri bazi harika yeni tasarimlar ortaya cikardik. Ozellikle {{industry}} isletmeleri icin cok etkileyici olacak yenilikler var.

{{personalization_hook}}

Tekrar gorusmek ister misiniz? Kisa bir demo ayarlayabilirim.

Iyi gunler`,
};

const reengagement_en: OutreachTemplate = {
    id: 'reengagement_en',
    name: 'Update & Re-engage - EN',
    category: 'reengagement',
    language: 'en',
    subject: "New features that could help {{company}}",
    body: `Hi {{name}},

Since we last spoke, we've created some stunning new website designs — especially great for {{industry}} businesses.

{{personalization_hook}}

Would you be open to a quick catch-up? I can show you the new capabilities in 10 minutes.

Best`,
};

// ─── Partner Agency Templates ───────────────────────────────────────────────

const partner_intro_tr: OutreachTemplate = {
    id: 'partner_intro_tr',
    name: 'Agency Partnership - TR',
    category: 'cold_intro',
    language: 'tr',
    subject: '{{company}} + Kaya partnership onerisi',
    body: `Merhaba {{name}},

{{company}} olarak musterilerinize sundugu {{industry}} hizmetlerinden etkilendim.

Isletmeler icin modern web tasarimi ve dijital donusum cozumleri sunuyoruz — eski web sitelerini tamamen yeniden tasarlayip ucretsiz olarak sunuyoruz.

{{personalization_hook}}

Ajansinizin musterileri icin beyaz etiketli (white-label) bir cozum sunabiliriz. Gelir paylasimli bir partnership modeli dusunuyoruz.

Kisa bir gorusme ayarlayabilir miyiz?

Saygilarimla,
Kaya`,
};

const partner_intro_en: OutreachTemplate = {
    id: 'partner_intro_en',
    name: 'Agency Partnership - EN',
    category: 'cold_intro',
    language: 'en',
    subject: 'Partnership opportunity: {{company}} + Kaya',
    body: `Hi {{name}},

I came across {{company}} and was impressed by your work in {{industry}}.

We build premium website redesigns for local businesses — completely free, deployed instantly. We're looking for agency partners to offer this as a white-label solution to their clients.

{{personalization_hook}}

Would you be open to a quick 15-min call to explore this?

Best,
Kaya`,
};

const partner_follow_up: OutreachTemplate = {
    id: 'partner_follow_up',
    name: 'Agency Follow-up - EN',
    category: 'follow_up',
    language: 'en',
    subject: 'Re: Partnership — {{company}} + Kaya',
    body: `Hi {{name}},

Just following up on my previous note about a potential partnership between {{company}} and Kaya.

Quick context: our agency partners typically add value by offering premium website redesigns to their clients at no dev cost. White-label, zero effort on your side.

{{personalization_hook}}

Happy to share our partner deck if you're interested.

Cheers,
Kaya`,
};

// ─── Website Pitch Templates ────────────────────────────────────────────────

const website_pitch_cold_tr_1: OutreachTemplate = {
    id: 'website_pitch_cold_tr_1',
    name: 'Website Pitch - Direct - TR',
    category: 'website_pitch',
    language: 'tr',
    subject: '{{company}} icin modern web tasarimi hazirladim',
    body: `Merhaba {{name}},

{{company}} web sitesini inceledim ve sizin icin modern bir tasarim hazirladim.

Canli onizleme: {{vercel_url}}

Bu tamamen ucretsiz — herhangi bir baglayiciligi yok. Sadece ne kadar farkli gorunebilecegini gostermek istedim.

Begenirseniz konusalim!

Iyi calismalar`,
};

const website_pitch_cold_en_1: OutreachTemplate = {
    id: 'website_pitch_cold_en_1',
    name: 'Website Pitch - Direct - EN',
    category: 'website_pitch',
    language: 'en',
    subject: 'I redesigned {{company}}\'s website — take a look',
    body: `Hi {{name}},

I took a look at {{company}}'s website and built a modern redesign for you.

Live preview: {{vercel_url}}

This is completely free — no strings attached. I just wanted to show you what's possible with a fresh design.

If you like it, let's chat!

Best`,
};

const website_pitch_followup_tr_1: OutreachTemplate = {
    id: 'website_pitch_followup_tr_1',
    name: 'Website Pitch - Follow-up (3 days) - TR',
    category: 'website_pitch',
    language: 'tr',
    subject: 'Re: {{company}} icin hazirladigim tasarim',
    body: `Merhaba {{name}},

Birkac gun once {{company}} icin hazirladigim modern web tasarimini paylasmistim. Gorme firsatiniz oldu mu?

Tekrar link: {{vercel_url}}

Herhangi bir degisiklik isterseniz ucretsiz olarak yaparim. Amacim sadece isletmenizin dijitalde daha iyi gorunmesini saglamak.

Iyi calismalar`,
};

const website_pitch_followup_en_1: OutreachTemplate = {
    id: 'website_pitch_followup_en_1',
    name: 'Website Pitch - Follow-up (3 days) - EN',
    category: 'website_pitch',
    language: 'en',
    subject: 'Re: New website design for {{company}}',
    body: `Hi {{name}},

I shared a redesign of {{company}}'s website a few days ago — did you get a chance to check it out?

Here's the link again: {{vercel_url}}

Happy to make any changes you'd like, completely free. Just want to help your business look its best online.

Cheers`,
};

const website_pitch_value_tr_1: OutreachTemplate = {
    id: 'website_pitch_value_tr_1',
    name: 'Website Pitch - Value - TR',
    category: 'website_pitch',
    language: 'tr',
    subject: '{{company}} icin ucretsiz profesyonel web sitesi',
    body: `Merhaba {{name}},

{{company}} gibi isletmelerin internette daha profesyonel gorunmesine yardimci oluyoruz — ve bunu tamamen ucretsiz yapiyoruz.

Sizin icin hazirladigim tasarimi buradan inceleyebilirsiniz: {{vercel_url}}

Neden ucretsiz? Cunku portfolyomuzu buyutmek istiyoruz ve sizin gibi kaliteli isletmelerle calismak bizim icin referans degeri tasiyor.

Hicbir baglayiciligi yok. Begenirseniz kullanin, begenmezseniz hicbir sey degismez.

Iyi calismalar`,
};

const website_pitch_value_en_1: OutreachTemplate = {
    id: 'website_pitch_value_en_1',
    name: 'Website Pitch - Value - EN',
    category: 'website_pitch',
    language: 'en',
    subject: 'Free professional website for {{company}}',
    body: `Hi {{name}},

We help businesses like {{company}} look more professional online — and we do it completely free.

Here's the design I built for you: {{vercel_url}}

Why free? We're growing our portfolio and working with quality businesses like yours is great for our references.

No strings attached. Use it if you like it, no worries if you don't.

Best`,
};

// ─── Template Registry ───────────────────────────────────────────────────────

export const allTemplates: OutreachTemplate[] = [
    // Cold intros (6)
    cold_intro_tr_1, cold_intro_tr_2, cold_intro_tr_3,
    cold_intro_en_1, cold_intro_en_2, cold_intro_en_3,
    // Follow-ups (7)
    follow_up_1_tr, follow_up_1_en,
    follow_up_2_tr, follow_up_2_en,
    follow_up_3_tr, follow_up_3_en,
    partner_follow_up,
    // Value offers (2)
    value_offer_tr, value_offer_en,
    // Re-engagement (2)
    reengagement_tr, reengagement_en,
    // Partner agency (2)
    partner_intro_tr, partner_intro_en,
    // Website pitch (6)
    website_pitch_cold_tr_1, website_pitch_cold_en_1,
    website_pitch_followup_tr_1, website_pitch_followup_en_1,
    website_pitch_value_tr_1, website_pitch_value_en_1,
];

// Backward compatibility alias
export const TEMPLATES = allTemplates;

/**
 * Get templates filtered by category.
 */
export function getTemplatesByCategory(
    category: OutreachTemplate['category'],
): OutreachTemplate[] {
    return allTemplates.filter(t => t.category === category);
}

/**
 * Get templates filtered by language.
 */
export function getTemplatesByLanguage(
    language: OutreachTemplate['language'],
): OutreachTemplate[] {
    return allTemplates.filter(t => t.language === language);
}

/**
 * Get templates filtered by category and/or language.
 */
export function getTemplates(
    category?: OutreachTemplate['category'],
    language?: OutreachTemplate['language'],
): OutreachTemplate[] {
    return allTemplates.filter(t =>
        (!category || t.category === category) &&
        (!language || t.language === language)
    );
}

/**
 * Get a template by its ID.
 */
export function getTemplateById(id: string): OutreachTemplate | undefined {
    return allTemplates.find(t => t.id === id);
}

/**
 * Pick a random template from a category + language combo.
 * Falls back to any template in the category if no language match.
 */
export function pickRandomTemplate(
    category: OutreachTemplate['category'],
    language: OutreachTemplate['language'],
): OutreachTemplate | undefined {
    const candidates = getTemplates(category, language);
    if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    // Fallback: any template in that category
    const fallback = getTemplatesByCategory(category);
    if (fallback.length > 0) {
        return fallback[Math.floor(Math.random() * fallback.length)];
    }
    return undefined;
}

/**
 * Replace {{variable}} placeholders in a template with actual values.
 * Unknown variables are left as-is.
 */
export function interpolateTemplate(
    template: OutreachTemplate,
    vars: TemplateVars,
): { subject: string; body: string } {
    const replace = (text: string): string =>
        text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);

    return {
        subject: replace(template.subject),
        body: replace(template.body),
    };
}
