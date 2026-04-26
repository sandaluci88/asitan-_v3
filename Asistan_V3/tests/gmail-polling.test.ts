import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockBot } from "./helpers/mock-bot.js";
import { createMockOrderService } from "./helpers/mock-order-service.js";
import { createMockStaffService } from "./helpers/mock-staff-service.js";
import type { MockGmailMessage } from "./helpers/mock-gmail.js";
import { TEST_STAFF, TEST_BOSS_ID, TEST_MARINA_ID, TEST_CHAT_ID, createTestOrder, createMultiDeptOrder } from "./helpers/test-data.js";

function createMockDraftService() {
  return {
    saveDraft: vi.fn(),
    getDraft: vi.fn(() => null),
    removeDraft: vi.fn(),
  };
}

function createMockDistributionService() {
  return {
    processOrderDistribution: vi.fn(async () => ({ success: [], failed: [] })),
    sendMessageWithDuplicateCheck: vi.fn(async () => {}),
  };
}

async function createPollingService(
  mockBot: ReturnType<typeof createMockBot>,
  orderService: any,
  overrides: { distributionService?: any; draftService?: any; staffService?: any } = {},
) {
  const { GmailPollingService } = await import("../packages/bot/src/services/gmail-polling.service.js");
  const staffService = overrides.staffService ?? createMockStaffService(TEST_STAFF);
  const distService = overrides.distributionService ?? createMockDistributionService();
  const draftService = overrides.draftService ?? createMockDraftService();
  const service = new GmailPollingService(
    mockBot.bot, orderService, staffService,
    draftService, distService,
    TEST_CHAT_ID, TEST_BOSS_ID, TEST_MARINA_ID,
  );
  return { service, distService, draftService, staffService };
}

function createExcelMessage(uid = 10001): MockGmailMessage {
  return {
    uid,
    from: "customer@example.com",
    subject: "Test Siparis",
    date: new Date("2026-04-23"),
    content: "Siparis icerigi",
    attachments: [
      {
        filename: "siparis.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content: Buffer.from("fake excel content"),
      },
    ],
  };
}

function createTextMessage(uid = 10002): MockGmailMessage {
  return {
    uid,
    from: "customer@example.com",
    subject: "Siparis Hakkinda",
    date: new Date("2026-04-23"),
    content: "Merhaba, siparis vermek istiyorum. 5 adet masa.",
    attachments: [],
  };
}

