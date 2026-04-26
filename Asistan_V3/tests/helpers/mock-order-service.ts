import { vi } from "vitest";

export function createMockOrderService(order?: any) {
  return {
    parseAndCreateOrder: vi.fn(async () => order ?? null),
    archiveOrderFile: vi.fn(async () => "/fake/archive/path.xlsx"),
    generateVisualTable: vi.fn(() => "<b>Mock Visual Table</b>"),
    updateItemStatus: vi.fn(async () => {}),
    getOrderItemById: vi.fn(() => null),
    updateLastReminder: vi.fn(async () => {}),
    createSubOrderForStaff: vi.fn((o: any, name: string, qty: number, dept: string) => ({
      ...o,
      items: o.items.filter((i: any) => i.department === dept).slice(0, qty).map((i: any) => ({
        ...i,
        assignedWorker: name,
        quantity: 1,
      })),
    })),
  };
}
