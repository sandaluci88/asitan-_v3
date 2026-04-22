import * as fs from "fs";
import * as path from "path";

export interface DraftOrder {
  order: any;
  images: any[];
  excelRows?: any[];
  assignments: Record<string, number>; // Departman -> TelegramId
}

/**
 * Geçici sipariş verilerini dosya tabanlı olarak saklar.
 * Bot restart'ta draft'lar kaybolmaz.
 * images buffer'ları ayrı .bin dosyalarında tutulur (JSON serileştirilemez).
 */
export class DraftOrderService {
  private static instance: DraftOrderService;
  private draftsDir: string;
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  private constructor() {
    this.draftsDir = path.resolve(process.cwd(), "data", "drafts");
    if (!fs.existsSync(this.draftsDir)) {
      fs.mkdirSync(this.draftsDir, { recursive: true });
    }

    // Başlangıçta eski (30dk+) draft'ları temizle
    this.cleanStaleDrafts();
  }

  static getInstance(): DraftOrderService {
    if (!DraftOrderService.instance) {
      DraftOrderService.instance = new DraftOrderService();
    }
    return DraftOrderService.instance;
  }

  private draftPath(id: string) {
    return path.join(this.draftsDir, `${id}.json`);
  }

  private imagesDir(id: string) {
    return path.join(this.draftsDir, `${id}_images`);
  }

  saveDraft(
    id: string,
    data: { order: any; images: any[]; excelRows?: any[] },
  ) {
    // images buffer'larını ayır (JSON serileştirilemez)
    const serializableImages = data.images.map((img: any, idx: number) => {
      if (img.content && Buffer.isBuffer(img.content)) {
        const imgDir = this.imagesDir(id);
        if (!fs.existsSync(imgDir)) {
          fs.mkdirSync(imgDir, { recursive: true });
        }
        const imgPath = path.join(imgDir, `${idx}.bin`);
        fs.writeFileSync(imgPath, img.content);
        return { ...img, content: null, _bufferPath: imgPath };
      }
      return img;
    });

    // order items içindeki imageBuffer'ları da ayır
    const serializableOrder = {
      ...data.order,
      items: data.order.items?.map((item: any) => {
        if (item.imageBuffer && Buffer.isBuffer(item.imageBuffer)) {
          const imgDir = this.imagesDir(id);
          if (!fs.existsSync(imgDir)) {
            fs.mkdirSync(imgDir, { recursive: true });
          }
          const imgPath = path.join(imgDir, `item_${item.id}.bin`);
          fs.writeFileSync(imgPath, item.imageBuffer);
          return { ...item, imageBuffer: null, _imageBufferPath: imgPath };
        }
        return item;
      }),
    };

    const draft: DraftOrder = {
      order: serializableOrder,
      images: serializableImages,
      excelRows: data.excelRows,
      assignments: {},
    };

    fs.writeFileSync(this.draftPath(id), JSON.stringify(draft, null, 2));

    // 30 dakika sonra temizle
    const existingTimer = this.cleanupTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => this.removeDraft(id), 30 * 60 * 1000);
    this.cleanupTimers.set(id, timer);
  }

  getDraft(id: string): DraftOrder | undefined {
    const filePath = this.draftPath(id);
    if (!fs.existsSync(filePath)) return undefined;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      // Buffer'ları geri yükle
      if (data.images) {
        data.images = data.images.map((img: any) => {
          if (img._bufferPath && fs.existsSync(img._bufferPath)) {
            img.content = fs.readFileSync(img._bufferPath);
          }
          return img;
        });
      }

      if (data.order?.items) {
        data.order.items = data.order.items.map((item: any) => {
          if (item._imageBufferPath && fs.existsSync(item._imageBufferPath)) {
            item.imageBuffer = fs.readFileSync(item._imageBufferPath);
          }
          return item;
        });
      }

      return data;
    } catch {
      return undefined;
    }
  }

  updateAssignment(id: string, dept: string, telegramId: number) {
    const draft = this.getDraft(id);
    if (draft) {
      draft.assignments[dept] = telegramId;
      // Buffer'ları tekrar ayırarak kaydet
      // Sadece assignments'ı güncelle, order ve images'ı değiştirmeden kaydet
      const filePath = this.draftPath(id);
      const rawData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      rawData.assignments[dept] = telegramId;
      fs.writeFileSync(filePath, JSON.stringify(rawData, null, 2));
    }
  }

  removeDraft(id: string) {
    const filePath = this.draftPath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Images klasörünü de temizle
    const imgDir = this.imagesDir(id);
    if (fs.existsSync(imgDir)) {
      fs.rmSync(imgDir, { recursive: true, force: true });
    }

    const timer = this.cleanupTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(id);
    }
  }

  /**
   * Başlangıçta 30 dakikadan eski draft dosyalarını temizler.
   */
  private cleanStaleDrafts() {
    if (!fs.existsSync(this.draftsDir)) return;

    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 dakika

    const files = fs.readdirSync(this.draftsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(this.draftsDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          const id = file.replace(".json", "");
          this.removeDraft(id);
        }
      } catch {
        // ignore
      }
    }
  }
}
