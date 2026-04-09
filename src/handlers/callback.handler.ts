import { Bot, InlineKeyboard } from "grammy";
import { OrderService } from "../utils/order.service";
import { StaffService } from "../utils/staff.service";
import { DraftOrderService } from "../utils/draft-order.service";
import { DistributionService } from "../services/distribution.service";
import { MessageHandler } from "./message.handler";
import {
  isManualDept,
  getDeptButtonLabel,
  buildDistributionSummary,
  DEPT_FLOW_ORDER,
} from "../utils/department.utils";
import { t, getUserLanguage, translateDepartment } from "../utils/i18n";

/**
 * Tüm bot callback query handler'larını ve split mode handler'ını merkezi olarak yönetir.
 */
export class CallbackHandler {
  private bot: Bot;
  private orderService: OrderService;
  private staffService: StaffService;
  private draftOrderService: DraftOrderService;
  private distributionService: DistributionService;
  private messageHandler: MessageHandler;

  private waitingForSplitInput = new Map<
    number,
    { draftId: string; dept: string }
  >();

  constructor(
    bot: Bot,
    orderService: OrderService,
    staffService: StaffService,
    draftOrderService: DraftOrderService,
    distributionService: DistributionService,
    messageHandler: MessageHandler,
  ) {
    this.bot = bot;
    this.orderService = orderService;
    this.staffService = staffService;
    this.draftOrderService = draftOrderService;
    this.distributionService = distributionService;
    this.messageHandler = messageHandler;
  }

  register() {
    this.registerStaffSelection();
    this.registerWorkerAssignment();
    this.registerFinalizeDistribution();
    this.registerAutoDistribute();
    this.registerBackToDraft();
    this.registerSplitMode();
    this.registerSplitInputHandler();
    this.registerRejectOrder();
    this.registerFabricCallbacks();
    this.registerGenericCallback();
  }

  // --- Personel Seçimi ---
  private registerStaffSelection() {
    this.bot.callbackQuery(
      /^select_dept_staff:(.+)\|(.+)$/,
      async (ctx) => {
        const draftId = ctx.match[1] as string;
        const deptName = ctx.match[2] as string;
        const staffList = this.staffService.getStaffByDepartment(deptName);
        if (staffList.length === 0) {
          return ctx.answerCallbackQuery(
            `⚠️ В отделе ${deptName} нет зарегистрированных сотрудников.`,
          );
        }

        const keyboard = new InlineKeyboard();
        staffList.forEach((s) => {
          keyboard
            .text(s.name, `aw:${draftId}:${deptName}:${s.name}`)
            .row();
        });
        keyboard.text("🔙 Назад", `back_to_draft:${draftId}`);

        await ctx.editMessageText(
          `👤 <b>${deptName}</b> — выберите сотрудника:\n\n<i>Выберите имя из списка.</i>`,
          { parse_mode: "HTML", reply_markup: keyboard },
        );
        await ctx.answerCallbackQuery();
      },
    );
  }

