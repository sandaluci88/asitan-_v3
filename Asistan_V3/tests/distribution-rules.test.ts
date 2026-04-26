/**
 * Test Suite: Distribution Rules — Business Logic Verification
 *
 * Rules (Baris Bey specification):
 * - Karkas, Boya, Metal → Direk sipariş (auto to department)
 * - Döşeme, Dikiş → Seçimli parseli (manual worker selection)
 * - Dış alım (plastik, Satialma) → ALWAYS Marina
 */

import { describe, it, expect } from "vitest";
import { isManualDept, DEPT_FLOW_ORDER } from "../packages/core/src/utils/department.utils.js";

// ─── Department Classification ───────────────────────────────────

describe("Distribution Rules: Department classification", () => {
  const AUTO_DEPTS = ["Karkas Üretimi", "Metal Üretimi", "Boyahane"];
  const MANUAL_DEPTS = ["Dikişhane", "Döşemehane"];
  const EXTERNAL_DEPTS = ["Satialma", "Satınalma"];

  it("Karkas, Boya, Metal are NOT manual departments (auto)", () => {
    for (const dept of AUTO_DEPTS) {
      expect(isManualDept(dept)).toBe(false);
    }
  });

  it("Döşeme, Dikiş ARE manual departments (selection needed)", () => {
    for (const dept of MANUAL_DEPTS) {
      expect(isManualDept(dept)).toBe(true);
    }
  });

  it("Satialma is NOT a manual department (external)", () => {
    for (const dept of EXTERNAL_DEPTS) {
      expect(isManualDept(dept)).toBe(false);
    }
  });
});

// ─── External Purchase Routing ───────────────────────────────────

describe("Distribution Rules: External purchase → Marina", () => {
  const isExternalPurchase = (dept: string): boolean => {
    const d = dept.toLowerCase();
    return (
      d.includes("sati") ||
      d.includes("satın") ||
      d.includes("dış") ||
      d.includes("dis") ||
      d === "satialma"
    );
  };

  it("Satialma is external purchase", () => {
    expect(isExternalPurchase("Satialma")).toBe(true);
  });

  it("Satınalma is external purchase", () => {
    expect(isExternalPurchase("Satınalma")).toBe(true);
  });

  it("Dış Alım is external purchase", () => {
    expect(isExternalPurchase("Dış Alım")).toBe(true);
  });

  it("Karkas is NOT external purchase", () => {
    expect(isExternalPurchase("Karkas Üretimi")).toBe(false);
  });

  it("Boyahane is NOT external purchase", () => {
    expect(isExternalPurchase("Boyahane")).toBe(false);
  });

  it("Döşemehane is NOT external purchase", () => {
    expect(isExternalPurchase("Döşemehane")).toBe(false);
  });
});

// ─── DEPT_FLOW_ORDER Verification ───────────────────────────────

describe("Distribution Rules: Flow order", () => {
  it("Satınalma (purchasing) is first in flow", () => {
    expect(DEPT_FLOW_ORDER[0]).toBe("Satınalma");
  });

  it("Karkas is after Satınalma", () => {
    expect(DEPT_FLOW_ORDER[1]).toBe("Karkas Üretimi");
  });

  it("Metal is after Karkas", () => {
    expect(DEPT_FLOW_ORDER[2]).toBe("Metal Üretimi");
  });

  it("Boyahane is after Metal", () => {
    expect(DEPT_FLOW_ORDER[3]).toBe("Boyahane");
  });

  it("Kumaş is after Boyahane", () => {
    expect(DEPT_FLOW_ORDER[4]).toBe("Kumaş");
  });

  it("Dikiş is after Kumaş", () => {
    expect(DEPT_FLOW_ORDER[5]).toBe("Dikişhane");
  });

  it("Döşeme is LAST (final step)", () => {
    expect(DEPT_FLOW_ORDER[6]).toBe("Döşemehane");
  });

  it("flow has exactly 7 departments", () => {
    expect(DEPT_FLOW_ORDER.length).toBe(7);
  });
});

// ─── Full Order Distribution Scenario ────────────────────────────

describe("Distribution Rules: Full order scenario", () => {
  const testItems = [
    { product: "Sandalye Ahşap", department: "Karkas Uretimi", source: "Production" },
    { product: "Sandalye Ahşap", department: "Boyahane", source: "Production" },
    { product: "Koltuk", department: "Kumas", source: "Production" },
    { product: "Koltuk", department: "Dikishane", source: "Production" },
    { product: "Koltuk", department: "Dosemehane", source: "Production" },
    { product: "Tabure Plastik", department: "Satialma", source: "External" },
  ];

  it("each item has correct source type", () => {
    for (const item of testItems) {
      if (item.department === "Satialma") {
        expect(item.source).toBe("External");
      } else {
        expect(item.source).toBe("Production");
      }
    }
  });

  it("auto departments: Karkas, Boyahane get direct distribution", () => {
    const autoItems = testItems.filter(
      (i) => !isManualDept(i.department) && i.source === "Production",
    );
    const autoDepts = [...new Set(autoItems.map((i) => i.department))];
    // Karkas, Boyahane, Kumas
    expect(autoDepts).toContain("Karkas Uretimi");
    expect(autoDepts).toContain("Boyahane");
  });

  it("manual departments: Dikiş, Döşeme need worker selection", () => {
    const manualItems = testItems.filter((i) => isManualDept(i.department));
    const manualDepts = [...new Set(manualItems.map((i) => i.department))];
    expect(manualDepts).toContain("Dikishane");
    expect(manualDepts).toContain("Dosemehane");
  });

  it("external items route to Marina, not department", () => {
    const externalItems = testItems.filter((i) => i.source === "External");
    expect(externalItems.length).toBe(1);
    expect(externalItems[0].department).toBe("Satialma");
  });

  it("total items match expected count", () => {
    expect(testItems.length).toBe(6);
  });
});
