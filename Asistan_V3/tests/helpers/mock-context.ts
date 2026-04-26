import { vi } from "vitest";

export function createMockContext(overrides: {
  from?: { id: number };
  match?: string[];
  callbackQuery?: { data: string };
  message?: { text: string };
} = {}) {
  return {
    from: overrides.from ?? { id: 123456789 },
    match: overrides.match ?? [],
    callbackQuery: overrides.callbackQuery ?? { data: "" },
    message: overrides.message,
    answerCallbackQuery: vi.fn(async () => {}),
    editMessageText: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
    role: "coordinator",
  } as any;
}
