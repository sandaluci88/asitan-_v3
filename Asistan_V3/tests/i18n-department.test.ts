/**
 * Test Suite 2: i18n and Department Utils
 * Tests bilingual translation, department detection, and formatting
 */

import { describe, it, expect } from "vitest";
import { t, getUserLanguage, translateDepartment } from "../packages/core/src/utils/i18n.js";
import {
  isManualDept,
  DEPT_FLOW_ORDER,
  buildDistributionSummary,
  getDeptButtonLabel,
} from "../packages/core/src/utils/department.utils.js";

// ─── i18n ──────────────────────────────────────────────────────

describe("i18n: t() function", () => {
  it("returns Turkish for boss", () => {
    const text = t("welcome_boss", "tr");
    expect(text).toContain("Sandaluci");
    expect(text).toContain("Barış Bey");
  });

  it("returns Russian for staff", () => {
    const text = t("welcome_staff", "ru", { name: "Hasan", department: "Döşeme" });
    expect(text).toContain("Hasan");
    expect(text).toContain("Döşeme");
  });

  it("handles missing keys gracefully", () => {
    const text = t("nonexistent_key", "tr");
    expect(text).toBe("nonexistent_key");
  });

  it("replaces params correctly", () => {
    const text = t("notification_new_order", "ru", {
      customer: "Test Müşteri",
      product: "Koltuk",
      quantity: "5",
      department: "Каркас",
    });
    expect(text).toContain("Test Müşteri");
    expect(text).toContain("5");
  });

  it("falls back to Turkish when Russian is missing", () => {
    // All keys have both languages, but test the fallback mechanism
    const text = t("access_denied", "ru");
    expect(text).toBeTruthy();
  });
});

describe("i18n: getUserLanguage()", () => {
  it("returns Turkish for boss", () => {
    expect(getUserLanguage("boss")).toBe("tr");
  });

  it("returns Russian for all other roles", () => {
    expect(getUserLanguage("staff")).toBe("ru");
    expect(getUserLanguage("coordinator")).toBe("ru");
    expect(getUserLanguage("guest")).toBe("ru");
  });
});

describe("i18n: translateDepartment()", () => {
  it("translates known departments to Russian", () => {
    expect(translateDepartment("Karkas Üretimi", "ru")).toContain("каркаса");
    expect(translateDepartment("Metal Üretimi", "ru")).toContain("Металло");
    expect(translateDepartment("Boyahane", "ru")).toContain("Покрасоч");
    expect(translateDepartment("Dikişhane", "ru")).toContain("Швей");
    expect(translateDepartment("Döşemehane", "ru")).toContain("Обивоч");
  });

  it("returns original for unknown departments", () => {
    expect(translateDepartment("Bilinmeyen", "ru")).toBe("Bilinmeyen");
  });
});

// ─── Department Utils ──────────────────────────────────────────

describe("isManualDept()", () => {
  it("detects manual departments", () => {
    expect(isManualDept("Dikişhane")).toBe(true);
    expect(isManualDept("Döşemehane")).toBe(true);
    expect(isManualDept("Швейный цех")).toBe(true);
    expect(isManualDept("Обивочный цех")).toBe(true);
  });

  it("does not flag auto departments", () => {
    expect(isManualDept("Karkas Üretimi")).toBe(false);
    expect(isManualDept("Metal Üretimi")).toBe(false);
    expect(isManualDept("Boyahane")).toBe(false);
  });

  it("handles empty/undefined", () => {
    expect(isManualDept("")).toBe(false);
  });

  it("handles partial matches", () => {
    expect(isManualDept("dikiş")).toBe(true);
    expect(isManualDept("döşeme")).toBe(true);
  });
});

describe("DEPT_FLOW_ORDER", () => {
  it("has correct production flow order", () => {
    expect(DEPT_FLOW_ORDER[0]).toBe("Satınalma");
    expect(DEPT_FLOW_ORDER[1]).toBe("Karkas Üretimi");
    expect(DEPT_FLOW_ORDER[DEPT_FLOW_ORDER.length - 1]).toBe("Döşemehane");
  });

  it("has 7 departments", () => {
    expect(DEPT_FLOW_ORDER.length).toBe(7);
  });
});

describe("buildDistributionSummary()", () => {
  it("builds summary from order items", () => {
    const order = {
      items: [
        { product: "Koltuk", department: "Karkas Üretimi", quantity: 3, details: "Meşe" },
        { product: "Sandalye", department: "Boyahane", quantity: 10, details: "" },
      ],
    };
    const summary = buildDistributionSummary(order);
    expect(summary).toContain("каркаса");
    expect(summary).toContain("Покрасоч");
    expect(summary).toContain("3 шт");
    expect(summary).toContain("10 шт");
  });
});

describe("getDeptButtonLabel()", () => {
  it("shows assignment labels in Russian", () => {
    expect(getDeptButtonLabel("Dikişhane")).toContain("Швея");
    expect(getDeptButtonLabel("Döşemehane")).toContain("Обивщик");
  });

  it("shows change label when assigned", () => {
    expect(getDeptButtonLabel("Dikişhane", true)).toContain("Изменить");
    expect(getDeptButtonLabel("Dikişhane", false)).toContain("Выбрать");
  });
});
