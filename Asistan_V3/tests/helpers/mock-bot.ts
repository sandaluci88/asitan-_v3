import { vi } from "vitest";

export interface BotApiCall {
  method: string;
  args: any[];
}

export function createMockBot() {
  const apiCalls: BotApiCall[] = [];

  const api = {
    sendMessage: vi.fn(async (chatId: number | string, text: string, opts?: any) => {
      apiCalls.push({ method: "sendMessage", args: [chatId, text, opts] });
      return { message_id: Date.now() };
    }),
    sendDocument: vi.fn(async (chatId: number | string, document: any, opts?: any) => {
      apiCalls.push({ method: "sendDocument", args: [chatId, document, opts] });
      return { message_id: Date.now() };
    }),
    sendPhoto: vi.fn(async (chatId: number | string, photo: any, opts?: any) => {
      apiCalls.push({ method: "sendPhoto", args: [chatId, photo, opts] });
      return { message_id: Date.now() };
    }),
  };

  const bot = {
    api,
    callbackQuery: vi.fn(),
    on: vi.fn(),
    catch: vi.fn(),
    start: vi.fn(),
    command: vi.fn(),
  } as any;

  return { bot, apiCalls, api };
}
