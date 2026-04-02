import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabaseService } from "./mocks";

vi.mock("../src/utils/supabase.service", () => {
  const mockData = {
    getAllStaff: vi.fn().mockResolvedValue([]),
    upsertStaff: vi.fn().mockResolvedValue({}),
    deleteStaff: vi.fn().mockResolvedValue({}),
  };
  return {
    SupabaseService: {
      getInstance: () => ({
        ...createMockSupabaseService(),
        ...mockData,
      }),
    },
  };
});

describe("StaffService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("getStaffByDepartment", () => {
    it("should return empty array when no staff in department", async () => {
      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      const result = staffService.getStaffByDepartment("NonExistent");

      expect(result).toHaveLength(0);
    });
  });

  describe("registerStaff", () => {
    it("should handle registration gracefully", async () => {
      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      await staffService.registerStaff(
        123456,
        "Yeni Personel",
        "Karkas Üretimi",
        "+905551112233",
        "Personnel",
        "tr",
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  describe("isBoss", () => {
    it("should return false when telegramId does not match boss ID", async () => {
      process.env.TELEGRAM_BOSS_ID = "123456";

      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      const result = staffService.isBoss(999999);

      expect(result).toBe(false);
    });

    it("should return true when telegramId matches TELEGRAM_BOSS_ID", async () => {
      process.env.TELEGRAM_BOSS_ID = "123456";

      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      const result = staffService.isBoss(123456);

      expect(result).toBe(true);
    });

    it("should support multiple boss IDs separated by comma", async () => {
      process.env.TELEGRAM_BOSS_ID = "123456,789012";

      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      expect(staffService.isBoss(123456)).toBe(true);
      expect(staffService.isBoss(789012)).toBe(true);
      expect(staffService.isBoss(111111)).toBe(false);
    });
  });

  describe("getStaffByTelegramId", () => {
    it("should return undefined when staff not found", async () => {
      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      const result = staffService.getStaffByTelegramId(999999);

      expect(result).toBeUndefined();
    });
  });

  describe("isCoordinator", () => {
    it("should return false when not coordinator", async () => {
      process.env.TELEGRAM_BOSS_ID = "123456";

      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      expect(staffService.isCoordinator(999999)).toBe(false);
    });
  });

  describe("getDepartments", () => {
    it("should return list of all departments", async () => {
      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      const departments = staffService.getDepartments();

      expect(departments).toContain("Karkas Üretimi");
      expect(departments).toContain("Metal Üretimi");
      expect(departments).toContain("Dikişhane");
      expect(departments).toContain("Döşemehane");
      expect(departments).toContain("Boyahane");
      expect(departments).toContain("Satınalma");
    });
  });

  describe("removeStaff", () => {
    it("should return false when staff not found", async () => {
      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      const result = await staffService.removeStaff(999999);

      expect(result).toBe(false);
    });
  });

  describe("getAllStaff", () => {
    it("should return staff list", async () => {
      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      const result = staffService.getAllStaff();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getMarina", () => {
    it("should return undefined when no marina defined", async () => {
      const { StaffService } = await import("../src/utils/staff.service");
      const staffService = StaffService.getInstance();

      const result = staffService.getMarina();

      expect(result).toBeUndefined();
    });
  });
});