  // --- İşçi Atama ---
  private registerWorkerAssignment() {
    this.bot.callbackQuery(/^aw:(.+):(.+):(.+)$/, async (ctx) => {
      const draftId = ctx.match[1] as string;
      const deptName = ctx.match[2] as string;
      const staffName = ctx.match[3] as string;

      const draft = this.draftOrderService.getDraft(draftId);
      if (!draft)
        return ctx.answerCallbackQuery("❌ Черновик не найден или истёк.");

      draft.order.items.forEach((item: any) => {
        if (item.department === deptName) {
          item.assignedWorker = staffName;
          item.status = "uretimde";
          item.distributedAt = new Date().toISOString();
        }
      });

      await ctx.answerCallbackQuery(`✅ ${staffName} назначен(а).`);

      const visualReport = this.orderService.generateVisualTable(draft.order);
      const keyboard = new InlineKeyboard();

      const remainingDepts = Array.from(
        new Set(
          draft.order.items
            .filter(
              (i: any) => isManualDept(i.department) && !i.assignedWorker,
            )
            .map((i: any) => i.department),
        ),
      );

      remainingDepts.forEach((d: any) => {
        keyboard
          .text(
            getDeptButtonLabel(d, false),
            `select_dept_staff:${draftId}|${d}`,
          )
          .row();
      });

      if (remainingDepts.length === 0) {
        keyboard
          .text("🚀 ЗАПУСТИТЬ ПРОИЗВОДСТВО", `finalize_dist:${draftId}`)
          .row();
      }
      keyboard.text("❌ Отменить", `reject_order:${draftId}`);

      await ctx.editMessageText(
        `✅ ${deptName} → <b>${staffName}</b> назначен(а).\n\n${visualReport}`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    });
  }

  // --- Dağıtımı Tamamla ---
  private registerFinalizeDistribution() {
    this.bot.callbackQuery(/^finalize_dist:(.+)$/, async (ctx) => {
      const draftId = ctx.match[1] as string;
      const draft = this.draftOrderService.getDraft(draftId);
      if (!draft) return ctx.answerCallbackQuery("❌ Черновик не найден.");

      const unassignedManualDepts = Array.from(
        new Set(
          draft.order.items
            .filter(
              (i: any) => isManualDept(i.department) && !i.assignedWorker,
            )
            .map((i: any) => i.department),
        ),
      );

      if (unassignedManualDepts.length > 0) {
        return ctx.answerCallbackQuery(
          `⚠️ Сначала назначьте сотрудников: ${unassignedManualDepts.join(", ")}`,
        );
      }

      await ctx.answerCallbackQuery("🚀 Производство запускается...");

      const assignedDepts = Array.from(
        new Set(
          draft.order.items
            .filter((i: any) => i.assignedWorker)
            .map((i: any) => i.department as string),
        ),
      ) as string[];

      const onlyManual = assignedDepts.filter((d) => isManualDept(d));

      const autoDepts = (
        Array.from(
          new Set(
            draft.order.items.map((i: any) => i.department as string),
          ),
        ) as string[]
      ).filter((d) => !isManualDept(d));

      const allDeptsToSend = [
        ...new Set([...onlyManual, ...autoDepts]),
      ].sort((a, b) => {
        const ai = DEPT_FLOW_ORDER.findIndex(
          (d) => a.includes(d) || d.includes(a),
        );
        const bi = DEPT_FLOW_ORDER.findIndex(
          (d) => b.includes(d) || d.includes(b),
        );
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      let report = { success: [] as string[], failed: [] as string[] };
      if (allDeptsToSend.length > 0) {
        report = await this.distributionService.processOrderDistribution(
          draft.order,
          draft.images || [],
          draft.excelRows || [],
          undefined,
          allDeptsToSend,
          false,
        );
      }

      const visualReport = this.orderService.generateVisualTable(draft.order);
      let statusMsg = "🚀 <b>Отчёт о распределении заказа</b>\n\n";

      if (report.success.length > 0) {
        statusMsg += `✅ <b>Отправлено:</b> ${report.success.map((d) => translateDepartment(d, "ru")).join(", ")}\n`;
      }
      if (report.failed.length > 0) {
        statusMsg += `❌ <b>ОШИБКА:</b> ${report.failed.map((d) => translateDepartment(d, "ru")).join(", ")}\n`;
      }
      if (report.success.length === 0 && report.failed.length === 0) {
        statusMsg +=
          "ℹ️ Дополнительное распределение не выполнялось.\n";
      }

      statusMsg += `\n${buildDistributionSummary(draft.order)}\n\n${visualReport}`;

      await ctx.editMessageText(statusMsg, { parse_mode: "HTML" });

      console.log(
        `✅ [FLOW] Finalize tamamlandı: ${draft.order.orderNumber}`,
      );
      this.draftOrderService.removeDraft(draftId);
    });
  }

  // --- Otomatik Dağıtım ---
  private registerAutoDistribute() {
    this.bot.callbackQuery(/^auto_distribute:(.+)$/, async (ctx) => {
      const draftId = ctx.match[1] as string;
      const draft = this.draftOrderService.getDraft(draftId);
      if (!draft) return ctx.answerCallbackQuery("❌ Черновик не найден.");

      const hasManual = draft.order.items.some((i: any) =>
        isManualDept(i.department),
      );
      if (!hasManual) {
        const autoDepts = (
          Array.from(
            new Set(
              draft.order.items.map((i: any) => i.department as string),
            ),
          ) as string[]
        ).filter((d) => !isManualDept(d));

        if (autoDepts.length > 0) {
          await this.distributionService.processOrderDistribution(
            draft.order,
            draft.images || [],
            draft.excelRows || [],
            undefined,
            autoDepts,
            false,
          );
        }

        console.log(
          `✅ [FLOW] Auto-distribute tamamlandı: ${draft.order.orderNumber}`,
        );
        await ctx.editMessageText("✅ Sipariş dağıtıldı.");
        this.draftOrderService.removeDraft(draftId);
      } else {
        await ctx.answerCallbackQuery(
          "⚠️ Lütfen önce manuel departmanlar için personel seçin.",
        );
      }
    });
  }

  // --- Taslağa Geri Dön ---
  private registerBackToDraft() {
    this.bot.callbackQuery(/^back_to_draft:(.+)$/, async (ctx) => {
      const draftId = ctx.match[1] as string;
      const draft = this.draftOrderService.getDraft(draftId);
      if (!draft) return ctx.answerCallbackQuery("❌ Черновик не найден.");

      const visualReport = this.orderService.generateVisualTable(draft.order);
      const keyboard = new InlineKeyboard();

      const deptsInOrder = Array.from(
        new Set(
          draft.order.items.map((i: any) => i.department as string),
        ),
      ) as string[];
      const relevantManual = deptsInOrder.filter((d) => isManualDept(d));

      relevantManual.forEach((d) => {
        const isAssigned = draft.order.items.some(
          (i: any) => i.department === d && i.assignedWorker,
        );
        keyboard
          .text(
            getDeptButtonLabel(d, isAssigned),
            `select_dept_staff:${draftId}|${d}`,
          )
          .row();
      });

      const remaining = draft.order.items.filter(
        (i: any) => isManualDept(i.department) && !i.assignedWorker,
      );

      if (remaining.length === 0) {
        keyboard
          .text("🚀 ЗАПУСТИТЬ ПРОИЗВОДСТВО", `finalize_dist:${draftId}`)
          .row();
      }

      // Miktarları Bölüştürme Butonu
      if (relevantManual.length > 0) {
        relevantManual.forEach((d) => {
          keyboard
            .text(
              `📊 Bölüştür: ${translateDepartment(d, "ru")}`,
              `split_mode:${draftId}:${d}`,
            )
            .row();
        });
      }

      keyboard.text("❌ Отменить", `reject_order:${draftId}`);

      await ctx.editMessageText(
        `📝 <b>Черновик заказа</b>\n\n${visualReport}`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    });
  }

  // --- Bölüştürmeli Dağıtım ---
  private registerSplitMode() {
    this.bot.callbackQuery(/^split_mode:(.+):(.+)$/, async (ctx) => {
      const draftId = ctx.match[1];
      const dept = ctx.match[2];
      const draft = this.draftOrderService.getDraft(draftId);

      if (!draft) return ctx.answerCallbackQuery("❌ Черновик не найден.");

      const staffList = this.staffService.getStaffByDepartment(dept);
      const staffNames = staffList.map((s) => s.name).join(", ");
      const totalQty = draft.order.items
        .filter((i: any) => i.department === dept)
        .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

      this.waitingForSplitInput.set(ctx.from.id, { draftId, dept });

      await ctx.editMessageText(
        `📊 <b>${dept} Dağıtımı</b>\n` +
          `Toplam Adet: <b>${totalQty}</b>\n` +
          `Personeller: <i>${staffNames}</i>\n\n` +
          `Lütfen miktarları şu formatta girin:\n` +
          `<code>İsim: Miktar, İsim: Miktar</code>\n\n` +
          `Örnek: <code>Dikiş Test 1: 15, Dikiş Test 2: 15</code>`,
        { parse_mode: "HTML" },
      );
      await ctx.answerCallbackQuery();
    });
  }

  // --- Split Mode Metin Girişi ---
  private registerSplitInputHandler() {
    this.bot.on("message:text", async (ctx, next) => {
      const waiter = this.waitingForSplitInput.get(ctx.from.id);
      if (!waiter) return next();

      const { draftId, dept } = waiter;
      const draft = this.draftOrderService.getDraft(draftId);
      if (!draft) {
        this.waitingForSplitInput.delete(ctx.from.id);
        return ctx.reply("❌ Черновик не найден.");
      }

      const text = ctx.message.text;
      const parts = text.split(",").map((p) => p.trim());

      const assignments: { staffName: string; qty: number }[] = [];
      let totalInputQty = 0;

      for (const part of parts) {
        const match = part.match(/^(.+):\s*(\d+)$/);
        if (!match) {
          return ctx.reply(
            `❌ Format hatalı: "${part}"\nDoğru format: İsim: Miktar, İsim: Miktar`,
          );
        }
        const staffName = match[1].trim();
        const qty = parseInt(match[2]);
        assignments.push({ staffName, qty });
        totalInputQty += qty;
      }

      const originalDeptQty = draft.order.items
        .filter((i: any) => i.department === dept)
        .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

      if (totalInputQty > originalDeptQty) {
        return ctx.reply(
          `⚠️ Girdiğiniz toplam adet (${totalInputQty}), siparişteki toplam adetten (${originalDeptQty}) fazla.`,
        );
      }

      await ctx.reply(
        "⏳ Dağıtım başlatılıyor, iş emirleri oluşturuluyor...",
      );

      for (const assign of assignments) {
        const staff = this.staffService.getStaffByName(assign.staffName);
        if (!staff) {
          await ctx.reply(
            `⚠️ Personel bulunamadı: ${assign.staffName}. Atlanıyor.`,
          );
          continue;
        }

        const subOrder = this.orderService.createSubOrderForStaff(
          draft.order,
          staff.name,
          assign.qty,
          dept,
        );

        await this.distributionService.processOrderDistribution(
          subOrder,
          draft.images || [],
          draft.excelRows || [],
          undefined,
          [dept],
          false,
        );

        draft.order.items.forEach((item: any) => {
          if (item.department === dept && !item.assignedWorker) {
            item.assignedWorker = staff.name;
          }
        });
      }

      this.waitingForSplitInput.delete(ctx.from.id);
      await ctx.reply(`✅ ${dept} departmanı için dağıtım tamamlandı.`, {
        reply_markup: new InlineKeyboard().text(
          "⬅️ Geri",
          `back_to_draft:${draftId}`,
        ),
      });
    });
  }

  // --- Sipariş İptal ---
  private registerRejectOrder() {
    this.bot.callbackQuery(/^reject_order:(.+)$/, async (ctx) => {
      const draftId = ctx.match[1] as string;
      this.draftOrderService.removeDraft(draftId);
      await ctx.editMessageText("❌ Черновик заказа отменён.");
      await ctx.answerCallbackQuery();
    });
  }

  // --- Kumaş Callback'leri ---
  private registerFabricCallbacks() {
    // Eski: fabric_ok / fabric_fail (geriye uyumlu)
    this.bot.callbackQuery(/^fabric_ok:(.+)$/, async (ctx) => {
      const itemId = ctx.match[1];
      const lang = getUserLanguage((ctx as any).role);
      await this.orderService.updateItemStatus(itemId, "uretimde");
      await ctx.editMessageText(`✅ ${t("fabric_ok_msg", lang)}`);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery(/^fabric_fail:(.+)$/, async (ctx) => {
      const lang = getUserLanguage((ctx as any).role);
      await ctx.editMessageText(`⚠️ ${t("fabric_fail_msg", lang)}`);
      await ctx.answerCallbackQuery();
    });

    // Yeni: Kumaş/Dış Alım hatırlatma butonları (Marina için)
    const getMarinaLang = () => {
      const marina = this.staffService.getMarina();
      return (marina?.language || "ru") as any;
    };

    // Kumaş/Dış alım GELDİ
    this.bot.callbackQuery(/^fabric_purchase_ok:(.+)$/, async (ctx) => {
      const itemId = ctx.match[1];
      const lang = getMarinaLang();

      const result = this.orderService.getOrderItemById(itemId);
      if (result) {
        const isFabricDept =
          result.item.department.toLowerCase().includes("dikiş") ||
          result.item.department.toLowerCase().includes("döşeme") ||
          result.item.department.toLowerCase() === "kumaş";

        if (isFabricDept && result.item.fabricDetails) {
          result.item.fabricDetails.arrived = true;
        }
        if (isFabricDept) {
          await this.orderService.updateItemStatus(itemId, "uretimde");
        } else {
          await this.orderService.updateItemStatus(itemId, "uretimde");
        }
        await this.orderService.updateLastReminder(result.order.id, itemId);
      }

      await ctx.editMessageText(t("fabric_arrived_msg", lang));
      await ctx.answerCallbackQuery();
    });

    // Kumaş/Dış alım GELMEDİ
    this.bot.callbackQuery(/^fabric_purchase_pending:(.+)$/, async (ctx) => {
      const itemId = ctx.match[1];
      const lang = getMarinaLang();

      const result = this.orderService.getOrderItemById(itemId);
      if (result) {
        await this.orderService.updateLastReminder(result.order.id, itemId);
      }

      await ctx.editMessageText(t("fabric_not_arrived_msg", lang));
      await ctx.answerCallbackQuery();
    });

    // SİPARİŞ VERİLDİ
    this.bot.callbackQuery(/^fabric_purchase_ordered:(.+)$/, async (ctx) => {
      const itemId = ctx.match[1];
      const lang = getMarinaLang();

      const result = this.orderService.getOrderItemById(itemId);
      if (result) {
        if (result.item.fabricDetails) {
          result.item.fabricDetails.arrived = false;
        }
        await this.orderService.updateLastReminder(result.order.id, itemId);
      }

      await ctx.editMessageText(t("fabric_ordered_msg", lang));
      await ctx.answerCallbackQuery();
    });
  }

  // --- Genel Callback ---
  private registerGenericCallback() {
    this.bot.on("callback_query:data", (ctx) =>
      this.messageHandler.handleCallback(ctx),
    );
  }
}
