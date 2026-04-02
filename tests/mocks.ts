import { vi } from "vitest";

export const createMockSupabaseService = () => ({
  getAllStaff: vi.fn().mockResolvedValue([]),
  upsertStaff: vi.fn().mockResolvedValue({}),
  deleteStaff: vi.fn().mockResolvedValue({}),
  upsertOrder: vi.fn().mockResolvedValue({}),
  upsertOrderItem: vi.fn().mockResolvedValue({}),
  upsertVisualMemory: vi.fn().mockResolvedValue({}),
  getOrders: vi.fn().mockResolvedValue([]),
});

export const createMockLLMService = () => ({
  chat: vi.fn().mockResolvedValue(""),
  chatWithImage: vi.fn().mockResolvedValue(""),
});

export const createMockPDFService = () => ({
  generateMarinaSummaryPDF: vi.fn().mockResolvedValue(Buffer.from("")),
  generateFabricOrderPDF: vi.fn().mockResolvedValue(Buffer.from("")),
  generateJobOrderPDF: vi.fn().mockResolvedValue(Buffer.from("")),
  generatePDFView: vi.fn().mockResolvedValue(Buffer.from("")),
  archivePDF: vi.fn().mockResolvedValue(""),
});

export const createMockOrderRepository = () => ({
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
});

export const createMockImageEmbeddingService = () => ({
  generateImageEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
});

export const waitFor = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
