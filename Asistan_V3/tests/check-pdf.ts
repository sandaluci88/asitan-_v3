import * as fs from 'fs';

const pdfPath = 'data/orders/2026-04-23/pdfs/is_emri_KARKAS_URETIMI_1776962171967.pdf';
const buffer = fs.readFileSync(pdfPath);

// Find text streams in PDF
const text = buffer.toString('latin1');
const streamMatches: string[] = [];
let idx = 0;

while (idx < text.length) {
  const start = text.indexOf('BT\n', idx);
  if (start === -1) break;
  const end = text.indexOf('ET\n', start);
  if (end === -1) break;
  streamMatches.push(text.substring(start, end));
  idx = end + 3;
}

// Extract Tj/TJ text
const texts: string[] = [];
for (const stream of streamMatches) {
  // Match text between parentheses in Tj
  const tjMatch = stream.matchAll(/\(([^)]*)\)\s*Tj/g);
  for (const m of tjMatch) {
    texts.push(m[1]);
  }
  // Match arrays in TJ
  const tjArrMatch = stream.matchAll(/\[([^\]]*)\]\s*TJ/g);
  for (const m of tjArrMatch) {
    const parts = m[1].matchAll(/\(([^)]*)\)/g);
    for (const p of parts) {
      texts.push(p[1]);
    }
  }
}

console.log('=== PDF TEXT CONTENT ===');
texts.forEach(t => {
  if (t.trim()) console.log(t);
});
