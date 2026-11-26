// 建築法規求解器的邊界測試（原 law-solver-tests.js 33 項＋接進 MCP 時複核補的項目）。不連網。
import { solve, radar, R } from "../lib/law-solver-engine.js";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (d, cond, got) => { if (cond) pass++; else { fail++; console.log("✗ 求解器", d, "→", JSON.stringify(got)); } };
const T = (d, inp, id, exp) => { const o = solve(inp).out.find((o) => o.id === id); ok(d, o.on === exp, o.on); };
T("95 240 not", { group: "H-2", F: 5, typ: 240 }, "e95", false);
T("95 241", { group: "H-2", F: 5, typ: 241 }, "e95", true);
T("95 8F small", { group: "H-2", F: 8, typ: 200 }, "e95", true);
T("96 2F", { group: "H-2", F: 2, typ: 100 }, "e96", false);
T("96 B2", { group: "H-2", F: 2, B: 2, typ: 100 }, "e96", true);
T("106 10F", { group: "H-2", F: 10, typ: 600 }, "l106", false);
T("106 11F 499", { group: "H-2", F: 11, typ: 499 }, "l106", false);
T("106 11F 500", { group: "H-2", F: 11, typ: 500 }, "l106", true);
T("55 5F", { group: "H-2", F: 5, typ: 300 }, "l55", false);
T("79 1499", { group: "H-2", F: 3, typ: 499.6 }, "z79", false);
T("79 1500", { group: "H-2", F: 3, typ: 500 }, "z79", true);
T("69 2F 299", { group: "H-2", F: 2, typ: 299 }, "fp69", false);
T("69 2F 300", { group: "H-2", F: 2, typ: 300 }, "fp69", true);
T("f26 6F 5999", { group: "H-2", F: 6, typ: 999 }, "f26", false);
T("f26 6F 6000", { group: "H-2", F: 6, typ: 1000 }, "f26", true);
T("f26 7F", { group: "H-2", F: 7, typ: 100 }, "f26", true);
T("f19 6F 299", { group: "H-2", F: 6, typ: 299 }, "f19", false);
T("a170 5F 50u", { group: "H-2", F: 5, typ: 900, units: 50 }, "a170", true);
T("a170 5F 49u", { group: "H-2", F: 5, typ: 900, units: 49 }, "a170", false);
T("141 H2 5F", { group: "H-2", F: 5, typ: 300 }, "p141", false);
T("141 H2 6F", { group: "H-2", F: 6, typ: 300 }, "p141", true);
T("green 300", { group: "H-2", F: 3, typ: 100, site: 300 }, "gr-green", false);
T("water 9999", { group: "G-2", F: 10, typ: 999.9 }, "gr-water", false);
T("pv G2", { group: "G-2", F: 5, typ: 1000 }, "gr-pv", true);
T("pv H2", { group: "H-2", F: 5, typ: 1000 }, "gr-pv", "info");
T("99 B2 5F", { group: "B-2", F: 5, typ: 800 }, "e99", true);
T("struct B4", { group: "H-2", F: 8, B: 4, typ: 500 }, "t-struct", true);
T("96 3F H2 exempt", { group: "H-2", F: 3, typ: 80 }, "e96", false);
T("96-1 3F H2", { group: "H-2", F: 3, typ: 80 }, "e96-1", true);
T("96 5F H2 exempt", { group: "H-2", F: 5, typ: 230 }, "e96", false);
T("96 3F G2", { group: "G-2", F: 3, typ: 200 }, "e96", true);
T("96 6F H2", { group: "H-2", F: 6, typ: 200 }, "e96", true);
T("96 4F H2 B2", { group: "H-2", F: 4, B: 2, typ: 200 }, "e96", true);
// 原測試「96 3F H2 nonfp → true」與引擎牴觸：三層 H 類依第 69 條必須是防火構造，不可能以非防火構造成立。
// 改成：仍以防火構造檢討（第 96-1 條免設），並在第 69 條提醒輸入矛盾。
T("96 3F H2 nonfp 仍以防火構造檢討", { group: "H-2", F: 3, typ: 80, fireproof: false }, "e96", false);
{ const o = solve({ group: "H-2", F: 3, typ: 80, fireproof: false }).out.find((o) => o.id === "fp69"); ok("69 提醒輸入矛盾", /非防火構造/.test(o.note || ""), o.note); }
// 複核補的
T("95 其他用途 2F 300（只有避難層直上層，門檻 400）", { group: "G-2", F: 2, typ: 300 }, "e95", false);
T("95 其他用途 2F 401", { group: "G-2", F: 2, typ: 401 }, "e95", true);
T("95 其他用途 3F 241", { group: "G-2", F: 3, typ: 241 }, "e95", true);
T("f19 甲類總樓地板 ≥300（第 6 款）", { group: "B-3", F: 2, typ: 200 }, "f19", true);
T("f19 乙類 2F 200 不觸發", { group: "G-2", F: 2, typ: 200 }, "f19", false);
T("f28 甲類合計 ≥500", { group: "B-3", F: 1, typ: 500 }, "f28", true);
T("f28 H-2 5F 不觸發", { group: "H-2", F: 5, typ: 500 }, "f28", false);
// 其他
{ const r = solve({ group: "H-2", F: 15, B: 3, typ: 620, site: 1800, bcr: 50 }); ok("15F 未達高層但貼近 50m", r.c.high === false && r.c.nearHigh === true && r.out.find((o) => o.id === "h227").on === "info", r.c.H); }
ok("H 51m 屬高層", solve({ group: "H-2", F: 15, B: 3, typ: 620, H: 51 }).c.high === true);
{ const p = solve({ group: "H-2", F: 7, typ: 400, site: 900 }).out.find((o) => o.id === "p59"); ok("法定停車 16 輛", /16 輛/.test(JSON.stringify(p.calc)), p.calc); }
{ const rd = radar({ group: "H-2", F: 5, B: 1, typ: 230, site: 420 }); const up = rd.find((x) => /加到 6 層/.test(x.label)); ok("雷達 5→6 層多出昇降機與防空避難", up && ["l55", "p141", "e96"].every((id) => up.ch.some((c) => c.id === id)), up && up.ch.map((c) => c.id)); }
ok("規則 57 條", R.length === 57, R.length);
{ // 每條規則引用的條文都在核對快照裡；函釋對照表的 id 都對得到規則
  const snap = JSON.parse(readFileSync(new URL("../lib/law-solver-snapshot.json", import.meta.url))).articles;
  const RJ = JSON.parse(readFileSync(new URL("../lib/law-solver-rulings.json", import.meta.url)));
  const miss = R.flatMap((r) => (typeof r.art === "function" ? ["108", "233"] : [r.art]).map((a) => `${r.law}|${a}`)).filter((k) => !(k in snap));
  ok("快照涵蓋所有規則條文", !miss.length, miss);
  const ids = new Set(R.map((r) => r.id)); const bad = Object.keys(RJ).filter((k) => !ids.has(k));
  ok("函釋對照表 id 都有規則", !bad.length, bad);
}
console.log(`solver.mjs：${pass} 項通過，${fail} 項失敗`);
if (fail) process.exit(1);
