import { ImapFlow, FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import * as nodemailer from "nodemailer";
import { logger } from "@sandaluci/core";

export interface GmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface GmailMessage {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  content?: string;
  source?: Buffer;
  attachments?: GmailAttachment[];
}

export class GmailService {
  private static instance: GmailService;
  private transporter: nodemailer.Transporter;

  private constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER || "",
        pass: (process.env.GMAIL_PASS || "").replace(/\s/g, ""),
      },
    });
  }

  public static getInstance(): GmailService {
    if (!GmailService.instance) {
      GmailService.instance = new GmailService();
    }
    return GmailService.instance;
  }

  /**
   * E-posta gönderir.
   */
  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: process.env.GMAIL_USER,
        to,
        subject,
        text,
        html,
      });
      logger.info(`Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      logger.error({ err: error }, `Failed to send email to ${to}`);
      return false;
    }
  }

  /**
   * Yeni bir ImapFlow istemcisi oluşturur.
   */
  private createClient(): ImapFlow {
    return new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER || "",
        pass: (process.env.GMAIL_PASS || "").replace(/\s/g, ""),
      },
      logger: false,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Okunmamış son mesajları getirir ve işler, ardından okundu olarak işaretler.
   */
  async processUnreadMessages(
    limit: number = 5,
    processor: (msg: GmailMessage) => Promise<void>,
  ): Promise<void> {
    const client = this.createClient();
    let isConnected = false;

    try {
      logger.info("📡 IMAP: Bağlantı kuruluyor...");
      await client.connect();
      isConnected = true;
      logger.info("📡 IMAP: Bağlandı.");

      const lock = await client.getMailboxLock("INBOX");
      try {
        logger.info("📡 IMAP: INBOX aranıyor (seen: false)...");
        const searchResult = await client.search(
          { seen: false },
          { uid: true },
        );
        const count = Array.isArray(searchResult) ? searchResult.length : 0;
        logger.info(`🔍 IMAP: ${count} adet okunmamış mesaj bulundu.`);

        if (Array.isArray(searchResult) && searchResult.length > 0) {
          const lastIds = searchResult.slice(-limit);

          for (const uid of lastIds) {
            logger.info(`📧 Mesaj UID ${uid} getiriliyor...`);
            const raw = (await client.fetchOne(
              uid.toString(),
              { source: true },
              { uid: true },
            )) as FetchMessageObject;

            if (raw && raw.source) {
              const parsed = await simpleParser(raw.source);

              const attachments: GmailAttachment[] = (
                parsed.attachments || []
              ).map((attr) => ({
                filename: attr.filename || "unnamed",
                contentType: attr.contentType,
                content: attr.content,
              }));

              let content = parsed.text || "";
              if (!content && parsed.html) {
                content = parsed.html.replace(/<[^>]*>?/gm, " ");
              }

              const msg: GmailMessage = {
                uid: uid,
                from: parsed.from?.text || "Unknown",
                subject: parsed.subject || "(Konu Yok)",
                date: parsed.date || new Date(),
                content: content,
                attachments: attachments,
              };

              try {
                await processor(msg);
                await client.messageFlagsAdd(uid.toString(), ["\\Seen"], {
                  uid: true,
                });
                logger.info(`✅ Message ${uid} işlendi ve okundu işaretlendi.`);
              } catch (procError) {
                logger.error({ err: procError }, `❌ UID ${uid} işleme hatası`);
              }
            }
          }
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      logger.error({ err: error }, "❌ IMAP: İşlem sırasında hata oluştu");
    } finally {
      if (isConnected) {
        try {
          await client.logout();
          logger.info("📡 IMAP: Bağlantı güvenli şekilde kapatıldı.");
        } catch (_) {
          logger.error({ err: _ }, "⚠️ IMAP: Logout hatası");
        }
      }
    }
  }

  async fetchOneMessage(uid: number): Promise<GmailMessage | null> {
    const client = this.createClient();
    let isConnected = false;

    try {
      await client.connect();
      isConnected = true;
      const lock = await client.getMailboxLock("INBOX");

      try {
        const raw = (await client.fetchOne(
          uid.toString(),
          { source: true },
          { uid: true },
        )) as FetchMessageObject;

        if (raw && raw.source) {
          const parsed = await simpleParser(raw.source);

          const attachments: GmailAttachment[] = (parsed.attachments || []).map(
            (attr) => ({
              filename: attr.filename || "unnamed",
              contentType: attr.contentType,
              content: attr.content,
            }),
          );

          let content = parsed.text || "";
          if (!content && parsed.html) {
            content = parsed.html.replace(/<[^>]*>?/gm, " ");
          }

          return {
            uid: uid,
            from: parsed.from?.text || "Unknown",
            subject: parsed.subject || "(Konu Yok)",
            date: parsed.date || new Date(),
            content: content,
            source: raw.source,
            attachments: attachments,
          };
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      logger.error({ err }, `❌ IMAP: UID ${uid} getirme hatası`);
    } finally {
      if (isConnected) {
        try {
          await client.logout();
        } catch (_) {
          // ignore
        }
      }
    }
    return null;
  }
}
