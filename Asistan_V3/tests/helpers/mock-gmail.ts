import { vi } from "vitest";

export interface MockGmailMessage {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  content: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    content: Buffer;
  }>;
}

export function createMockGmailService(messages: MockGmailMessage[]) {
  return {
    processUnreadMessages: vi.fn(async (limit: number, processor: (msg: MockGmailMessage) => Promise<void>) => {
      for (const msg of messages) {
        await processor(msg);
      }
    }),
    fetchOneMessage: vi.fn(),
    getInstance: vi.fn(),
  };
}
