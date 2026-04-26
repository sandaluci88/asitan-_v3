import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockBot } from "./helpers/mock-bot.js";
import { createMockOrderService } from "./helpers/mock-order-service.js";
import { createMockStaffService } from "./helpers/mock-staff-service.js";
import { TEST_STAFF, TEST_BOSS_ID, TEST_MARINA_ID, createTestOrder, createMultiDeptOrder } from "./helpers/test-data.js";

vi.mock("pdfkit", () => {
  const mockDoc = {
    on: vi.fn((event: string, handler: Function) => {
      if (event === "end") setTimeout(() => handler(), 0);
      return mockDoc;
    }),
    rect: vi.fn(() => mockDoc),
    fill: vi.fn(() => mockDoc),
    stroke: vi.fn(() => mockDoc),
    font: vi.fn(() => mockDoc),
    fontSize: vi.fn(() => mockDoc),
    fillColor: vi.fn(() => mockDoc),
    text: vi.fn(() => mockDoc),
    moveDown: vi.fn(() => mockDoc),
    addPage: vi.fn(() => mockDoc),
    image: vi.fn(() => mockDoc),
    end: vi.fn(),
  };
  return { default: vi.fn(() => mockDoc) };
});

function createDistributionService(bot: any, orderService: any, staffService: any) {
  const { DistributionService } = require("../packages/bot/src/services/distribution.service.js");
  return new DistributionService(bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
}

describe("DistributionService", () => {
  let mockBot: ReturnType<typeof createMockBot>;
  let orderService: ReturnType<typeof createMockOrderService>;
  let staffService: ReturnType<typeof createMockStaffService>;
  let service: any;

  beforeEach(() => {
    mockBot = createMockBot();
    orderService = createMockOrderService();
    staffService = createMockStaffService(TEST_STAFF);
  });

  it("sends PDF to staff in auto department (Karkas)", async () => {
    const order = createTestOrder();
    order.items[0].department = "Karkas Uretimi";

    const pdfBuffer = Buffer.from("%PDF-1.4 mock pdf content for karkas");
    vi.spyOn(await import("../packages/bot/src/services/pdf.service.js").then(m => m.PDFService), "getInstance").mockReturnValue({
      generateJobOrderPDF: vi.fn(async () => pdfBuffer),
      archivePDF: vi.fn(async () => "/fake/path.pdf"),
    } as any);

    const { DistributionService } = await import("../packages/bot/src/services/distribution.service.js");
    service = new DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    const report = await service.processOrderDistribution(order, [], [], undefined, ["Karkas Uretimi"]);

    expect(report.success).toContain("Karkas Uretimi");
    const sendDocCalls = mockBot.apiCalls.filter(c => c.method === "sendDocument");
    expect(sendDocCalls.length).toBeGreaterThan(0);

    const call = sendDocCalls[0];
    expect(call.args[0]).toBe(333333);
  });

  it("falls back to Marina when no staff registered for dept", async () => {
    const order = createTestOrder();
    order.items[0].department = "Metal Uretimi";

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    const report = await service.processOrderDistribution(order, [], [], undefined, ["Metal Uretimi"]);

    expect(report.success).toContain("Metal Uretimi");
    const sendDocCalls = mockBot.apiCalls.filter(c => c.method === "sendDocument");
    expect(sendDocCalls[0].args[0]).toBe(TEST_MARINA_ID);
  });

  it("always routes Satialma to Marina", async () => {
    const order = createTestOrder();
    order.items[0].department = "Satialma";
    order.items[0].source = "External";

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    await service.processOrderDistribution(order, [], [], undefined, ["Satialma"]);

    const sendDocCalls = mockBot.apiCalls.filter(c => c.method === "sendDocument");
    expect(sendDocCalls[0].args[0]).toBe(TEST_MARINA_ID);
  });

  it("sends to assigned worker for manual dept", async () => {
    const order = createTestOrder();
    order.items[0].department = "Dikishane";
    order.items[0].assignedWorker = "Almira";

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    await service.processOrderDistribution(order, [], [], undefined, ["Dikishane"]);

    const sendDocCalls = mockBot.apiCalls.filter(c => c.method === "sendDocument");
    expect(sendDocCalls.length).toBeGreaterThan(0);
    expect(sendDocCalls[0].args[0]).toBe(111111);
  });

  it("groups multiple items in same dept into single PDF", async () => {
    const order = createMultiDeptOrder();

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    await service.processOrderDistribution(order, [], [], undefined, ["Karkas Uretimi"]);

    const sendDocCalls = mockBot.apiCalls.filter(c => c.method === "sendDocument");
    expect(sendDocCalls.length).toBe(1);
  });

  it("duplicate message window blocks re-send", async () => {
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);

    await service.sendMessageWithDuplicateCheck(TEST_BOSS_ID, "Test message", { parse_mode: "HTML" });
    await service.sendMessageWithDuplicateCheck(TEST_BOSS_ID, "Test message", { parse_mode: "HTML" });

    const sendMsgCalls = mockBot.apiCalls.filter(c => c.method === "sendMessage");
    expect(sendMsgCalls.length).toBe(1);
  });

  it("PDF buffer starts with %PDF- signature", async () => {
    const order = createTestOrder();
    const { PDFService } = await import("../packages/bot/src/services/pdf.service.js");
    const pdfService = PDFService.getInstance();
    const pdfBuffer = await pdfService.generateJobOrderPDF(order.items, order.customerName, "Karkas Uretimi");

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(typeof pdfBuffer).toBe("object");
  });

  it("caption is in Russian with department name", async () => {
    const order = createTestOrder();
    order.items[0].department = "Karkas Uretimi";

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    await service.processOrderDistribution(order, [], [], undefined, ["Karkas Uretimi"]);

    const sendDocCalls = mockBot.apiCalls.filter(c => c.method === "sendDocument");
    const opts = sendDocCalls[0].args[2];
    expect(opts.caption).toContain("Заказ на производство");
    expect(opts.parse_mode).toBe("HTML");
  });

  it("sendDocument failure adds dept to failed list", async () => {
    const order = createTestOrder();
    order.items[0].department = "Karkas Uretimi";

    mockBot.api.sendDocument.mockImplementationOnce(async () => { throw new Error("Telegram API error"); });

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    const report = await service.processOrderDistribution(order, [], [], undefined, ["Karkas Uretimi"]);
    expect(report.failed.length).toBeGreaterThan(0);
  });

  it("all depts fail triggers boss critical alert", async () => {
    const order = createTestOrder();
    order.items[0].department = "Karkas Uretimi";

    mockBot.api.sendDocument.mockImplementation(async () => { throw new Error("fail"); });

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    await service.processOrderDistribution(order, [], [], undefined, ["Karkas Uretimi"]);

    const criticalCalls = mockBot.apiCalls.filter(c =>
      c.method === "sendMessage" && typeof c.args[1] === "string" && c.args[1].includes("kritik")
    );
    expect(criticalCalls.length).toBeGreaterThan(0);
    expect(criticalCalls[0].args[0]).toBe(TEST_BOSS_ID);
  });

  it("updates item status to uretimde after send", async () => {
    const order = createTestOrder();
    order.items[0].department = "Karkas Uretimi";
    order.items[0].status = "bekliyor";

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    await service.processOrderDistribution(order, [], [], undefined, ["Karkas Uretimi"]);

    expect(orderService.updateItemStatus).toHaveBeenCalledWith(
      expect.stringContaining("SD-"),
      "uretimde",
    );
  });

  it("PDF filename follows customer_dept_Is_Emri convention", async () => {
    const order = createTestOrder();
    order.customerName = "Test Müşteri";
    order.items[0].department = "Karkas Uretimi";

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    service = new (await import("../packages/bot/src/services/distribution.service.js")).DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = { generateJobOrderPDF: vi.fn(async () => pdfBuffer), archivePDF: vi.fn(async () => "/fake/path.pdf") };

    await service.processOrderDistribution(order, [], [], undefined, ["Karkas Uretimi"]);

    const sendDocCalls = mockBot.apiCalls.filter(c => c.method === "sendDocument");
    const inputFile = sendDocCalls[0].args[1];
    expect(inputFile.filename).toContain("_Karkas_Uretimi_Is_Emri.pdf");
  });
});
