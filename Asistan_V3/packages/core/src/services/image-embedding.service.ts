import { LlmService } from "./llm.service.js";
import { logger } from "../utils/logger.js";

export class ImageEmbeddingService {
  private llmService: LlmService;

  constructor() {
    this.llmService = LlmService.getInstance();
  }

  /**
   * Generates a vector embedding for an image.
   * Uses LLM to describe the image in detail, then simulates an embedding vector.
   * In production, replace simulateEmbedding with a dedicated embedding model API call.
   */
  async generateImageEmbedding(
    imageBuffer: Buffer,
    extension: string = "jpg",
  ): Promise<number[]> {
    try {
      const base64Image = imageBuffer.toString("base64");
      const mimeType = `image/${extension === "png" ? "png" : "jpeg"}`;

      const prompt = `
        Bu urunu detaylica analiz et ve teknik ozelliklerini acikla.
        Urun tipi, malzemesi, rengi, tasarim stili (modern, klasik, rustik vb.) ve belirgin ozelliklerini belirt.
        Sadece teknik aciklama yap, yorum ekleme.
      `;

      // Visual analysis via LLM
      const description = await this.llmService.chat({
        userMessage: prompt,
        context: "Gorsel Analiz ve Urun Tanimlama Modu.",
        images: [
          {
            url: `data:${mimeType};base64,${base64Image}`,
          },
        ],
      });

      if (!description) {
        throw new Error("Gorsel analiz basarisiz oldu.");
      }

      logger.info(
        { description: description.substring(0, 100) + "..." },
        "Gorsel analiz tamamlandi.",
      );

      // Embed the description
      // Note: In a real scenario, use a dedicated embedding model.
      // Here we simulate a 1024-dim vector for compatibility.
      return this.simulateEmbedding(description);
    } catch (error) {
      logger.error({ error }, "Gorsel vektorlestirme hatasi.");
      return new Array(1024).fill(0); // Fallback to 1024-dim zero vector
    }
  }

  private simulateEmbedding(text: string): number[] {
    // Placeholder for actual text embedding API call.
    // In production, use openai.embeddings.create or similar.
    const vector = new Array(1024).fill(0);
    for (let i = 0; i < text.length; i++) {
      vector[i % 1024] += text.charCodeAt(i) / 1000;
    }
    return vector.map((v) => Math.tanh(v)); // Normalize
  }
}
