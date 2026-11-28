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
ok("規則 67 條", R.length === 67, R.length);
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
// 容積與建蔽試算
T("非都窯業用地 → 第 9 條 60%／120%", { group: "C-2", F: 4, typ: 120, site: 300, urban: false, zoneTxt: "窯業用地" }, "v-nu9", true);
T("都市計畫內 → 不適用非都第 9 條", { group: "H-2", F: 5, typ: 200, site: 400 }, "v-nu9", false);
T("非都未填使用地 → 需確認", { group: "H-2", F: 3, typ: 100, site: 300, urban: false }, "v-nu9", "info");
T("未填建蔽率 → 建蔽試算需確認", { group: "H-2", F: 5, typ: 200, site: 400 }, "v-bcr", "info");
{ const o = solve({ group: "C-2", F: 4, typ: 120, site: 300, urban: false, zoneTxt: "窯業用地" }).out; const b = o.find((x) => x.id === "v-bcr"), f = o.find((x) => x.id === "v-far");
  ok("窯業 300㎡：可建建築面積 180、不超過", b.on === true && b.lvl === "" && /180 ㎡/.test(b.calc[0][1]), b);
  ok("窯業 300㎡：基準容積 360，4×120=480 超過", f.on === true && f.lvl === "!" && /360 ㎡/.test(f.calc[0][1]) && /超過.*120 ㎡/.test(f.calc[1][1]), f); }
{ const o = solve({ group: "H-2", F: 5, typ: 200, site: 400, bcr: 50, far: 200, vfa: 780 }).out; const b = o.find((x) => x.id === "v-bcr"), f = o.find((x) => x.id === "v-far");
  ok("住宅 400㎡ 50%／200%：建築面積 200 剛好、法定空地 200", b.lvl === "" && /200 ㎡/.test(b.calc[2][1]), b);
  ok("住宅：基準容積 800、容積樓地板 780 未超過、機電免計 10%（一座梯）＝80", f.lvl === "" && /800 ㎡/.test(f.calc[0][1]) && /^80 ㎡/.test(f.calc[3][1]), f); }
{ const f = solve({ group: "H-2", F: 10, typ: 300, site: 1000, bcr: 50, far: 300, vfa: 3000 }).out.find((x) => x.id === "v-far"); ok("10 層（要二座梯）：機電免計 15%＝450", /^450 ㎡/.test(f.calc[3][1]), f); }
{ const b = solve({ group: "H-2", F: 3, typ: 300, site: 400, bcr: 60 }).out.find((x) => x.id === "v-bcr"); ok("建築面積 300 > 240 → 標超過", b.lvl === "!", b); }
// 逐層面積
{ const r = solve({ group: "H-2", F: 10, floorAreas: [{ floors: "1", area: 420 }, { floors: "2-9", area: 230 }, { floors: "10", area: 250 }] }); const o = r.out.find((x) => x.id === "e95");
  ok("逐層：只有 10F 250 > 240 → 10F 二座梯", o.on === true && /10F/.test(o.why) && !/2F/.test(o.why), o); ok("逐層：最大單層 420、總樓地板 2510", r.c.typ === 420 && r.c.tfa === 2510, r.c.tfa); }
{ const o = solve({ group: "H-2", F: 5, floorAreas: [{ floors: "1", area: 260 }, { floors: "2-5", area: 200 }] }).out.find((x) => x.id === "e95"); ok("逐層：1F 是避難層，2F～5F 200 → 不用二座梯", o.on === false, o); }
{ const o = solve({ group: "B-1", F: 4, uses: [{ group: "B-1", floors: "1-2", area: 200 }, { group: "G-2", floors: "3-4", area: 200 }] }).out.find((x) => x.id === "f17"); ok("逐層：KTV 2 層各 200 合計 400 ≥300 → 1F～2F 撒水", o.on === true && /1F～2F/.test((o.calc || []).map((x) => x.join(" ")).join(" ") + o.why), o); }
{ const o = solve({ group: "B-1", F: 4, uses: [{ group: "B-1", floors: "1", area: 250 }, { group: "G-2", floors: "2-4", area: 250 }] }).out.find((x) => x.id === "f17"); ok("逐層：KTV 只有 1F 250 < 300 → 不必撒水", o.on === false, o); }
{ const o = solve({ group: "H-2", F: 12, floorAreas: [{ floors: "1-10", area: 600 }, { floors: "11-12", area: 80 }] }).out.find((x) => x.id === "f17"); ok("逐層：11F 以上各 80 < 100 → 不必撒水", o.on === false, o); }
{ const o = solve({ group: "H-2", F: 12, floorAreas: [{ floors: "1-10", area: 600 }, { floors: "11-12", area: 200 }] }).out.find((x) => x.id === "l106"); ok("逐層：11 層以上合計 400 < 500 → 緊急昇降機免設（第 106 條第 2 款）", o.on === false && /400/.test(o.why), o); }
{ const o = solve({ group: "H-2", F: 12, floorAreas: [{ floors: "1-10", area: 600 }, { floors: "11-12", area: 300 }] }).out.find((x) => x.id === "l106"); ok("逐層：11 層以上合計 600 → 要設，看最大單層 300", o.on === true && /300/.test(o.why), o); }
{ const rd = radar({ group: "H-2", F: 10, floorAreas: [{ floors: "1", area: 420 }, { floors: "2-10", area: 230 }] }); ok("逐層：雷達放大面積有作用", JSON.stringify(rd).includes("面積")); }
// 真實案例校正（取自實際面積計算表的情境；數字已取整並改動，不對應任何個案）
{ // 非都丁建廠房：1F 大、上層小（附屬空間）→ 第 271 條只標需確認；作業廠房 ≥1,500 設 1 處裝卸位
  const o = solve({ group: "C-2", F: 5, B: 1, b1: 500, floorAreas: [{ floors: "1", area: 3400 }, { floors: "2", area: 1000 }, { floors: "3", area: 550 }, { floors: "4", area: 180 }, { floors: "5", area: 60 }], site: 12000, ba: 3500, urban: false, zoneTxt: "丁種建築用地" }).out;
  const i = o.find((x) => x.id === "i269"), p = o.find((x) => x.id === "p59");
  ok("案例 丁建廠房：5F 60㎡ 只標需確認，不判不符", i.on === true && i.lvl === "?", i);
  ok("案例 丁建廠房：裝卸位 1 處", /1 處/.test(i.calc.find((x) => /278/.test(x[0]))[1]), i.calc);
  ok("案例 丁建廠房：停車 (5190−500)/350 → 14 輛", p.on === true && /14 輛/.test(JSON.stringify(p.calc)), p.calc); }
{ const o = solve({ group: "C-2", F: 4, floorAreas: [{ floors: "1", area: 2400 }, { floors: "2", area: 2100 }, { floors: "3", area: 300 }, { floors: "4", area: 600 }], urban: false, zoneTxt: "丁種建築用地" }).out.find((x) => x.id === "i269");
  ok("案例 擴廠：5,400㎡ → 裝卸位 1 處（3,900 < 4,000 免增設）", /^1 處/.test(o.calc.find((x) => /278/.test(x[0]))[1]), o.calc); }
{ const o = solve({ group: "C-2", F: 4, floorAreas: [{ floors: "1", area: 110 }, { floors: "2", area: 105 }, { floors: "3", area: 95 }, { floors: "4", area: 75 }], site: 330, ba: 110, urban: false, zoneTxt: "窯業用地" }).out;
  ok("案例 窯業廠房：第十四章不適用", o.find((x) => x.id === "i269").on === false);
  ok("案例 窯業廠房：第 96-1 條（住宅）不列", o.find((x) => x.id === "e96-1").on === false, o.find((x) => x.id === "e96-1"));
  ok("案例 窯業廠房：容積 385／396 未超過", o.find((x) => x.id === "v-far").lvl === ""); }
{ // 都市計畫住宅區 15 層、高 49.9 m：非高層；有容積獎勵＋移轉；停車扣除機電等
  const r = solve({ group: "H-2", F: 15, B: 3, b1: 5000, floorAreas: [{ floors: "1", area: 2500 }, { floors: "2-14", area: 1900 }, { floors: "15", area: 1800 }], uses: [{ group: "G-3", floors: "1" }, { group: "H-2", floors: "2-15" }], H: 49.9, site: 5600, ba: 2800, bcr: 60, far: 260, units: 320, vfa: 23200, farBonus: 8700, parkEx: 1250 });
  const o = r.out, f = o.find((x) => x.id === "v-far"), p = o.find((x) => x.id === "p59"), a = o.find((x) => x.id === "a167-6");
  ok("案例 15 層 49.9 m：非高層", o.find((x) => x.id === "h227").on === false);
  ok("案例 15 層：有獎勵與移轉時不判超過容積", f.lvl === "" && /23,260/.test(JSON.stringify(f.calc)), f.calc);
  ok("案例 15 層：停車扣除後 151～200 輛", p.on === true && r.c.park.n > 150 && r.c.park.n <= 200, r.c.park.n);
  ok("案例 15 層：無障礙車位列第一類 3／第二類 4", a.on === true && /第一類 3 輛／第二類 4 輛/.test(JSON.stringify(a.calc)), a.calc); }
{ const a = solve({ group: "H-2", F: 12, typ: 1500, urban: true }).out.find((x) => x.id === "a167-6"); ok("無障礙車位：純集合住宅用第一類", /第一類/.test(JSON.stringify(a.calc)), a.calc); }
{ const a = solve({ group: "G-2", F: 3, typ: 300 }).out.find((x) => x.id === "a167-6"); ok("無障礙車位：50 輛以下至少 1 輛", a.on === true && /至少 1 輛/.test(JSON.stringify(a.calc)), a); }
{ // 衛生設備（設備編第 37 條）：店鋪居室 1,252.1㎡ × 0.2 → 251 人 → 男 2、女 7、小 4、洗面盆 7（與事務所檢討一致）
  const w = solve({ group: "B-2", F: 2, typ: 626.05 }).out.find((x) => x.id === "w37");
  ok("衛生設備：其他供公眾使用 251 人 → 2／7／4／7", /男大便器 2、女大便器 7、小便器 4、洗面盆 7/.test(JSON.stringify(w.calc)), w.calc);
  const o = solve({ group: "G-2", F: 1, typ: 1000 }).out.find((x) => x.id === "w37");
  ok("衛生設備：辦公 100 人 → 1／4／2／5", /男大便器 1、女大便器 4、小便器 2、洗面盆 5/.test(JSON.stringify(o.calc)), o.calc);
  const h = solve({ group: "H-2", F: 5, typ: 300, units: 20 }).out.find((x) => x.id === "w37");
  ok("衛生設備：住宅每戶一套", /20 戶/.test(JSON.stringify(h.calc)), h.calc); }
{ const i = solve({ group: "C-2", F: 3, floorAreas: [{ floors: "1-2", area: 3000 }, { floors: "3", area: 4700 }], urban: false, zoneTxt: "丁種建築用地", wsArea: 9300 }).out.find((x) => x.id === "i269");
  ok("作業廠房 9,300 → 裝卸位 2 處、辦公室上限 1,860", /^2 處/.test(i.calc.find((x) => /278/.test(x[0]))[1]) && /1,860 ㎡/.test(i.calc.find((x) => /272/.test(x[0]))[1]), i.calc); }
{ // 第 164 條：5 層集合住宅 H=17、面前道路 6 m、臨接 26.86 m（事務所：H ≤ 3.6(6+D)、As ≤ 80.58）
  const g = solve({ group: "H-2", F: 5, typ: 300, H: 17, Sw: 6, L: 26.86 }).out.find((x) => x.id === "g164h");
  ok("第 164 條：17 m 臨 6 m 路不必退縮；陰影上限 80.58", g.on === true && /不必退縮/.test(JSON.stringify(g.calc)) && /80\.58/.test(JSON.stringify(g.calc)), g.calc);
  const k = solve({ group: "H-2", F: 10, typ: 300, H: 30, Sw: 6 }).out.find((x) => x.id === "g164h");
  ok("第 164 條：30 m 臨 6 m 路，頂部須退 ≥ 2.34 m", k.lvl === "!" && /2\.34 m/.test(JSON.stringify(k.calc)), k.calc);
  const n = solve({ group: "H-2", F: 3, typ: 200, H: 10, Sw: 8 }).out.find((x) => x.id === "g164h");
  ok("第 164 條：10 m 臨 8 m 路不必退縮", n.lvl === "" && /不必退縮/.test(JSON.stringify(n.calc)), n.calc); }
{ // 增建停車（82.09.07 函）：原有已達標準 → 只算增建、不扣免設；原有未達 → 合併計算
  const a = solve({ group: "C-2", F: 2, typ: 900, urban: false, addA: 1740, exA: 3400 }).out.find((x) => x.id === "p59");
  ok("增建：原有 3,400 已達標準，1,740 ÷ 350 → 5 輛", a.on === true && /→ 5 輛/.test(JSON.stringify(a.calc)), a.calc);
  const b = solve({ group: "C-2", F: 1, typ: 900, urban: false, addA: 600, exA: 300 }).out.find((x) => x.id === "p59");
  ok("增建：原有 300 未達 500，合併 (300＋600−500) ÷ 350 → 2 輛", /→ 2 輛/.test(JSON.stringify(b.calc)), b.calc); }
{ const u = solve({ group: "H-2", F: 15, typ: 1900, site: 5600, far: 260, farBonus: 8700, units: 320, ty: true }).out.find((x) => x.id === "t-ud");
  ok("桃園都審：增加容積 60% > 50% → 要都審；機車位 320 輛", u.on === true && /320 輛/.test(JSON.stringify(u.calc)), u); }
{ const g = solve({ group: "H-2", F: 15, typ: 1900, H: 49.9 }).out.find((x) => x.id === "g24");
  ok("第 23、24 條：只列需確認，並標超過", g.on === "info" && /⚠/.test(JSON.stringify(g.calc)), g); }
