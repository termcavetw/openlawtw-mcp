// lib/tables.js：openlawtw 重建表格（合併儲存格）轉 Markdown
import assert from "node:assert/strict";
import { pageText } from "../lib/tables.js";
const p = {
  n: 3, ocr: true,
  text: "一、本要點依都市計畫法訂定。\n土地使 | 建蔽率 | 容積率\n用分區 | (%) | (%)\n第一種\n50 | 120\n住宅區\n三、其他規定依相關法令辦理。",
  tables: [{ from: 1, to: 6, rows: [[["土地使用分區"], ["建蔽率 (%)"], ["容積率", 2, 1]], [["第一種住宅區", 1, 2], ["50"], ["120"], [""]], [["70"], ["200"], ["備註"]]] }],
};
const r = pageText(p);
assert.equal(r.rebuilt, true);
assert.equal(r.text, [
  "一、本要點依都市計畫法訂定。", "",
  "| 土地使用分區 | 建蔽率 (%) | 容積率 | 容積率 |",
  "| --- | --- | --- | --- |",
  "| 第一種住宅區 | 50 | 120 |  |",
  "| 第一種住宅區 | 70 | 200 | 備註 |", "",
  "三、其他規定依相關法令辦理。",
].join("\n"));
assert.deepEqual(pageText({ text: " 純文字 " }), { text: "純文字", rebuilt: false });
console.log("tables.mjs：通過");
