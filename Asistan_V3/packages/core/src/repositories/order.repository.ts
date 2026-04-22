import * as fs from "fs";
import * as path from "path";
import { SupabaseService } from "../services/supabase.service.js";
import { OrderDetail, OrderItem } from "../models/order.schema.js";
import { logger } from "../utils/logger.js";

/**
 * OrderRepository - Data Access Layer
 *
 * Handles all persistence operations for orders:
 * - Supabase (primary database)
 * - Local JSON file (fallback / backup)
 */
export class OrderRepository {
  private static instance: OrderRepository;

  private readonly filePath: string;
  private readonly archivePath: string;
  private readonly logPath: string;
  private readonly supabase: SupabaseService;

  private orders: OrderDetail[] = [];

  private constructor() {
    this.filePath = path.join(process.cwd(), "data", "orders.json");
    this.archivePath = path.join(process.cwd(), "data", "siparis_arsivi.json");
    this.logPath = path.join(process.cwd(), "data", "verilen_siparisler.log");
    this.supabase = SupabaseService.getInstance();
    this.ensureDataDirExists();
  }

  public static getInstance(): OrderRepository {
    if (!OrderRepository.instance) {
      OrderRepository.instance = new OrderRepository();
    }
    return OrderRepository.instance;
  }

  // --- Initialization ---

