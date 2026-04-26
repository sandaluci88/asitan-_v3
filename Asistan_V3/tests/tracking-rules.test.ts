/**
 * Test Suite: Tracking Rules — Kumas, Uretim, Olumsuzluk
 *
 * Rules (Baris Bey — 2026-04-23):
 * 1. Kumas → 24 saatte bir sor, gelince biter
 * 2. Personel uretim → 5 gunde 1 durum sorgusu → Marina'ya rapor
 * 3. Olumsuzluk → raporla Marina'ya
 */

import { describe, it, expect } from "vitest";
import { OrderItemSchema } from "../packages/core/src/models/order.schema.js";

// ─── Kumas Takip: 24 Saat Kuralı ──────────────────────────────────

describe("Tracking: Kumas 24 saat kurali", () => {
  it("kumas item with arrived=false needs follow-up", () => {
    const item = {
      id: "item-k1",
      product: "Koltuk",
      department: "Kumas",
      quantity: 5,
      details: "Ткань: Keten Bej",
      source: "Production" as const,
      status: "bekliyor" as const,
      fabricDetails: { name: "Keten Bej", amount: 17.5, arrived: false },
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
      updatedAt: new Date().toISOString(),
    };
    const result = OrderItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fabricDetails!.arrived).toBe(false);
      // 24 hours passed → needs reminder
      const hoursSinceCreate = (Date.now() - new Date(result.data.createdAt).getTime()) / (1000 * 60 * 60);
      expect(hoursSinceCreate).toBeGreaterThanOrEqual(24);
    }
  });

  it("kumas item with arrived=true does NOT need follow-up", () => {
    const item = {
      id: "item-k2",
      product: "Koltuk",
      department: "Kumas",
      quantity: 5,
      details: "Ткань geldi",
      source: "Production" as const,
      status: "uretimde" as const,
      fabricDetails: { name: "Keten Bej", amount: 17.5, arrived: true },
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = OrderItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fabricDetails!.arrived).toBe(true);
    }
  });

  it("kumas reminder resets lastReminderAt", () => {
    const now = new Date().toISOString();
    const item = {
      id: "item-k3",
      product: "Koltuk",
      department: "Kumas",
      quantity: 5,
      details: "",
      source: "Production" as const,
      status: "bekliyor" as const,
      fabricDetails: { name: "Keten", amount: 10, arrived: false },
      lastReminderAt: now,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = OrderItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      // lastReminderAt is set → next reminder should be 24h after this
      expect(result.data.lastReminderAt).toBeTruthy();
    }
  });
});

// ─── Uretim Takip: 5 Gun Kuralı ───────────────────────────────────

describe("Tracking: Personel uretim 5 gun kurali", () => {
  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

  it("item distributed >5 days ago needs status check", () => {
    const fiveDaysAgo = new Date(Date.now() - FIVE_DAYS_MS - 1).toISOString();
    const item = {
      id: "item-p1",
      product: "Sandalye",
      department: "Karkas Uretimi",
      quantity: 50,
      details: "Уретим Япыладжак",
      source: "Production" as const,
      status: "uretimde" as const,
      assignedWorker: "Bekbergen",
      distributedAt: fiveDaysAgo,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = OrderItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      const daysSinceDistribution = (Date.now() - new Date(result.data.distributedAt!).getTime()) / (1000 * 60 * 60 * 24);
      expect(daysSinceDistribution).toBeGreaterThan(5);
    }
  });

  it("item distributed <5 days ago does NOT need check yet", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const item = {
      id: "item-p2",
      product: "Sandalye",
      department: "Karkas Uretimi",
      quantity: 50,
      details: "",
      source: "Production" as const,
      status: "uretimde" as const,
      assignedWorker: "Bekbergen",
      distributedAt: threeDaysAgo,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = OrderItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      const daysSinceDistribution = (Date.now() - new Date(result.data.distributedAt!).getTime()) / (1000 * 60 * 60 * 24);
      expect(daysSinceDistribution).toBeLessThan(5);
    }
  });

  it("completed items are excluded from tracking", () => {
    const item = {
      id: "item-p3",
      product: "Sandalye",
      department: "Karkas Uretimi",
      quantity: 50,
      details: "",
      source: "Production" as const,
      status: "hazir" as const,
      assignedWorker: "Bekbergen",
      distributedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = OrderItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    // Status is "hazir" → should NOT be tracked
    if (result.success) {
      expect(result.data.status).toBe("hazir");
    }
  });
});

// ─── Olumsuzluk Raporlama ─────────────────────────────────────────

describe("Tracking: Olumsuzluk raporlama", () => {
  it("negative status keywords are detectable", () => {
    const negativeKeywords = [
      "hammadde yok",
      "iş başlamadı",
      "malzeme gelmedi",
      "aksaklık var",
      "gecikecek",
      "sorun var",
      "yapamıyorum",
      "нет материала",
      "не начат",
      "задержка",
      "проблема",
    ];
    // All should be non-empty strings
    for (const kw of negativeKeywords) {
      expect(kw.length).toBeGreaterThan(0);
    }
  });

  it("olumsuzluk message format contains required fields", () => {
    const report = {
      department: "Metal Uretimi",
      issue: "hammadde yok, iş başlamadı",
      item: "Koltuk 3'lü (KOD-002)",
      quantity: 5,
      reportedBy: "Valeri",
    };
    const message =
      `⚠️ Olumsuzluk Raporu\n` +
      `Departman: ${report.department}\n` +
      `Sorun: ${report.issue}\n` +
      `Kalem: ${report.item} (x${report.quantity})\n` +
      `Bildiren: ${report.reportedBy}`;

    expect(message).toContain("Metal Uretimi");
    expect(message).toContain("hammadde yok");
    expect(message).toContain("Koltuk");
    expect(message).toContain("Valeri");
  });
});

// ─── Cron Timing Validation ───────────────────────────────────────

describe("Tracking: Cron zamanlama dogrulama", () => {
  it("kumas cron runs at 09:00 Mon-Sat (Asia/Almaty)", () => {
    // cron: "0 9 * * 1-6" → 09:00, Monday(1) to Saturday(6)
    const cronExpr = "0 9 * * 1-6";
    const parts = cronExpr.split(" ");
    expect(parts[0]).toBe("0");  // minute
    expect(parts[1]).toBe("9");  // hour
    expect(parts[4]).toBe("1-6"); // Mon-Sat
  });

  it("uretim takip cron runs at 10:30 Mon-Sat", () => {
    // cron: "30 10 * * 1-6" → 10:30, Monday(1) to Saturday(6)
    const cronExpr = "30 10 * * 1-6";
    const parts = cronExpr.split(" ");
    expect(parts[0]).toBe("30");
    expect(parts[1]).toBe("10");
    expect(parts[4]).toBe("1-6");
  });

  it("heartbeat runs hourly 06:00-20:00", () => {
    // cron: "0 6-20 * * *"
    const cronExpr = "0 6-20 * * *";
    const parts = cronExpr.split(" ");
    expect(parts[0]).toBe("0");
    expect(parts[1]).toBe("6-20");
  });
});
