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

  // ─────────────────────────────────────────────
  // FAZ 1: Split Input Handler (A1-A12)
  // Kaynak: callback.handler.ts satır 413-520
  // ─────────────────────────────────────────────
  describe("split_mode input handler (A1-A12)", () => {

    function getTextMessageHandler(): Function {
      const calls = mockBot._onCalls;
      for (const call of calls) {
        if (call[0] === "message:text") return call[1];
      }
      throw new Error("No message:text handler found");
    }

    function createTextCtx(text: string, fromId: number = TEST_MARINA_ID) {
      return {
        from: { id: fromId },
        message: { text },
        reply: vi.fn(async () => {}),
        chat: { id: "888888" },
      } as any;
    }

    function getReplies(ctx: any): string {
      return ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
    }

    // A1: Split parse — "Almira: 20, X: 20" doğru ayrıştırılır
    it("A1: parses 'Almira: 20, X: 20' correctly into 2 sub-orders", async () => {
      const order = createMultiDeptOrder();
      order.items[4].quantity = 40; // Dikishane item qty=40
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a1", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: 20, X: 20");
      await textHandler(ctx, vi.fn());

      expect(orderService.createSubOrderForStaff).toHaveBeenCalledTimes(2);
      expect(orderService.createSubOrderForStaff).toHaveBeenCalledWith(
        order, "Almira", 20, "Dikishane",
      );
      expect(orderService.createSubOrderForStaff).toHaveBeenCalledWith(
        order, "X", 20, "Dikishane",
      );
      expect(distService.processOrderDistribution).toHaveBeenCalledTimes(2);
    });

    // A2: Toplam miktar aşımı → hata mesajı
    it("A2: rejects total quantity exceeding order quantity", async () => {
      const order = createMultiDeptOrder();
      // Dikishane item has qty=5
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a2", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: 20, X: 20"); // total 40 > 5
      await textHandler(ctx, vi.fn());

      const replies = getReplies(ctx);
      expect(replies).toMatch(/fazla/);
      expect(distService.processOrderDistribution).not.toHaveBeenCalled();
    });

    // A3: 0 veya negatif miktar → hata mesajı
    it("A3: rejects zero quantity", async () => {
      const order = createMultiDeptOrder();
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a3", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: 0");
      await textHandler(ctx, vi.fn());

      const replies = getReplies(ctx);
      expect(replies).toMatch(/sıfır veya negatif olamaz/i);
      expect(distService.processOrderDistribution).not.toHaveBeenCalled();
    });

    it("A3b: rejects negative quantity (format error)", async () => {
      const order = createMultiDeptOrder();
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a3b", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: -5");
      await textHandler(ctx, vi.fn());

      const replies = getReplies(ctx);
      expect(replies).toMatch(/Format hatalı/i);
      expect(distService.processOrderDistribution).not.toHaveBeenCalled();
    });

    // A4: Bilinmeyen personel adı → hata mesajı
    it("A4: warns about unknown staff and skips", async () => {
      const order = createMultiDeptOrder();
      order.items[4].quantity = 20;
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a4", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("UnknownPerson: 10, Almira: 10");
      await textHandler(ctx, vi.fn());

      const replies = getReplies(ctx);
      expect(replies).toMatch(/bulunamadı.*UnknownPerson/i);
      expect(orderService.createSubOrderForStaff).toHaveBeenCalledTimes(1);
      expect(orderService.createSubOrderForStaff).toHaveBeenCalledWith(
        order, "Almira", 10, "Dikishane",
      );
    });

    // A5: 1 personele tam miktar atama
    it("A5: assigns full quantity to single worker", async () => {
      const order = createMultiDeptOrder();
      // Dikishane qty=5
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a5", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: 5");
      await textHandler(ctx, vi.fn());

      expect(orderService.createSubOrderForStaff).toHaveBeenCalledTimes(1);
      expect(orderService.createSubOrderForStaff).toHaveBeenCalledWith(
        order, "Almira", 5, "Dikishane",
      );
      expect(distService.processOrderDistribution).toHaveBeenCalledTimes(1);
    });

    // A6: 3+ personele bölme (Hasan:10, Zhagir:20, Aleksi:20)
    it("A6: splits across 3 workers (Hasan: 10, Zhagir: 20, Aleksi: 20)", async () => {
      const order = createMultiDeptOrder();
      order.items[5].quantity = 50; // Dosemehane qty=50
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a6", dept: "Dosemehane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Hasan: 10, Zhagir: 20, Aleksi: 20");
      await textHandler(ctx, vi.fn());

      expect(orderService.createSubOrderForStaff).toHaveBeenCalledTimes(3);
      expect(orderService.createSubOrderForStaff).toHaveBeenCalledWith(
        order, "Hasan", 10, "Dosemehane",
      );
      expect(orderService.createSubOrderForStaff).toHaveBeenCalledWith(
        order, "Zhagir", 20, "Dosemehane",
      );
      expect(orderService.createSubOrderForStaff).toHaveBeenCalledWith(
        order, "Aleksi", 20, "Dosemehane",
      );
    });

    // A7: Rusça isimle dağıtım (Альмира: 15, Х: 15)
    it("A7: handles Cyrillic staff name input (warnings for unknown)", async () => {
      const order = createMultiDeptOrder();
      order.items[4].quantity = 30;
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a7", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      // Cyrillic names won't match Latin staff names in DB
      const ctx = createTextCtx("Альмира: 15, Х: 15");
      await textHandler(ctx, vi.fn());

      const replies = getReplies(ctx);
      // Both Cyrillic names should generate warnings
      expect(replies).toMatch(/bulunamadı.*Альмира/i);
      expect(replies).toMatch(/bulunamadı.*Х/i);
      // Split completes even when all staff unknown
      expect(replies).toMatch(/tamamlandı/i);
      // No sub-orders created since names don't match
      expect(orderService.createSubOrderForStaff).not.toHaveBeenCalled();
    });

    // A8: Her personele ayrı PDF gider
    it("A8: each worker gets separate processOrderDistribution call", async () => {
      const order = createMultiDeptOrder();
      order.items[4].quantity = 40;
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a8", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: 20, X: 20");
      await textHandler(ctx, vi.fn());

      // Verify distribution was called for EACH worker
      expect(distService.processOrderDistribution).toHaveBeenCalledTimes(2);
      expect(distService.processOrderDistribution).toHaveBeenCalledWith(
        expect.anything(), [], [], undefined, ["Dikishane"], false,
      );
    });

    // A9: Split sonrası waitingForSplitInput temizlenir
    it("A9: clears waitingForSplitInput after successful split", async () => {
      const order = createMultiDeptOrder();
      order.items[4].quantity = 10;
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a9", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: 5, X: 5");
      await textHandler(ctx, vi.fn());

      expect(handler.waitingForSplitInput.has(TEST_MARINA_ID)).toBe(false);

      const replies = getReplies(ctx);
      expect(replies).toMatch(/tamamlandı/i);
    });

    // A10: Döşemehane split — 3 kişiye bölme
    it("A10: Dosemehane split with 3 workers", async () => {
      const order = createMultiDeptOrder();
      order.items[5].quantity = 50; // Dosemehane qty=50
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a10", dept: "Dosemehane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Hasan: 20, Zhagir: 15, Aleksi: 15");
      await textHandler(ctx, vi.fn());

      expect(orderService.createSubOrderForStaff).toHaveBeenCalledTimes(3);
      const replies = getReplies(ctx);
      expect(replies).toMatch(/tamamlandı/i);
    });

    // A11: Dikishane split — 2 kişiye bölme
    it("A11: Dikishane split with 2 workers", async () => {
      const order = createMultiDeptOrder();
      order.items[4].quantity = 50; // Dikishane qty=50
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a11", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: 25, X: 25");
      await textHandler(ctx, vi.fn());

      expect(orderService.createSubOrderForStaff).toHaveBeenCalledTimes(2);
      expect(distService.processOrderDistribution).toHaveBeenCalledTimes(2);
    });

    // A12: Aynı personele 2 kez atama engeli
    it("A12: rejects duplicate staff assignment", async () => {
      const order = createMultiDeptOrder();
      order.items[4].quantity = 40;
      draftService.getDraft.mockReturnValue({ order, images: [], excelRows: [] });

      handler.waitingForSplitInput.set(TEST_MARINA_ID, { draftId: "draft_a12", dept: "Dikishane" });

      const textHandler = getTextMessageHandler();
      const ctx = createTextCtx("Almira: 20, Almira: 20");
      await textHandler(ctx, vi.fn());

      const replies = getReplies(ctx);
      expect(replies).toMatch(/birden fazla kez atama yapılamaz/i);
      expect(distService.processOrderDistribution).not.toHaveBeenCalled();
    });
  });
});