describe("GmailPollingService", () => {
  let mockBot: ReturnType<typeof createMockBot>;
  let orderService: ReturnType<typeof createMockOrderService>;

  beforeEach(() => {
    mockBot = createMockBot();
    vi.resetModules();
  });

  it("processes .xlsx attachment and calls parseAndCreateOrder", async () => {
    const order = createMultiDeptOrder();
    orderService = createMockOrderService(order);

    vi.doMock("@sandaluci/core", () => ({
      XlsxUtils: { parseExcel: vi.fn(async () => [{ Col1: "test", _rowNumber: 1 }]) },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      translateDepartment: vi.fn((d: string) => d),
      MANUAL_DEPARTMENTS: ["Dikishane", "Dosemehane"],
      isManualDept: vi.fn((d: string) => ["Dikishane", "Dosemehane"].includes(d)),
      getDeptButtonLabel: vi.fn((d: string) => d),
    }));

    const { service, distService } = await createPollingService(mockBot, orderService);
    const msg = createExcelMessage();
    await (service as any).processMessage(msg);

    expect(orderService.parseAndCreateOrder).toHaveBeenCalled();
  });

  it("skips duplicate UID", async () => {
    const order = createTestOrder();
    orderService = createMockOrderService(order);

    const { service } = await createPollingService(mockBot, orderService);
    const msg = createExcelMessage(10050);
    await (service as any).processMessage(msg);
    await (service as any).processMessage(msg);

    expect(orderService.parseAndCreateOrder).toHaveBeenCalledTimes(1);
  });

  it("falls to text analysis when no attachments", async () => {
    const order = createTestOrder();
    orderService = createMockOrderService(order);

    const { service } = await createPollingService(mockBot, orderService);
    const msg = createTextMessage();
    await (service as any).processMessage(msg);

    expect(orderService.parseAndCreateOrder).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Merhaba"),
      "10002",
      [],
    );
  });

  it("sends email summary notification to Telegram", async () => {
    orderService = createMockOrderService(null);

    const { service, distService } = await createPollingService(mockBot, orderService);
    const msg = createExcelMessage();
    await (service as any).processMessage(msg);

    expect(distService.sendMessageWithDuplicateCheck).toHaveBeenCalledWith(
      parseInt(TEST_CHAT_ID),
      expect.stringContaining("Yeni E-posta"),
      { parse_mode: "HTML" },
    );
  });

  it("auto-distributes when only auto departments exist", async () => {
    const order = createTestOrder();
    order.items[0].department = "Karkas Uretimi";
    orderService = createMockOrderService(order);

    const mockXlsxUtils = { parseExcel: vi.fn(async () => [{ Col1: "test" }]) };
    vi.doMock("@sandaluci/core", () => ({
      XlsxUtils: mockXlsxUtils,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      translateDepartment: vi.fn((d: string) => d),
      MANUAL_DEPARTMENTS: ["Dikishane", "Dosemehane"],
      isManualDept: vi.fn((d: string) => ["Dikishane", "Dosemehane"].includes(d)),
      getDeptButtonLabel: vi.fn((d: string) => d),
    }));

    const distService = createMockDistributionService();
    const { service } = await createPollingService(mockBot, orderService, { distributionService: distService });
    const msg = createExcelMessage();
    await (service as any).processMessage(msg);

    expect(distService.processOrderDistribution).toHaveBeenCalled();
  });

  it("sends inline keyboard to Marina for manual departments", async () => {
    const order = createMultiDeptOrder();
    orderService = createMockOrderService(order);

    const mockXlsxUtils = { parseExcel: vi.fn(async () => [{ Col1: "test" }]) };
    vi.doMock("@sandaluci/core", () => ({
      XlsxUtils: mockXlsxUtils,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      translateDepartment: vi.fn((d: string) => d),
      MANUAL_DEPARTMENTS: ["Dikishane", "Dosemehane"],
      isManualDept: vi.fn((d: string) => ["Dikishane", "Dosemehane"].includes(d)),
      getDeptButtonLabel: vi.fn((d: string) => d),
    }));

    const { service } = await createPollingService(mockBot, orderService);
    const msg = createExcelMessage();
    await (service as any).processMessage(msg);

    await new Promise(r => setTimeout(r, 200));

    const marinaCalls = mockBot.apiCalls.filter(c =>
      c.method === "sendMessage" && c.args[0] === TEST_MARINA_ID
    );
    expect(marinaCalls.length).toBeGreaterThan(0);
    const opts = marinaCalls[0].args[2];
    expect(opts?.reply_markup).toBeDefined();
  });

  it("skips distribution when parseAndCreateOrder returns null", async () => {
    orderService = createMockOrderService(null);

    const mockXlsxUtils = { parseExcel: vi.fn(async () => [{ Col1: "test" }]) };
    vi.doMock("@sandaluci/core", () => ({
      XlsxUtils: mockXlsxUtils,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      translateDepartment: vi.fn((d: string) => d),
      MANUAL_DEPARTMENTS: ["Dikishane", "Dosemehane"],
      isManualDept: vi.fn((d: string) => ["Dikishane", "Dosemehane"].includes(d)),
      getDeptButtonLabel: vi.fn((d: string) => d),
    }));

    const distService = createMockDistributionService();
    const { service } = await createPollingService(mockBot, orderService, { distributionService: distService });
    const msg = createExcelMessage();
    await (service as any).processMessage(msg);

    expect(distService.processOrderDistribution).not.toHaveBeenCalled();
  });

  it("skips duplicate order (isDuplicate=true)", async () => {
    const order = { ...createTestOrder(), isDuplicate: true };
    orderService = createMockOrderService(order);

    const mockXlsxUtils = { parseExcel: vi.fn(async () => [{ Col1: "test" }]) };
    vi.doMock("@sandaluci/core", () => ({
      XlsxUtils: mockXlsxUtils,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      translateDepartment: vi.fn((d: string) => d),
      MANUAL_DEPARTMENTS: ["Dikishane", "Dosemehane"],
      isManualDept: vi.fn((d: string) => ["Dikishane", "Dosemehane"].includes(d)),
      getDeptButtonLabel: vi.fn((d: string) => d),
    }));

    const distService = createMockDistributionService();
    const { service } = await createPollingService(mockBot, orderService, { distributionService: distService });
    const msg = createExcelMessage();
    await (service as any).processMessage(msg);

    expect(distService.processOrderDistribution).not.toHaveBeenCalled();
  });

  it("marks UID as processed for dedup", async () => {
    orderService = createMockOrderService(null);

    const { service } = await createPollingService(mockBot, orderService);
    const msg = createExcelMessage(10099);
    await (service as any).processMessage(msg);

    expect((service as any).processedUids.has("10099")).toBe(true);
  });

  it("resets isProcessingEmail flag after processing", async () => {
    orderService = createMockOrderService(null);

    const { service } = await createPollingService(mockBot, orderService);
    (service as any).isProcessingEmail = true;

    const msg = createExcelMessage();
    await (service as any).processMessage(msg);

    expect((service as any).isProcessingEmail).toBe(true);
  });
});
