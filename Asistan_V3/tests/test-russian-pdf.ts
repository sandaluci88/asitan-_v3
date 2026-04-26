import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const fontsDir = path.resolve('packages/bot/src/assets/fonts');
const outputPath = 'tests/fixtures/test-russian.pdf';

const doc = new PDFDocument({ margin: 30, size: 'A4' });
const chunks: Buffer[] = [];
doc.on('data', (chunk: Buffer) => chunks.push(chunk));
doc.on('end', () => {
  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(outputPath, buffer);
  console.log('PDF written to', outputPath, 'size:', buffer.length);

  // Check if text is in the PDF
  const text = buffer.toString('utf-8');
  const hasRussian = text.includes('\\u041a\\u0430\\u0440\\u043a\\u0430\\u0441') ||
                     buffer.toString('latin1').includes('\\x12\\x00');
  console.log('Contains Russian markers:', hasRussian);
});

const fontRegular = path.join(fontsDir, 'Roboto-Regular.ttf');
const fontBold = path.join(fontsDir, 'Roboto-Bold.ttf');

if (fs.existsSync(fontRegular)) {
  doc.font(fontRegular);
} else {
  doc.font('Helvetica');
  console.log('WARNING: Using Helvetica fallback');
}

doc.fontSize(16).text('Каркасное производство', 30, 30);
doc.fontSize(12).text('Клиент: Маржан', 30, 60);
doc.text('Дата: 23.04.2026', 30, 80);
doc.text('Кол-во: 30', 30, 100);
doc.text('Детали: Цвет каркаса', 30, 120);
doc.text('Sandaluci Mobilya — Производственный заказ', 30, 160);

doc.font(fs.existsSync(fontBold) ? fontBold : 'Helvetica-Bold');
doc.text('ПРОИЗВОДСТВО КАРКАСА', 30, 200);

doc.end();
