/**
 * Test Suite 1: Zod Schema Validation
 * Tests all schema models for correct validation and type inference
 */

import { describe, it, expect } from "vitest";
import {
  OrderItemSchema,
  OrderDetailSchema,
  OrderItemStatusSchema,
  OrderItemSourceSchema,
  FabricDetailsSchema,
  PaintDetailsSchema,
  OrderDetailStatusSchema,
} from "../packages/core/src/models/order.schema.js";
import {
  StaffSchema,
  StaffRoleSchema,
} from "../packages/core/src/models/staff.schema.js";
import {
  WikiPageSchema,
  WikiPageTypeSchema,
  WikiChangelogSchema,
} from "../packages/core/src/models/wiki.schema.js";
import {
  PromptDecisionSchema,
  PromptVersionSchema,
  DecisionOutcomeSchema,
} from "../packages/core/src/models/decision.schema.js";

// ─── Order Schemas ─────────────────────────────────────────────

describe("OrderItemSchema", () => {
  const validItem = {
    id: "item-1",
    product: "Koltuk 3'lü",
    department: "Döşemehane",
    quantity: 2,
    details: "Krem kumaş, yüksek ayak",
    source: "Production",
    status: "bekliyor",
    createdAt: "2026-04-22T10:00:00+06:00",
    updatedAt: "2026-04-22T10:00:00+06:00",
  };

  it("accepts valid order item", () => {
    const result = OrderItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { id, ...noId } = validItem;
    const result = OrderItemSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = OrderItemSchema.safeParse({ ...validItem, quantity: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields", () => {
    const withOptional = {
      ...validItem,
      imageUrl: "https://example.com/img.jpg",
      assignedWorker: "Hasan",
      fabricDetails: { name: "Keten", amount: 5, arrived: false },
    };
    const result = OrderItemSchema.safeParse(withOptional);
    expect(result.success).toBe(true);
  });

  it("validates all status values", () => {
    const statuses = ["bekliyor", "uretimde", "boyada", "dikiste", "dosemede", "hazir", "sevk_edildi", "arsivlendi"];
    for (const status of statuses) {
      const result = OrderItemStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = OrderItemStatusSchema.safeParse("tamamlandı");
    expect(result.success).toBe(false);
  });

  it("validates all source values", () => {
    for (const source of ["Stock", "Production", "External"]) {
      const result = OrderItemSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    }
  });
});

describe("OrderDetailSchema", () => {
  const validOrder = {
    id: "order-1",
    orderNumber: "SIP-2026-001",
    customerName: "Ahmet Yılmaz",
    items: [{
      id: "item-1",
      product: "Koltuk",
      department: "Karkas Üretimi",
      quantity: 1,
      details: "",
      source: "Production",
      status: "bekliyor",
      createdAt: "2026-04-22T10:00:00+06:00",
      updatedAt: "2026-04-22T10:00:00+06:00",
    }],
    deliveryDate: "2026-05-01",
    status: "new",
    createdAt: "2026-04-22T10:00:00+06:00",
    updatedAt: "2026-04-22T10:00:00+06:00",
  };

  it("accepts valid order", () => {
    const result = OrderDetailSchema.safeParse(validOrder);
    expect(result.success).toBe(true);
  });

  it("validates all order statuses", () => {
    for (const status of ["new", "processing", "completed", "archived"]) {
      const result = OrderDetailStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });
});

describe("FabricDetailsSchema", () => {
  it("accepts valid fabric details", () => {
    const result = FabricDetailsSchema.safeParse({ name: "Keten", amount: 5, arrived: true });
    expect(result.success).toBe(true);
  });

  it("rejects negative amount", () => {
    const result = FabricDetailsSchema.safeParse({ name: "Keten", amount: -1, arrived: false });
    expect(result.success).toBe(false);
  });
});

// ─── Staff Schemas ─────────────────────────────────────────────

describe("StaffSchema", () => {
  it("accepts valid staff", () => {
    const result = StaffSchema.safeParse({
      telegramId: "1030595483",
      name: "Bekbergen",
      department: "Karkas Üretimi",
      role: "staff",
    });
    expect(result.success).toBe(true);
  });

  it("validates all roles", () => {
    for (const role of ["boss", "coordinator", "staff", "guest"]) {
      const result = StaffRoleSchema.safeParse(role);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid role", () => {
    const result = StaffRoleSchema.safeParse("admin");
    expect(result.success).toBe(false);
  });
});

// ─── Wiki Schemas ──────────────────────────────────────────────

describe("WikiPageSchema", () => {
  it("accepts valid wiki page", () => {
    const result = WikiPageSchema.safeParse({
      slug: "departments/karkas",
      title: "Karkas Üretimi",
      content: "## Özet\nKarkas üretim departmanı",
      pageType: "department",
      tags: ["karkas", "üretim"],
    });
    expect(result.success).toBe(true);
  });

  it("validates all page types", () => {
    for (const type of ["department", "order", "person", "procedure", "product", "concept", "synthesis"]) {
      const result = WikiPageTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid page type", () => {
    const result = WikiPageTypeSchema.safeParse("blog");
    expect(result.success).toBe(false);
  });
});

describe("WikiChangelogSchema", () => {
  it("accepts valid changelog entry", () => {
    const result = WikiChangelogSchema.safeParse({
      pageSlug: "departments/karkas",
      changeType: "updated",
      triggeredBy: "interaction",
    });
    expect(result.success).toBe(true);
  });
});

// ─── Decision Schemas ──────────────────────────────────────────

describe("PromptDecisionSchema", () => {
  it("accepts valid decision", () => {
    const result = PromptDecisionSchema.safeParse({
      promptVersion: "3.0.0",
      inputHash: "abc123",
      output: "Sipariş durumu: 3 aktif",
    });
    expect(result.success).toBe(true);
  });

  it("validates confidence range", () => {
    const low = PromptDecisionSchema.safeParse({
      promptVersion: "3.0.0",
      inputHash: "abc",
      output: "test",
      confidence: 0.0,
    });
    const high = PromptDecisionSchema.safeParse({
      promptVersion: "3.0.0",
      inputHash: "abc",
      output: "test",
      confidence: 1.0,
    });
    const over = PromptDecisionSchema.safeParse({
      promptVersion: "3.0.0",
      inputHash: "abc",
      output: "test",
      confidence: 1.5,
    });
    expect(low.success).toBe(true);
    expect(high.success).toBe(true);
    expect(over.success).toBe(false);
  });
});

describe("PromptVersionSchema", () => {
  it("accepts valid version", () => {
    const result = PromptVersionSchema.safeParse({
      version: "3.0.0",
      content: "System prompt content",
    });
    expect(result.success).toBe(true);
  });
});
