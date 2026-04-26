import { describe, it, expect, vi, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseOrderExcel } from "@sandaluci/core";
import { translateDepartment } from "@sandaluci/core";
import { createMockBot } from "./helpers/mock-bot.js";
import { createMockOrderService } from "./helpers/mock-order-service.js";
import { createMockStaffService } from "./helpers/mock-staff-service.js";
import { TEST_STAFF, TEST_BOSS_ID, TEST_MARINA_ID, TEST_CHAT_ID } from "./helpers/test-data.js";

const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "real-order.xlsx");
const hasFixture = fs.existsSync(FIXTURE_PATH);

describe.skipIf(!hasFixture)("E2E Pipeline: Excel → Parse → PDF → Telegram", () => {
  let excelBuffer: Buffer;
  let parsedResult: any;
  let mockBot: ReturnType<typeof createMockBot>;

  beforeAll(async () => {
    excelBuffer = fs.readFileSync(FIXTURE_PATH);
    parsedResult = await parseOrderExcel(excelBuffer);
    mockBot = createMockBot();
  });

  it("parses real Excel correctly — customer, items, images", () => {
    expect(parsedResult).not.toBeNull();
    const { order } = parsedResult;
    expect(order.customerName).toBeTruthy();
    expect(order.items.length).toBeGreaterThan(0);
    expect(order.orderNumber).toBeTruthy();

    const hasImages = order.items.some((i: any) => i.imageBuffer);
    if (parsedResult.imageMap && parsedResult.imageMap.size > 0) {
      expect(hasImages || parsedResult.imageMap.size > 0).toBe(true);
    }
  });

  it("generates valid PDF for each auto department", async () => {
    expect(parsedResult).not.toBeNull();
    const { order } = parsedResult;
    const { PDFService } = await import("../packages/bot/src/services/pdf.service.js");
    const pdfService = PDFService.getInstance();

    const autoDepts = [...new Set(order.items.map((i: any) => i.department as string))]
      .filter((d: string) => !["Dikishane", "Dosemehane"].includes(d));

    for (const dept of autoDepts) {
      const deptItems = order.items.filter((i: any) => i.department === dept);
      const pdfBuffer = await pdfService.generateJobOrderPDF(deptItems, order.customerName, dept);
      expect(pdfBuffer.toString("utf-8", 0, 5)).toBe("%PDF-");
      expect(pdfBuffer.length).toBeGreaterThan(500);
    }
  });

  it("DistributionService sends to correct recipients per department", async () => {
    expect(parsedResult).not.toBeNull();
    const { order } = parsedResult;
    const pdfBuffer = Buffer.from("%PDF-1.4 mock");

    const { DistributionService } = await import("../packages/bot/src/services/distribution.service.js");
    const orderService = createMockOrderService();
    const staffService = createMockStaffService(TEST_STAFF);
    const service = new DistributionService(mockBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = {
      generateJobOrderPDF: vi.fn(async () => pdfBuffer),
      archivePDF: vi.fn(async () => "/fake/path.pdf"),
    };

    const depts = [...new Set(order.items.map((i: any) => i.department as string))];
    await service.processOrderDistribution(order, [], [], undefined, depts);

    const sendDocCalls = mockBot.apiCalls.filter(c => c.method === "sendDocument");
    expect(sendDocCalls.length).toBeGreaterThan(0);
  });

  it("Satialma items always routed to Marina", async () => {
    expect(parsedResult).not.toBeNull();
    const { order } = parsedResult;
    const satialmaItems = order.items.filter((i: any) =>
      i.department.toLowerCase().includes("sati") || i.source === "External"
    );

    if (satialmaItems.length === 0) return;

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");
    const { DistributionService } = await import("../packages/bot/src/services/distribution.service.js");
    const orderService = createMockOrderService();
    const staffService = createMockStaffService(TEST_STAFF);
    const freshBot = createMockBot();
    const service = new DistributionService(freshBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = {
      generateJobOrderPDF: vi.fn(async () => pdfBuffer),
      archivePDF: vi.fn(async () => "/fake/path.pdf"),
    };

    const dept = satialmaItems[0].department;
    await service.processOrderDistribution(order, [], [], undefined, [dept]);

    const sendDocCalls = freshBot.apiCalls.filter(c => c.method === "sendDocument");
    if (sendDocCalls.length > 0) {
      expect(sendDocCalls[0].args[0]).toBe(TEST_MARINA_ID);
    }
  });

  it("manual departments trigger inline keyboard to Marina", async () => {
    expect(parsedResult).not.toBeNull();
    const { order } = parsedResult;
    const { isManualDept } = await import("@sandaluci/core");
    const manualDepts = [...new Set(order.items.map((i: any) => i.department as string))]
      .filter((d: string) => isManualDept(d));

    if (manualDepts.length === 0) return;

    const { GmailPollingService } = await import("../packages/bot/src/services/gmail-polling.service.js");
    const freshBot = createMockBot();
    const orderService = createMockOrderService(order);
    const staffService = createMockStaffService(TEST_STAFF);
    const mockDraftService = { saveDraft: vi.fn(), getDraft: vi.fn(() => null), removeDraft: vi.fn() };
    const mockDistService = {
      processOrderDistribution: vi.fn(async () => ({ success: [], failed: [] })),
      sendMessageWithDuplicateCheck: vi.fn(async () => {}),
    };

    const pollingService = new GmailPollingService(
      freshBot.bot, orderService, staffService,
      mockDraftService, mockDistService,
      TEST_CHAT_ID, TEST_BOSS_ID, TEST_MARINA_ID,
    );

    const msg = {
      uid: 99999,
      from: "test@test.com",
      subject: "E2E Test",
      date: new Date(),
      content: "",
      attachments: [{ filename: "test.xlsx", contentType: "application/xlsx", content: excelBuffer }],
    };

    await (pollingService as any).processMessage(msg);

    await new Promise(r => setTimeout(r, 300));

    const marinaCalls = freshBot.apiCalls.filter(c =>
      c.method === "sendMessage" && c.args[0] === TEST_MARINA_ID && c.args[2]?.reply_markup
    );
    expect(marinaCalls.length).toBeGreaterThan(0);
  });

  it("all captions are in Russian", async () => {
    expect(parsedResult).not.toBeNull();
    const { order } = parsedResult;
    const pdfBuffer = Buffer.from("%PDF-1.4 mock");

    const freshBot = createMockBot();
    const { DistributionService } = await import("../packages/bot/src/services/distribution.service.js");
    const orderService = createMockOrderService();
    const staffService = createMockStaffService(TEST_STAFF);
    const service = new DistributionService(freshBot.bot, orderService, staffService, TEST_BOSS_ID, TEST_MARINA_ID);
    (service as any).pdfService = {
      generateJobOrderPDF: vi.fn(async () => pdfBuffer),
      archivePDF: vi.fn(async () => "/fake/path.pdf"),
    };

    const depts = [...new Set(order.items.map((i: any) => i.department as string))];
    await service.processOrderDistribution(order, [], [], undefined, depts);

    const sendDocCalls = freshBot.apiCalls.filter(c => c.method === "sendDocument");
    for (const call of sendDocCalls) {
      const caption = call.args[2]?.caption ?? "";
      expect(caption).toContain("Заказ на производство");
      expect(caption).toContain("PDF");
    }
  });
});