// 變更使用（附表三、四）
{ const { checkChangeOfUse: cu } = await import("../lib/change-of-use.js");
  const a = await cu({ from_group: "H-2", to_group: "G-3", area: 662 });
  ok("變使 H-2→G-3：☆，只列停車與無障礙；停車由第 2 類變第 1 類要檢討", /「☆」/.test(a) && /共 2 項/.test(a) && /16\. 停車空間/.test(a) && /20\. 無障礙/.test(a) && /設置標準提高/.test(a), a.slice(0, 400));
  const b = await cu({ from_group: "G-3", to_group: "B-3" });
  ok("變使 G-3→B-3：○，附表四 20 項全列", /「○」/.test(b) && /共 20 項/.test(b));
  const c = await cu({ from_group: "C-2", to_group: "C-1" });
  ok("變使 C-2→C-1：△，說明二 8 項", /「△」/.test(c) && /共 8 項/.test(c) && /15\. 最低活載重/.test(c) === false && /附表三免檢討：.*最低活載重/.test(c), c.slice(0, 600));
  const d = await cu({ from_group: "G-2", to_group: "H-2", permit_date: "104.3.2" });
  ok("變使 G-2→H-2：☆ 另加通風、日照採光；102 年後建照不得替代改善", /17\. 通風/.test(d) && /21\. 日照、採光/.test(d) && /不得依身權法/.test(d), d.slice(0, 900));
  const e = await cu({ from_group: "G-2", to_group: "G-3" });
  ok("變使 G-2→G-3：停車同一設置標準免檢討", /同一設置標準/.test(e));
  const f = await cu({ from_group: "H-2", to_group: "D-1", zone: "住宅區", whole_floor: false, main_group: "B-4", city: "桃園市" });
  ok("變使 →D-1：列第 5、7 條、附表五、桃園免變使與防火標章", /第 7 條/.test(f) && /局部變更（第 5 條）/.test(f) && /附表五：D-1 作為 B-4/.test(f) && /防火標章/.test(f));
  ok("變使：類組相同回錯", /不是變更使用類組/.test(await cu({ from_group: "G-2", to_group: "G-2" }))); }
{ const { checkChangeOfUse: cu } = await import("../lib/change-of-use.js");
  // 6 層混合使用大樓 2F 辦公局部改補習班（去識別化數字）
  const g = await cu({ from_group: "G-2", to_group: "D-5", area: 190, floor_area: 460, floors: 6, floor: "2F", whole_floor: false });
  ok("變使 G-2→D-5 2F：※、停車免檢討、求解器以 2F 改 D-5 跑", /「※」/.test(g) && /較低）：免檢討/.test(g) && /2F 改為 D-5、其他層 G-2/.test(g) && /第 95 條二座以上直通樓梯｜觸發/.test(g), g.slice(0, 500));
  const r = solve({ group: "G-2", F: 6, typ: 460, uses: [{ group: "D-5", floors: "2" }] }).c;
  ok("混合用途樓層文字：G-2（1F、3F～6F）、D-5（2F）", r.useTxt === "G-2（1F、3F～6F）、D-5（2F）", r.useTxt); }
{ const { checkChangeOfUse: cu } = await import("../lib/change-of-use.js");
  const a = await cu({ from_group: "H-2", to_group: "G-3", area: 250, floors: 5, floor: "1F", city: "桃園市", use_item: "餐廳" });
  ok("桃園免變：H-2→G-3 1F 餐廳 250㎡（△ 未達 300）得免辦", /得免辦變使/.test(a) && /判斷：符合附表一條件/.test(a), a.slice(0, 600));
  const b = await cu({ from_group: "G-2", to_group: "D-5", area: 190, floors: 6, floor: "2F", city: "桃園市" });
  ok("桃園免變：G-2→D-5 2F（④ 限一層）要辦變使", /不符免辦變使條件/.test(b));
  const c = await cu({ from_group: "H-2", to_group: "D-5", area: 90, floors: 1, floor: "1F", city: "桃園市" });
  ok("桃園免變：H-2→D-5 1F 90㎡ 未填獨棟 → 要再確認", /能否免辦變使要再確認/.test(c) && /填 standalone/.test(c));
  const d = await cu({ from_group: "B-2", to_group: "D-1", area: 400, floors: 3, floor: "2F", city: "桃園市", use_item: "卡拉OK" });
  ok("桃園免變：B-2→D-1 非限定項目 → 不符", /不符免辦變使條件/.test(d));
  const o = await cu({ from_group: "H-2", to_group: "G-3", area: 250, floors: 5, floor: "1F", city: "桃園市", use_item: "餐廳", apply_date: "115.10.01" });
  ok("桃園免變：115.11.11 前申請 → 提醒舊版、改為要再確認", /早於 115\.11\.13/.test(o) && /date="115.10.01"/.test(o) && /能否免辦變使要再確認/.test(o));
  ok("桃園免變：輸出不再寫 108 年函告無效", !/函告無效|1080000619/.test(o)); }
{ const { checkChangeOfUse: cu } = await import("../lib/change-of-use.js");
  const a = await cu({ from_group: "G-2", to_group: "D-1", area: 400 });
  ok("變使停車類別依附表四：D-1 是第三類（G-2 第一類 → 第三類免檢討）", /由第 1 類（設置標準較高）變更為第 3 類/.test(a), a.slice(0, 300)); }
{ const { checkChangeOfUse: cu } = await import("../lib/change-of-use.js");
  const k = await cu({ from_group: "G-3", to_group: "B-1", area: 200, floors: 5, floor: "1F", zone: "住宅區", city: "桃園市" });
  ok("分區：住宅區改 B-1 → 不能變更（第 14 條第 1 項第 10 至 12 款）", /使用分區：⛔/.test(k) && /第 14 條第 1 項第 10 至 12 款/.test(k) && /不能變更使用/.test(k), k.slice(0, 700));
  const t = await cu({ from_group: "H-2", to_group: "B-1", area: 150, floors: 5, floor: "1F", zone: "住宅區", city: "桃園市", use_item: "卡拉OK" });
  ok("分區：住宅區卡拉OK → 第 10 款", /第 14 條第 1 項第 10 款/.test(t));
  const f3 = await cu({ from_group: "G-3", to_group: "B-3", area: 200, floors: 4, floor: "3F", zone: "住宅區", city: "桃園市", use_item: "餐廳" });
  ok("分區：住宅區餐廳在 3F → 不能（限 1F、2F、B1）", /使用分區：⛔/.test(f3) && /第 14 條第 2 項第 3 款/.test(f3));
  const f2 = await cu({ from_group: "G-3", to_group: "B-3", area: 200, floors: 4, floor: "2F", zone: "住宅區", city: "桃園市", use_item: "餐廳" });
  ok("分區：住宅區餐廳 2F 200㎡ → ✓", /使用分區：✓/.test(f2));
  const big = await cu({ from_group: "G-3", to_group: "B-3", area: 800, floors: 4, floor: "1F", zone: "住宅區", use_item: "餐廳", city: "桃園市", road_width: 15 });
  ok("分區：住宅區飲食店 800㎡、15m 路 → 第 15 條例外（要確認）", /使用分區：⚠/.test(big) && /第 15 條/.test(big));
  const ht = await cu({ from_group: "H-2", to_group: "B-4", area: 300, floors: 5, floor: "1F", zone: "住宅區", city: "桃園市", road_width: 8 });
  ok("分區：住宅區旅館、8m 路 → 不能", /使用分區：⛔/.test(ht) && /12m/.test(ht));
  const ind = await cu({ from_group: "C-2", to_group: "H-2", area: 300, floors: 3, floor: "2F", zone: "乙種工業區", city: "桃園市", use_item: "住宅" });
  ok("分區：乙種工業區改住宅 → 不能", /使用分區：⛔/.test(ind) && /第 17 條第 2 項/.test(ind));
  const ind2 = await cu({ from_group: "C-2", to_group: "F-3", area: 300, floors: 3, floor: "1F", zone: "乙種工業區", city: "桃園市", use_item: "幼兒園" });
  ok("分區：乙種工業區幼兒園 → 要市府審查核准", /使用分區：⚠/.test(ind2) && /第 3 款第 12 目/.test(ind2) && /審查核准/.test(ind2));
  ok("分區：沒填 zone → 提示", /填 zone 可檢核/.test(await cu({ from_group: "G-2", to_group: "G-3" })));
  // 公共建築物（第 170 條）
  const p1 = await cu({ from_group: "G-3", to_group: "B-3", area: 350, permit_date: "2005-01-01" });
  ok("公共建築物：B-3 350㎡ 是 → 101 年前建照依替代改善第二點", /第 170 條）：是/.test(p1) && /變更後屬公共建築物：依/.test(p1));
  const p2 = await cu({ from_group: "G-3", to_group: "B-3", area: 120, permit_date: "2005-01-01" });
  ok("公共建築物：B-3 120㎡ 不是 → 免檢討", /第 170 條）：不是/.test(p2) && /不是公共建築物：免檢討/.test(p2));
  const p3 = await cu({ from_group: "G-2", to_group: "H-2", floors: 5 });
  ok("公共建築物：H-2 5 層未填戶數 → 需確認", /第 170 條）：需確認/.test(p3) && /填 units/.test(p3));
  ok("公共建築物：H-2 5 層 60 戶 → 是", /第 170 條）：是/.test(await cu({ from_group: "G-2", to_group: "H-2", floors: 5, units: 60 })));
  ok("公共建築物：C 類不是（103 年函）", /1030044357/.test(await cu({ from_group: "G-2", to_group: "C-2" })));
  ok("公共建築物：求解器 a170 行不再重複列", !/第 170 條公共建築物/.test(p1));
  ok("變使：無障礙不再列求解器的「新建建築物」", !/第 167 條無障礙設施｜/.test(await cu({ from_group: "H-2", to_group: "H-1", area: 150, floors: 4, floor: "1F" })));
  // 消防設備前後比較
  const fd = await cu({ from_group: "G-3", to_group: "B-3", area: 600, floors: 4, floor: "2F" });
  ok("消防：G-3→B-3 600㎡ 由乙類變甲類、新增排煙", /由乙類變為甲類/.test(fd) && /＋ 第 28 條排煙設備/.test(fd), fd.split("消防安全設備（")[1]?.slice(0, 800));
  ok("消防：沒填面積層數 → 提示", /填 area 與 floors 會列出/.test(await cu({ from_group: "G-3", to_group: "B-3" })));
  ok("變使：接受 from／to 參數名", /G-3（.*）→ B-3/.test(await cu({ from: "F-3", to: "B-3" })) === false && /F-3（.*）→ B-3/.test(await cu({ from: "F-3", to: "B-3" }))); }
{ const p = solve({ group: "H-2", F: 5, typ: 500 }).out.find((o) => o.id === "p59");
  ok("停車：(2500−500)÷150=13.33 → 14 輛（說明六零數設一輛）", JSON.stringify(p.calc).includes("14 輛") && p.req.some((x) => /說明六/.test(x)) && p.req.some((x) => /及其零數/.test(x)), p.calc); }
{ const pk = (inp) => solve(inp).out.find((o) => o.id === "p59");
  const d1 = pk({ group: "D-1", F: 2, typ: 500 });   // 1,000㎡：第三類 (1000−500)÷200 = 2.5 → 3
  ok("停車：D-1 健身房預設第三類 → 3 輛，附 99 年函", JSON.stringify(d1.calc).includes("3 輛") && /0990086034/.test(d1.note), d1.calc);
  const d1b = pk({ group: "D-1", F: 2, typ: 500, useItem: "撞球場" });   // 第一類 (1000−300)÷150 = 4.67 → 5
  ok("停車：D-1 撞球場為表列第一類 → 5 輛", JSON.stringify(d1b.calc).includes("5 輛"), d1b.calc);
  const h1 = pk({ group: "H-1", F: 2, typ: 500 });
  ok("停車：H-1 依附表四第三類 → 3 輛", JSON.stringify(h1.calc).includes("3 輛") && /H-1 依附表四為第三類/.test(h1.note), h1.calc);
  ok("停車：H-2 仍第二類 → 4 輛", JSON.stringify(pk({ group: "H-2", F: 2, typ: 500 }).calc).includes("4 輛"));
  ok("停車：I 類依 107 年函按實際用途", /1070808428/.test(pk({ group: "I", F: 1, typ: 200 }).why)); }
{ const c = solve({ group: "B-2", bGroup: "B-1", F: 8, B: 1, b1: 450, typ: 450 }).c;
  ok("地下層用途：B1 改 B-1、地上 B-2 → 複合用途、useTxt 標地下", c.mixed && /B-1（地下B1）/.test(c.useTxt) && c.jiaArea === 8 * 450 + 450, [c.useTxt, c.jiaArea]); }
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
