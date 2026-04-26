/**
 * Test Suite: Real Excel → Parse → PDF with IMAGES
 *
 * Uses the real SIPARIS FORMU-MARZHAN Excel file with product images.
 * Tests the complete pipeline: Excel → Parse → PDF generation.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseOrderExcel } from "../packages/core/src/services/excel-order-parser.js";

const REAL_EXCEL = path.resolve(__dirname, "fixtures", "real-order.xlsx");
const PDF_OUTPUT_DIR = path.resolve(__dirname, "fixtures", "output");

// ─── Real Excel Parsing ──────────────────────────────────────────

describe("Real Excel: Parse with images", () => {
  it("file exists", () => {
    expect(fs.existsSync(REAL_EXCEL)).toBe(true);
  });

  it("file is > 100KB (contains images)", () => {
    const stat = fs.statSync(REAL_EXCEL);
    expect(stat.size).toBeGreaterThan(100_000);
  });

  let parsed: Awaited<ReturnType<typeof parseOrderExcel>>;

  it("parses successfully", async () => {
    parsed = await parseOrderExcel(REAL_EXCEL);
    expect(parsed).not.toBeNull();
  });

  it("has customer name", () => {
    expect(parsed!.order.customerName).toBeTruthy();
    expect(parsed!.order.customerName).not.toBe("Bilinmiyor");
  });

  it("has order number", () => {
    expect(parsed!.order.orderNumber).toBeTruthy();
  });

  it("has items", () => {
    expect(parsed!.order.items.length).toBeGreaterThan(0);
  });

  it("has images extracted from Excel", () => {
    expect(parsed!.imageMap.size).toBeGreaterThan(0);
  });

  it("image buffers are valid PNG/JPEG", () => {
    for (const [row, imgData] of parsed!.imageMap) {
      expect(imgData.buffer.length).toBeGreaterThan(1000);
      expect(["png", "jpeg", "jpg"]).toContain(imgData.extension);
    }
  });

  it("items with images have imageBuffer set", () => {
    const itemsWithImages = parsed!.order.items.filter(
      (item) => item.imageBuffer,
    );
    expect(itemsWithImages.length).toBeGreaterThan(0);

    for (const item of itemsWithImages) {
      expect(item.imageBuffer!.length).toBeGreaterThan(1000);
    }
  });

  it("NO fabricated items — all items have valid rowIndex", () => {
    for (const item of parsed!.order.items) {
      expect(item.rowIndex).toBeGreaterThanOrEqual(9);
    }
  });

  it("all items have non-empty product name", () => {
    for (const item of parsed!.order.items) {
      expect(item.product.trim().length).toBeGreaterThan(0);
    }
  });

  it("all items have quantity > 0", () => {
    for (const item of parsed!.order.items) {
      expect(item.quantity).toBeGreaterThan(0);
    }
  });

  it("department distribution summary", () => {
    const depts = [...new Set(parsed!.order.items.map((i) => i.department))];
    console.log("Departments:", depts);
    console.log("Items:", parsed!.order.items.map((i) => `${i.department}: ${i.product} x${i.quantity}`));
    console.log("Images:", parsed!.imageMap.size, "rows:", [...parsed!.imageMap.keys()]);
    console.log("Items with image:", parsed!.order.items.filter((i) => i.imageBuffer).length);
    expect(depts.length).toBeGreaterThan(0);
  });

  // ─── PDF Generation Test ────────────────────────────────────

  it("can generate Job Order PDF with images", async () => {
    if (!fs.existsSync(PDF_OUTPUT_DIR)) {
      fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
    }

    // Import PDFService from dist
    const { PDFService } = await import("../packages/bot/src/services/pdf.service.js");

    const pdfService = PDFService.getInstance();

    // Generate PDF for first department
    const firstDept = parsed!.order.items[0].department;
    const deptItems = parsed!.order.items.filter(
      (i) => i.department === firstDept,
    );

    const pdfBuffer = await pdfService.generateJobOrderPDF(
      deptItems,
      parsed!.order.customerName,
      firstDept,
    );

    expect(pdfBuffer).toBeTruthy();
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Save to file for manual inspection
    const pdfPath = path.join(PDF_OUTPUT_DIR, `is_emri_${firstDept.replace(/\s+/g, "_")}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`Job Order PDF saved: ${pdfPath} (${pdfBuffer.length} bytes)`);
  });

  it("can generate Marina Summary PDF with images", async () => {
    if (!fs.existsSync(PDF_OUTPUT_DIR)) {
      fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
    }

    const { PDFService } = await import("../packages/bot/src/services/pdf.service.js");
    const pdfService = PDFService.getInstance();

    const pdfBuffer = await pdfService.generateMarinaSummaryPDF(parsed!.order);

    expect(pdfBuffer).toBeTruthy();
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    const pdfPath = path.join(PDF_OUTPUT_DIR, "marina_summary.pdf");
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`Marina PDF saved: ${pdfPath} (${pdfBuffer.length} bytes)`);
  });

  it("PDF files are valid (start with %PDF)", async () => {
    const pdfFiles = fs.readdirSync(PDF_OUTPUT_DIR).filter((f) => f.endsWith(".pdf"));
    for (const file of pdfFiles) {
      const fullPath = path.join(PDF_OUTPUT_DIR, file);
      const header = fs.readFileSync(fullPath).slice(0, 5).toString();
      expect(header).toBe("%PDF-");
    }
  });
});