  private ensureDataDirExists(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Loads orders from Supabase on startup.
   * Falls back to local JSON file if Supabase is unavailable.
   */
  public async loadOrders(): Promise<void> {
    try {
      const data = await this.supabase.getActiveOrders();
      if (data) {
        this.orders = data.map((o: Record<string, unknown>) =>
          this.mapSupabaseRowToOrder(o),
        );
        this.saveToLocalFile();
        logger.info(`${this.orders.length} siparis Supabase'den yuklendi.`);
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Siparisler DB'den yuklenemedi, yerel dosyadan yukleniyor.",
      );
      this.loadFromLocalFile();
    }
  }

  // --- Read Operations ---

  public getAll(): OrderDetail[] {
    return [...this.orders];
  }

  public findById(id: string): OrderDetail | undefined {
    return this.orders.find((o) => o.id === id);
  }

  public findRecent(sinceIsoDate: string): OrderDetail[] {
    return this.orders.filter((o) => o.createdAt > sinceIsoDate);
  }

  public getActiveOrders(): OrderDetail[] {
    return this.orders.filter((o) => o.status !== "archived");
  }

  public getOrderItemById(
    itemId: string,
  ): { order: OrderDetail; item: OrderItem } | null {
    for (const order of this.orders) {
      const item = order.items.find((i) => i.id === itemId);
      if (item) return { order, item };
    }
    return null;
  }

  public getActiveTrackingItems(): { order: OrderDetail; item: OrderItem }[] {
    const activeItems: { order: OrderDetail; item: OrderItem }[] = [];
    this.orders.forEach((order) => {
      order.items.forEach((item) => {
        if (!["hazir", "sevk_edildi", "arsivlendi"].includes(item.status)) {
          activeItems.push({ order, item });
        }
      });
    });
    return activeItems;
  }

  private businessDaysPassed(from: Date, to: Date): number {
    let count = 0;
    const current = new Date(from);
    while (current < to) {
      current.setDate(current.getDate() + 1);
      const day = current.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return count;
  }

  public getItemsNeedingFollowUp(): { order: OrderDetail; item: OrderItem }[] {
    const TRACKED_DEPTS = [
      "ahsap",
      "metal uretimi",
      "mobilya dekorasyon",
      "karkas uretimi",
      "dikishane",
      "dosemehane",
    ];
    const BUSINESS_DAY_THRESHOLD = 5;
    const now = new Date();
    const results: { order: OrderDetail; item: OrderItem }[] = [];

    this.orders.forEach((order) => {
      order.items.forEach((item) => {
        if (
          item.status === "uretimde" &&
          item.distributedAt &&
          item.assignedWorker
        ) {
          const isTracked = TRACKED_DEPTS.some((d) =>
            item.department.toLowerCase().includes(d),
          );
          if (!isTracked) return;

          const dist = new Date(item.distributedAt);
          const bizDays = this.businessDaysPassed(dist, now);
          if (bizDays >= BUSINESS_DAY_THRESHOLD) {
            results.push({ order, item });
          }
        }
      });
    });
    return results;
  }

  // --- Write Operations ---

  /**
   * Persists a new or updated order to Supabase and local backup.
   */
  public async save(order: OrderDetail): Promise<void> {
    // Add or update in memory
    const existingIndex = this.orders.findIndex((o) => o.id === order.id);
    if (existingIndex !== -1) {
      this.orders[existingIndex] = order;
    } else {
      this.orders.push(order);
    }

    // Persist to Supabase
    try {
      await this.supabase.upsertOrder(order);
      for (const item of order.items) {
        await this.supabase.upsertOrderItem(
          item as OrderItem & Record<string, unknown>,
          order.id,
        );
      }
      logger.info(`Siparis DB'ye kaydedildi: ${order.id}`);
    } catch (error) {
      logger.error(
        { err: error },
        `Siparis DB'ye kaydedilemedi: ${order.id}`,
      );
    }

    // Always update local backup
    this.saveToLocalFile();
  }

  /**
   * Updates a specific order item and persists changes.
   */
  public async updateOrderItem(
    itemId: string,
    updates: Partial<OrderItem>,
  ): Promise<boolean> {
    for (const order of this.orders) {
      const itemIndex = order.items.findIndex((i) => i.id === itemId);
      if (itemIndex !== -1) {
        const item = order.items[itemIndex];
        Object.assign(item, updates);
        item.updatedAt = new Date().toISOString();
        order.updatedAt = new Date().toISOString();

        await this.save(order);
        return true;
      }
    }
    return false;
  }

  /**
   * Specifically handles fabric status updates.
   */
  public async updateFabricStatus(
    itemId: string,
    arrived: boolean,
    note?: string,
  ): Promise<boolean> {
    const result = this.getOrderItemById(itemId);
    if (!result) return false;

    const { item } = result;
    if (!item.fabricDetails) {
      item.fabricDetails = { name: "Bilinmiyor", amount: 0, arrived: false };
    }

    item.fabricDetails.arrived = arrived;
    if (note) item.fabricDetails.issueNote = note;

    if (arrived) {
      item.lastReminderAt = undefined;
      item.status = "bekliyor";
    }

    return this.updateOrderItem(itemId, {
      fabricDetails: item.fabricDetails,
      status: item.status,
      lastReminderAt: item.lastReminderAt,
    });
  }

  public async updateLastReminder(itemId: string): Promise<void> {
    await this.updateOrderItem(itemId, {
      lastReminderAt: new Date().toISOString(),
    });
  }

  /**
   * Archives an order (status -> "completed") in DB and local file.
   * @returns true if found and archived successfully, false otherwise.
   */
  public async archive(orderId: string): Promise<boolean> {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      logger.warn(`Archive attempt on non-existent order: ${orderId}`);
      return false;
    }

    order.status = "archived";
    order.updatedAt = new Date().toISOString();
    await this.save(order);

    // Append to archive log
    try {
      const archived = this.loadArchive();
      archived.push(order);
      fs.writeFileSync(this.archivePath, JSON.stringify(archived, null, 2));
    } catch (error) {
      logger.error({ err: error }, "Arsiv dosyasina yazilamadi.");
    }
    return true;
  }

  /**
   * Alias for archive() -- named archiveOrder for backward compat with OrderService.
   */
  public async archiveOrder(orderId: string): Promise<boolean> {
    return this.archive(orderId);
  }

  /**
   * Appends a log entry string, or builds a log entry from an OrderDetail.
   */
  public appendLog(entry: string | OrderDetail): void {
    let logEntry: string;
    if (typeof entry === "string") {
      logEntry = entry;
    } else {
      const order = entry;
      const timestamp = new Date().toLocaleString("tr-TR");
      logEntry = `[${timestamp}] YENI SIPARIS: ${order.orderNumber} - Musteri: ${order.customerName}\n`;
      order.items.forEach((item) => {
        logEntry += `  - ${item.product} | ${item.quantity} Adet | Departman: ${item.department} | Kaynak: ${item.source}\n`;
      });
      logEntry += `------------------------------------------------------------`;
    }
    try {
      fs.appendFileSync(this.logPath, logEntry + "\n\n", "utf-8");
      logger.info(`Log yazildi.`);
    } catch (error) {
      logger.error({ err: error }, "Log dosyasina yazilamadi.");
    }
  }

  // --- Private Helpers ---

  private saveToLocalFile(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.orders, null, 2));
    } catch (error) {
      logger.error(
        { err: error },
        "Siparis verileri yerel dosyaya kaydedilemedi.",
      );
    }
  }

  private loadFromLocalFile(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const data = fs.readFileSync(this.filePath, "utf-8");
        this.orders = JSON.parse(data) as OrderDetail[];
        logger.info(
          `${this.orders.length} siparis yerel dosyadan yuklendi.`,
        );
      } catch (error) {
        logger.error({ err: error }, "Yerel siparis dosyasi okunamadi.");
      }
    }
  }

  private loadArchive(): OrderDetail[] {
    if (fs.existsSync(this.archivePath)) {
      try {
        const data = fs.readFileSync(this.archivePath, "utf-8");
        return JSON.parse(data) as OrderDetail[];
      } catch {
        return [];
      }
    }
    return [];
  }

  private mapSupabaseRowToOrder(o: Record<string, unknown>): OrderDetail {
    return {
      id: String(o["id"]),
      orderNumber: String(o["order_number"]),
      customerName: String(o["customer_name"]),
      deliveryDate: String(o["delivery_date"]),
      status: o["status"] as OrderDetail["status"],
      createdAt: String(o["created_at"]),
      updatedAt: String(o["updated_at"]),
      items: ((o["order_items"] as Record<string, unknown>[]) || []).map(
        (i) => ({
          id: String(i["id"]),
          product: String(i["product"]),
          department: String(i["department"]),
          quantity: Number(i["quantity"]),
          details: String(i["details"] ?? ""),
          source: i["source"] as OrderItem["source"],
          imageUrl: i["image_url"] as string | undefined,
          status: (i["status"] ?? "bekliyor") as OrderItem["status"],
          assignedWorker: i["assigned_worker"] as string | undefined,
          fabricDetails: i["fabric_name"]
            ? {
                name: String(i["fabric_name"]),
                amount: Number(i["fabric_amount"] ?? 0),
                arrived: Boolean(i["fabric_arrived"]),
                issueNote: i["fabric_issue_note"] as string | undefined,
              }
            : undefined,
          lastReminderAt: i["last_reminder_at"] as string | undefined,
          rowIndex: i["row_index"] as number | undefined,
          createdAt: String(i["created_at"]),
          updatedAt: String(i["updated_at"]),
        }),
      ),
    };
  }
}
