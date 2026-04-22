import { createClient, SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { logger } from "../utils/logger.js";

export class SupabaseService {
  private static instance: SupabaseService;
  private client: SupabaseClient;

  private constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (!url || !key) {
      logger.warn("Supabase credentials are missing in .env!");
    }

    this.client = createClient(url || "", key || "");
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  public getClient(): SupabaseClient {
    return this.client;
  }

  // --- Orders ---
  async upsertOrder(order: any) {
    const { data, error } = await this.client.from("orders").upsert(
      {
        id: order.id.toString(),
        order_number: order.orderNumber,
        customer_name: order.customerName,
        delivery_date: order.deliveryDate,
        status: order.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
    return data;
  }

  async getActiveOrders() {
    const { data, error } = await this.client
      .from("orders")
      .select("*, order_items(*)")
      .neq("status", "archived");
    if (error) throw error;
    return data;
  }

  // --- Order Items ---
  async upsertOrderItem(item: any, orderId: string, index?: number) {
    const itemId = item.id || `${orderId}_${index ?? Math.random().toString(36).substr(2, 9)}`;
    const { data, error } = await this.client.from("order_items").upsert(
      {
        id: itemId,
        order_id: orderId,
        product: item.product,
        department: item.department,
        quantity: item.quantity,
        details: item.details,
        source: item.source,
        image_url: item.imageUrl,
        status: item.status,
        assigned_worker: item.assignedWorker,
        fabric_name: item.fabricDetails?.name,
        fabric_amount: item.fabricDetails?.amount,
        fabric_arrived: item.fabricDetails?.arrived,
        fabric_issue_note: item.fabricDetails?.issueNote,
        last_reminder_at: item.lastReminderAt,
        row_index: item.rowIndex,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
    return data;
  }

  // --- Staff ---
  async getAllStaff() {
    const { data, error } = await this.client.from("staff").select("*");
    if (error) throw error;
    return data;
  }

  async upsertStaff(staff: any) {
    const { data: existing } = await this.client
      .from("staff")
      .select("id")
      .eq("telegram_id", staff.telegramId)
      .maybeSingle();

    const staffId = existing
      ? existing.id
      : staff.id && staff.id.length > 10
        ? staff.id
        : crypto.randomUUID();

    const { data, error } = await this.client.from("staff").upsert(
      {
        id: staffId,
        telegram_id: staff.telegramId,
        name: staff.name,
        department: staff.department,
        role: staff.role,
        phone: staff.phone,
      },
      { onConflict: "telegram_id" },
    );
    if (error) throw error;
    return data;
  }

  async deleteStaff(telegramId: number) {
    const { error } = await this.client
      .from("staff")
      .delete()
      .eq("telegram_id", telegramId.toString());
    if (error) throw error;
    return true;
  }

  // --- Wiki Pages ---
  async upsertWikiPage(page: any) {
    const { data, error } = await this.client.from("wiki_pages").upsert(
      {
        slug: page.slug,
        title: page.title,
        content: page.content,
        page_type: page.pageType,
        tags: page.tags || [],
        source_refs: page.sourceRefs || [],
        outgoing_links: page.outgoingLinks || [],
        incoming_links: page.incomingLinks || [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );
    if (error) throw error;
    return data;
  }

  async getWikiPage(slug: string) {
    const { data, error } = await this.client
      .from("wiki_pages")
      .select("*")
      .eq("slug", slug)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data;
  }

  async searchWikiPages(query: string, limit = 5) {
    const { data, error } = await this.client
      .from("wiki_pages")
      .select("slug, title, page_type, tags")
      .textSearch("content", query, { type: "websearch" })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  // --- Prompt Decisions ---
  async logPromptDecision(decision: any) {
    const { data, error } = await this.client.from("prompt_decisions").insert({
      prompt_version: decision.promptVersion,
      input_hash: decision.inputHash,
      input_summary: decision.inputSummary,
      output: decision.output,
      context: decision.context,
      confidence: decision.confidence,
      outcome: decision.outcome || "unknown",
      interaction_type: decision.interactionType,
    });
    if (error) throw error;
    return data;
  }

  async getActivePromptVersion() {
    const { data, error } = await this.client
      .from("prompt_versions")
      .select("*")
      .eq("is_active", true)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data;
  }

  async activatePromptVersion(version: string) {
    // Deactivate all
    await this.client.from("prompt_versions").update({ is_active: false, deactivated_at: new Date().toISOString() }).eq("is_active", true);
    // Activate target
    const { data, error } = await this.client.from("prompt_versions").update({ is_active: true, activated_at: new Date().toISOString() }).eq("version", version);
    if (error) throw error;
    return data;
  }

  // --- Visual Memory (pgvector) ---

  async resetOrdersAndVisualMemory() {
    // Delete order_items first (foreign key dependency), then orders, then visual_memory
    const { error: e1 } = await this.client.from("order_items").delete().neq("id", "__never_match__");
    if (e1) logger.warn({ err: e1 }, "Failed to clear order_items");
    const { error: e2 } = await this.client.from("orders").delete().neq("id", "__never_match__");
    if (e2) logger.warn({ err: e2 }, "Failed to clear orders");
    const { error: e3 } = await this.client.from("visual_memory").delete().neq("id", "__never_match__");
    if (e3) logger.warn({ err: e3 }, "Failed to clear visual_memory");
  }
  async upsertVisualMemory(
    id: string,
    productName: string,
    customerName: string,
    orderId: string,
    tags: string[],
    vector: number[],
    imageUrl: string,
  ) {
    const { data, error } = await this.client.from("visual_memory").upsert(
      {
        id,
        product_name: productName,
        customer_name: customerName,
        order_id: orderId,
        tags,
        embedding: vector,
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
    return data;
  }
}
