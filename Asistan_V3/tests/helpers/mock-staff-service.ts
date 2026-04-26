import { vi } from "vitest";

export function createMockStaffService(staffList: any[]) {
  return {
    getStaffByDepartment: vi.fn((dept: string) =>
      staffList.filter((s) => {
        const d = dept.toLowerCase();
        const sd = s.department.toLowerCase();
        return sd.includes(d) || d.includes(sd);
      }),
    ),
    getAllStaff: vi.fn(() => staffList),
    getStaffByTelegramId: vi.fn((id: number) =>
      staffList.find((s) => s.telegramId === id),
    ),
    getStaffByName: vi.fn((name: string) =>
      staffList.find((s) => s.name.toLowerCase() === name.toLowerCase()),
    ),
    getMarina: vi.fn(() => staffList.find((s) => s.isMarina)),
  };
}
