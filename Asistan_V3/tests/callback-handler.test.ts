import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockOrderService } from "./helpers/mock-order-service.js";
import { createMockStaffService } from "./helpers/mock-staff-service.js";
import { createMockContext } from "./helpers/mock-context.js";
import { TEST_STAFF, TEST_MARINA_ID, createTestOrder, createMultiDeptOrder } from "./helpers/test-data.js";

function createMockBot() {
  const callbackQueryCalls: any[][] = [];
  const onCalls: any[][] = [];

  const bot = {
    api: {
      sendMessage: vi.fn(async () => ({ message_id: 1 })),
      sendDocument: vi.fn(async () => ({ message_id: 1 })),
      sendPhoto: vi.fn(async () => ({ message_id: 1 })),
    },
    callbackQuery: vi.fn((pattern: any, handler: any) => {
      callbackQueryCalls.push([pattern, handler]);
    }),
    on: vi.fn((event: any, handler: any) => {
      onCalls.push([event, handler]);
    }),
    catch: vi.fn(),
    start: vi.fn(),
    command: vi.fn(),
    _callbackQueryCalls: callbackQueryCalls,
    _onCalls: onCalls,
  } as any;

  return bot;
}

function createMockDraftService() {
  return {
    saveDraft: vi.fn(),
    getDraft: vi.fn(() => null),
    removeDraft: vi.fn(),
  };
}

function createMockDistributionService() {
  return {
    processOrderDistribution: vi.fn(async () => ({ success: ["Dikishane"], failed: [] })),
    sendMessageWithDuplicateCheck: vi.fn(async () => {}),
  };
}

function createMockMessageHandler() {
  return { handleCallback: vi.fn(async () => {}) };
}

function getHandlerForPattern(calls: any[][], patternSource: string): Function {
  for (const call of calls) {
    const regex = call[0];
    if (regex instanceof RegExp && regex.source === patternSource) return call[1];
  }
  throw new Error(`No handler found for pattern: ${patternSource}. Available: ${calls.map(c => c[0]?.source || c[0]).join(", ")}`);
}

