import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import {
  createMockSupabaseService,
  createMockOrderRepository,
  waitFor,
} from "./mocks";

const mockSupabaseData = {
  instance: null as any,
  getAllStaff: vi.fn().mockResolvedValue([]),
  upsertStaff: vi.fn().mockResolvedValue({}),
  deleteStaff: vi.fn().mockResolvedValue({}),
};

const mockRepositoryData = {
  instance: null as any,
  getAll: vi.fn().mockReturnValue([]),
  findById: vi.fn().mockReturnValue(null),
  save: vi.fn().mockResolvedValue({}),
  updateOrderItem: vi.fn().mockResolvedValue(true),
  updateFabricStatus: vi.fn().mockResolvedValue(true),
  loadOrders: vi.fn().mockResolvedValue(undefined),
  getOrderItemById: vi.fn().mockReturnValue(null),
  getActiveTrackingItems: vi.fn().mockReturnValue([]),
  getItemsNeedingFollowUp: vi.fn().mockReturnValue([]),
  archiveOrder: vi.fn().mockResolvedValue(true),
  appendLog: vi.fn().mockResolvedValue(undefined),
  updateLastReminder: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../src/utils/supabase.service", () => ({
  SupabaseService: {
    getInstance: () => ({
      ...createMockSupabaseService(),
      ...mockSupabaseData,
    }),
  },
}));

vi.mock("../src/repositories/order.repository", () => ({
  OrderRepository: {
    getInstance: () => ({
      ...createMockOrderRepository(),
      ...mockRepositoryData,
    }),
  },
}));

vi.mock("../src/services/pdf.service", () => ({
  PDFService: {
    getInstance: () => ({
      generateMarinaSummaryPDF: vi.fn().mockResolvedValue(Buffer.from("")),
      generateFabricOrderPDF: vi.fn().mockResolvedValue(Buffer.from("")),
      generateJobOrderPDF: vi.fn().mockResolvedValue(Buffer.from("test PDF")),
      generatePDFView: vi.fn().mockResolvedValue(Buffer.from("")),
      archivePDF: vi.fn().mockResolvedValue(""),
    }),
  },
}));

vi.mock("../src/utils/llm.service", () => {
  const MockLLMService = function () {
    return {
      chat: vi.fn().mockResolvedValue(""),
      chatWithImage: vi.fn().mockResolvedValue(""),
    };
  };
  return { OpenRouterService: MockLLMService };
});

vi.mock("../src/utils/image-embedding.service", () => {
  const MockImageEmbeddingService = function () {
    return {
      generateImageEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };
  };
  return { ImageEmbeddingService: MockImageEmbeddingService };
});

describe("OrderService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("parseAndCreateOrder", () => {
    it("should return null for system mails without Excel attachments", async () => {
      const { OrderService } = await import("../src/utils/order.service");
      const orderService = OrderService.getInstance();

      const result = await orderService.parseAndCreateOrder(
        "Security Alert from Netlify",
        "Your deployment is ready",
        "test-uid",
      );

      expect(result).toBeNull();
    });

    it("should return null for welcome/billing mails", async () => {
      const { OrderService } = await import("../src/utils/order.service");
      const orderService = OrderService.getInstance();

      const result = await orderService.parseAndCreateOrder(
        "Welcome to our service",
        "Subscription billing information",
        "test-uid",
      );

      expect(result).toBeNull();
    });
  });

  describe("generateVisualTable", () => {
    it("should generate visual table with correct formatting", async () => {
      const { OrderService } = await import("../src/utils/order.service");
      const orderService = OrderService.getInstance();

      const mockOrder = {
        id: "1",
        orderNumber: "ORD-001",
        customerName: "Test Customer",
        deliveryDate: "2026-04-15",
        items: [
          {
            id: "item-1",
            product: "Test Sandalye",
            department: "Karkas Üretimi",
            quantity: 5,
            details: "Test details",
            status: "bekliyor" as const,
            source: "Production" as const,
            rowIndex: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        status: "new" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const table = orderService.generateVisualTable(mockOrder, "ru");

      expect(table).toContain("ORD-001");
      expect(table).toContain("Test Customer");
      expect(table).toContain("Test Sandalye");
      expect(table).toContain("2026-04-15");
    });

    it("should escape HTML special characters in customer name", async () => {
      const { OrderService } = await import("../src/utils/order.service");
      const orderService = OrderService.getInstance();

      const mockOrder = {
        id: "1",
        orderNumber: "ORD-002",
        customerName: "Customer <script>alert('xss')</script>",
        deliveryDate: "2026-04-15",
        items: [] as any[],
        status: "new" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const table = orderService.generateVisualTable(mockOrder, "ru");

      expect(table).toContain("&lt;script&gt;");
      expect(table).not.toContain("<script>");
    });
  });

  describe("generateJobOrderPDF", () => {
    it("should delegate PDF generation to PDFService", async () => {
      const { OrderService } = await import("../src/utils/order.service");
      const orderService = OrderService.getInstance();

      const items = [
        {
          id: "item-1",
          product: "Test Product",
          department: "Karkas Üretimi",
          quantity: 5,
          details: "Test details",
          status: "bekliyor" as const,
          source: "Production" as const,
          rowIndex: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = await orderService.generateJobOrderPDF(
        items,
        "Test Customer",
        "Karkas Üretimi",
      );

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe("updateItemStatus", () => {
    it("should be callable without error", async () => {
      const { OrderService } = await import("../src/utils/order.service");
      const orderService = OrderService.getInstance();

      await orderService.updateItemStatus("item-123", "uretimde");
    });
  });

  describe("getDeptTranslation", () => {
    it("should return translation for department", async () => {
      const { OrderService } = await import("../src/utils/order.service");
      const orderService = OrderService.getInstance();

      const translation = orderService.getDeptTranslation(
        "Karkas Üretimi",
        "ru",
      );

      expect(translation).toBeTruthy();
      expect(typeof translation).toBe("string");
    });

    it("should use default language (ru) when not specified", async () => {
      const { OrderService } = await import("../src/utils/order.service");
      const orderService = OrderService.getInstance();

      const translation = orderService.getDeptTranslation("Dikişhane");

      expect(translation).toBeTruthy();
    });
  });

  describe("escapeHTML", () => {
    it("should escape HTML special characters", async () => {
      const { OrderService } = await import("../src/utils/order.service");

      const result = OrderService.escapeHTML("<test>&\"'");

      expect(result).toBe("&lt;test&gt;&amp;\"'");
    });

    it("should return empty string for empty input", async () => {
      const { OrderService } = await import("../src/utils/order.service");

      expect(OrderService.escapeHTML("")).toBe("");
    });
  });

  describe("escapeMarkdown", () => {
    it("should escape markdown special characters", async () => {
      const { OrderService } = await import("../src/utils/order.service");

      const result = OrderService.escapeMarkdown("*test*_text_[code]`");

      expect(result).toBe("\\*test\\*\\_text\\_\\[code]\\`");
    });
  });
});
