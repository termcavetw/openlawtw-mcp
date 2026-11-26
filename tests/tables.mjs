// lib/tables.js：原文保留，掃描頁附重建表格當對照；文字層頁面不附
import assert from "node:assert/strict";
import { pageText } from "../lib/tables.js";
const rows = [[["土地使用分區"], ["建蔽率 (%)"], ["容積率", 2, 1]], [["第一種住宅區", 1, 2], ["50"], ["120"], [""]], [["70"], ["200"], ["備註"]]];
const raw = "一、本要點依都市計畫法訂定。\n土地使 | 建蔽率 | 容積率\n第一種\n50 | 120\n住宅區";
const r = pageText({ n: 3, ocr: true, text: raw, tables: [{ from: 1, to: 5, rows }] });
assert.equal(r.rebuilt, true);
assert.ok(r.text.startsWith(raw + "\n\n【表格辨識對照】"));
assert.ok(r.text.includes("| 土地使用分區 | 建蔽率 (%) | 容積率 |  |\n| --- | --- | --- | --- |\n| 第一種住宅區 | 50 | 120 |  |\n| 第一種住宅區 | 70 | 200 | 備註 |"));
assert.deepEqual(pageText({ ocr: false, text: raw, tables: [{ from: 1, to: 5, rows }] }), { text: raw, rebuilt: false });
assert.deepEqual(pageText({ text: " 純文字 " }), { text: "純文字", rebuilt: false });
console.log("tables.mjs：通過");