describe("CallbackHandler", () => {
  let mockBot: ReturnType<typeof createMockBot>;
  let orderService: ReturnType<typeof createMockOrderService>;
  let staffService: ReturnType<typeof createMockStaffService>;
  let draftService: ReturnType<typeof createMockDraftService>;
  let distService: ReturnType<typeof createMockDistributionService>;
  let messageHandler: ReturnType<typeof createMockMessageHandler>;
  let handler: any;

  beforeEach(async () => {
    mockBot = createMockBot();
    orderService = createMockOrderService();
    staffService = createMockStaffService(TEST_STAFF);
    draftService = createMockDraftService();
    distService = createMockDistributionService();
    messageHandler = createMockMessageHandler();

    // Dynamically import to get fresh class, pass mock objects directly
    // CallbackHandler constructor takes (bot, orderService, staffService, draftOrderService, distributionService, messageHandler)
    // orderService is typed as OrderService but used as any internally
    const { CallbackHandler } = await import("../packages/bot/src/handlers/callback.handler.js");
    handler = new CallbackHandler(
      mockBot,
      orderService as any,
      staffService as any,
      draftService as any,
      distService as any,
      messageHandler as any,
    );
    handler.register();
  });

  describe("select_dept_staff", () => {
    it("shows staff list keyboard for department", async () => {
      const calls = mockBot._callbackQueryCalls;
      const selectHandler = getHandlerForPattern(calls, "^select_dept_staff:(.+)\\|(.+)$");

      const ctx = createMockContext({
        match: ["select_dept_staff:draft_test123|Dikishane", "draft_test123", "Dikishane"],
      });

      await selectHandler(ctx);

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Швейный цех"),
        expect.objectContaining({
          parse_mode: "HTML",
          reply_markup: expect.any(Object),
        }),
      );
    });

    it("warns when no staff registered for dept", async () => {
      const calls = mockBot._callbackQueryCalls;
      const selectHandler = getHandlerForPattern(calls, "^select_dept_staff:(.+)\\|(.+)$");

      const ctx = createMockContext({
        match: ["select_dept_staff:draft_test123|UnknownDept", "draft_test123", "UnknownDept"],
      });

      await selectHandler(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining("нет зарегистрированных сотрудников"),
      );
    });
  });

  describe("aw (assign worker)", () => {
    it("assigns worker and calls processOrderDistribution", async () => {
      const order = createMultiDeptOrder();
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });
      orderService.generateVisualTable.mockReturnValue("<b>Table</b>");

      const calls = mockBot._callbackQueryCalls;
      const awHandler = getHandlerForPattern(calls, "^aw:(.+):(.+):(.+)$");

      const ctx = createMockContext({
        match: ["aw:draft_test123:Dikishane:Almira", "draft_test123", "Dikishane", "Almira"],
      });

      await awHandler(ctx);

      const dikishaneItems = order.items.filter((i: any) => i.department === "Dikishane");
      expect(dikishaneItems.every((i: any) => i.assignedWorker === "Almira")).toBe(true);
      expect(distService.processOrderDistribution).toHaveBeenCalledWith(
        order, [], [], undefined, ["Dikishane"], false,
      );
    });

    it("returns error for non-existent draft", async () => {
      const calls = mockBot._callbackQueryCalls;
      const awHandler = getHandlerForPattern(calls, "^aw:(.+):(.+):(.+)$");

      const ctx = createMockContext({
        match: ["aw:nonexistent:Dikishane:Almira", "nonexistent", "Dikishane", "Almira"],
      });

      await awHandler(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.stringContaining("Черновик не найден"));
    });
  });

  describe("finalize_dist", () => {
    it("distributes all departments and removes draft", async () => {
      const order = createMultiDeptOrder();
      order.items.forEach((i: any) => {
        if (["Dikishane", "Dosemehane"].includes(i.department)) {
          i.assignedWorker = "Almira";
        }
      });
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });
      orderService.generateVisualTable.mockReturnValue("<b>Table</b>");

      const calls = mockBot._callbackQueryCalls;
      const finalizeHandler = getHandlerForPattern(calls, "^finalize_dist:(.+)$");

      const ctx = createMockContext({
        match: ["finalize_dist:draft_test123", "draft_test123"],
      });

      await finalizeHandler(ctx);

      expect(distService.processOrderDistribution).toHaveBeenCalled();
      expect(draftService.removeDraft).toHaveBeenCalledWith("draft_test123");
    });

    it("blocks finalize with unassigned manual departments", async () => {
      const order = createMultiDeptOrder();
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      const calls = mockBot._callbackQueryCalls;
      const finalizeHandler = getHandlerForPattern(calls, "^finalize_dist:(.+)$");

      const ctx = createMockContext({
        match: ["finalize_dist:draft_test123", "draft_test123"],
      });

      await finalizeHandler(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining("Сначала назначьте"),
      );
      expect(distService.processOrderDistribution).not.toHaveBeenCalled();
    });
  });

  describe("reject_order", () => {
    it("removes draft and shows cancellation", async () => {
      const calls = mockBot._callbackQueryCalls;
      const rejectHandler = getHandlerForPattern(calls, "^reject_order:(.+)$");

      const ctx = createMockContext({
        match: ["reject_order:draft_test123", "draft_test123"],
      });

      await rejectHandler(ctx);

      expect(ctx.editMessageText).toHaveBeenCalledWith(expect.stringContaining("отменён"));
    });
  });

  describe("auto_distribute", () => {
    it("distributes all auto departments when no manual depts", async () => {
      const order = createTestOrder();
      order.items[0].department = "Karkas Uretimi";
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      const calls = mockBot._callbackQueryCalls;
      const autoHandler = getHandlerForPattern(calls, "^auto_distribute:(.+)$");

      const ctx = createMockContext({
        match: ["auto_distribute:draft_test123", "draft_test123"],
      });

      await autoHandler(ctx);

      expect(distService.processOrderDistribution).toHaveBeenCalled();
    });

    it("blocks auto_distribute with manual depts pending", async () => {
      const order = createMultiDeptOrder();
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      const calls = mockBot._callbackQueryCalls;
      const autoHandler = getHandlerForPattern(calls, "^auto_distribute:(.+)$");

      const ctx = createMockContext({
        match: ["auto_distribute:draft_test123", "draft_test123"],
      });

      await autoHandler(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining("manuel"),
      );
    });
  });

  describe("split_mode", () => {
    it("sets waitingForSplitInput and shows prompt", async () => {
      const order = createMultiDeptOrder();
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      const calls = mockBot._callbackQueryCalls;
      const splitHandler = getHandlerForPattern(calls, "^split_mode:(.+):(.+)$");

      const ctx = createMockContext({
        from: { id: TEST_MARINA_ID },
        match: ["split_mode:draft_test123:Dikishane", "draft_test123", "Dikishane"],
      });

      await splitHandler(ctx);

      expect(handler.waitingForSplitInput.has(TEST_MARINA_ID)).toBe(true);
      expect(handler.waitingForSplitInput.get(TEST_MARINA_ID)).toEqual({
        draftId: "draft_test123",
        dept: "Dikishane",
      });
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Распределение"),
        expect.objectContaining({ parse_mode: "HTML" }),
      );
    });
  });
});
