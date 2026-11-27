// 統計「被其他函或會議紀錄引用、但本庫沒有收全文」的函，依被引用次數排序，給 openlawtw 決定優先補哪些。
// 用法：node scripts/missing-cited.mjs [前幾名，預設 60]
import { scanMissingCited } from "../lib/openlaw.js";
const top = Number(process.argv[2] || 60);
const list = (await scanMissingCited()).filter((e) => !/華總/.test(e.no)); // 總統公布法律的令不是函釋
console.log(`被引用但未收錄的函：共 ${list.length} 份；前 ${Math.min(top, list.length)} 名\n`);
console.log("次數\t字號\t出處（最多 3 處）");
for (const e of list.slice(0, top)) console.log(`${e.n}\t${e.no}\t${e.where.join("；")}`);
