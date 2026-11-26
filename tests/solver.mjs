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
T("struct B4", { group: "H-2", F: 8, B: 4, typ: 500, ty: true }, "t-struct", true);
ok("未指定桃園市 → 不列桃園地方規定", !solve({ group: "H-2", F: 8, B: 4, typ: 500, site: 2000 }).out.some((x) => x.cat === "桃園地方規定"));
{ const rd = radar({ group: "H-2", F: 5, typ: 230, site: 420, H: 16 }); ok("雷達未指定桃園市 → 不出現桃園綠化", !rd.some((x) => (x.items || x.changes || []).some?.((y) => /桃園/.test(JSON.stringify(y)))) && !/桃園市建築基地綠化/.test(JSON.stringify(rd))); }
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
ok("規則 60 條", R.length === 60, R.length);
// 2026-11-27：混合用途、供公眾判定、無障礙廁所、消防甲類逐層
{ const r = solve({ group: "C-2", F: 4, typ: 120 }); const o = (id) => r.out.find((x) => x.id === id);
  ok("窯業廠房 4F×120：應為防火構造", o("fp69").on === true);
  ok("窯業廠房：都市計畫內作業廠房 ≥200㎡ 屬供公眾使用", r.c.pub === true, r.c.pubList);
  ok("窯業廠房：不是第 170 條公共建築物", o("a170").on === false && r.c.pubBldg === false);
  ok("窯業廠房：無障礙廁所 1 處", o("a167-3").on === true && o("a167-3").lvl === "1", o("a167-3").calc);
  ok("窯業廠房：二層以上作業廠房要無障礙通路", o("a167-1").on === true);
  ok("窯業廠房：消防丁類、5 層以下 120㎡ 不設室內消防栓", o("f15").on === false); }
T("工廠都市計畫外 480㎡ 未填用電 → 需確認供公眾", { group: "C-2", F: 4, typ: 120, urban: false }, "p141", false);
ok("工廠都市計畫外 480㎡ 用電 80kW → 供公眾", solve({ group: "C-2", F: 4, typ: 120, urban: false, kw: 80 }).c.pub === true);
ok("倉庫 280㎡ → 非供公眾", solve({ group: "C-2", F: 2, typ: 140, ind: "warehouse" }).c.pub === false);
ok("餐廳 2F×150 =300 → 供公眾", solve({ group: "B-3", F: 2, typ: 150 }).c.pub === true);
ok("5F 集合住宅 → 非供公眾", solve({ group: "H-2", F: 5, typ: 200 }).c.pub === false);
T("工廠 2F 1600 → 不因 1,500㎡ 要防火構造", { group: "C-2", F: 2, typ: 800 }, "fp69", false);
T("倉庫 2F 1600 → 要防火構造", { group: "C-2", F: 2, typ: 800, ind: "warehouse" }, "fp69", true);
T("無障礙廁所 7F 各 600 → 2 處", { group: "G-2", F: 7, typ: 600 }, "a167-3", true);
ok("無障礙廁所 7F 各 600 數量", solve({ group: "G-2", F: 7, typ: 600 }).out.find((x) => x.id === "a167-3").lvl === "3");
T("住宅不檢討無障礙廁所", { group: "H-2", F: 7, typ: 600 }, "a167-3", false);
// 混合用途
{ const r = solve({ group: "H-2", F: 5, typ: 230, uses: [{ group: "G-3", floors: "1" }] }); const o = (id) => r.out.find((x) => x.id === id);
  ok("1F 店面＋住宅：第 96-1 條不適用", o("e96-1").on === "info" && o("e96").on === true);
  ok("1F 店面＋住宅：要檢討無障礙廁所", o("a167-3").on === true);
  ok("1F 店面＋住宅：停車分類合併計算", /合併/.test(JSON.stringify(o("p59").calc)), o("p59").calc); }
{ const r = solve({ group: "H-2", F: 12, typ: 600, uses: [{ group: "B-3", floors: "1" }] });
  ok("12F 住宅 1F 餐廳：戊類第 1 目、11 層以上建築物全棟撒水", r.c.klass === "戊1" && r.out.find((x) => x.id === "f17").lvl === "all"); }
T("KTV 4F 每層 350 → 撒水（甲類第 1 目 300㎡）", { group: "B-1", F: 4, typ: 350 }, "f17", true);
T("餐廳 4F 每層 1000 → 不必撒水（甲類其他目 1,500㎡）", { group: "B-3", F: 4, typ: 1000 }, "f17", false);
T("商場 4F 每層 1600 → 撒水", { group: "B-2", F: 4, typ: 1600 }, "f17", true);
{ const rd = radar({ group: "H-2", F: 5, typ: 230, site: 420, H: 16 }); ok("雷達掃高度 20m 與 50 戶", rd.some((x) => /超過 20 m/.test(x.label)) && rd.some((x) => /50 戶/.test(x.label)), rd.map((x) => x.label)); }
T("窯業用地 4F 120 → 不適用第十四章", { group: "C-2", F: 4, typ: 120, urban: false, zoneTxt: "窯業用地" }, "i269", false);
T("丁種建築用地工廠 → 適用第十四章", { group: "C-2", F: 2, typ: 400, urban: false, zoneTxt: "丁種建築用地" }, "i269", true);
T("都市計畫工業區工廠 → 適用第十四章", { group: "C-2", F: 2, typ: 400, zoneTxt: "乙種工業區" }, "i269", true);
T("都市計畫農業區工廠 → 不適用第十四章", { group: "C-2", F: 2, typ: 400, zoneTxt: "農業區" }, "i269", false);
T("工廠未填分區 → 第十四章需確認", { group: "C-2", F: 2, typ: 400 }, "i269", "info");
T("倉庫 → 第十四章不列", { group: "C-2", F: 2, typ: 400, ind: "warehouse", zoneTxt: "乙種工業區" }, "i269", false);
{ const o = solve({ group: "C-2", F: 4, typ: 120, zoneTxt: "乙種工業區" }).out.find((x) => x.id === "i269"); ok("工業區作業廠房單層 120 < 150 → 標不符", o.on === true && o.lvl === "!", o); }
{ const o = solve({ F: 7, typ: 300, uses: [{ group: "B-3", floors: "1" }, { group: "H-2", floors: "2-7" }] }).out.find((x) => x.id === "e93"); ok("1F 餐廳＋住宅：步行距離以 2F 以上的住宅 50 m 檢討", o.lvl === "50", o); }
{ const o = solve({ F: 4, typ: 300, uses: [{ group: "B-3", floors: "1-2" }, { group: "H-2", floors: "3-4" }] }).out.find((x) => x.id === "e93"); ok("2F 也是餐廳：步行距離 30 m", o.lvl === "30", o); }
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
