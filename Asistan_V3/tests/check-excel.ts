import { parseOrderExcel } from '../packages/core/src/services/excel-order-parser.js';
import * as fs from 'fs';

async function main() {
  const buffer = fs.readFileSync('tests/fixtures/marzhan-live.xlsx');
  console.error('Read', buffer.length, 'bytes');

  const result = await parseOrderExcel(buffer);
  if (!result) { console.error('NULL result'); process.exit(1); }

  const { order, imageMap } = result;

  console.log('=== ORIGINAL EXCEL ===');
  console.log('MUSTERI:', order.customerName);
  console.log('SIPARIS NO:', order.orderNumber);
  console.log('TESLIM:', order.deliveryDate);
  console.log('KALEM:', order.items.length);
  console.log('RESIM:', imageMap.size);
  console.log('');

  order.items.forEach((item, i) => {
    console.log(`[${i+1}] ${item.product}`);
    console.log(`    Dept: ${item.department} | Qty: ${item.quantity} | Source: ${item.source}`);
    console.log(`    Details: ${item.details}`);
    console.log(`    Image: ${item.imageBuffer ? 'YES (' + Math.round(item.imageBuffer.length/1024) + 'KB)' : 'NO'}`);
    if (item.fabricDetails) console.log(`    Fabric: ${JSON.stringify(item.fabricDetails)}`);
    console.log('');
  });
}

main().catch(e => { console.error(e); process.exit(1); });
