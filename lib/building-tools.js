// 建築法規求解器：輸入量體（類組、層數、面積…）→ 列出被觸發、要檢討的條文與門檻（check_building），以及下一個門檻在哪（threshold_radar）。
// 規則在 lib/law-solver-engine.js（純 JS，57 條）；函釋與桃園決議在 lib/law-solver-rulings.json（人工讀過全文挑選，照原樣輸出，不自動重挑）。
// 這是設計初期的初篩，不是合法判定。
import { solve, radar, GROUPS, CATS, R } from "./law-solver-engine.js";
import { articleInfo, rulingRevokedNow } from "./openlaw.js";
import { landuseHints, landuseNumbers } from "./landuse-tools.js";
// 用 import 載入，部署時才會被一起打包
import RULINGS from "./law-solver-rulings.json" with { type: "json" };
// 規則核對當時各條文的「本條最近修正日」。條文之後若再修正，該條規則會標「需重新確認」。
import SNAP from "./law-solver-snapshot.json" with { type: "json" };

const NOTE = "【初篩，不是合法判定】求解器依輸入的量體，列出設計初期要檢討的條文與門檻。它不看平面配置；只填標準層面積時各層都當成一樣大（各層不同請用 floor_areas 逐層填）；同一基地有多棟（含共用地下室、裙樓上分棟）時，樓梯、昇降機、區劃要逐棟檢討，請每棟各跑一次、floor_areas 填該棟面積；都市計畫土管、都市設計審議、個案但書與主管機關認定都可能改變結果。每一項都要用 get_article 讀條文、search_rulings 查函釋後才能下結論，正式檢討以主管建築機關審查為準。";
const GROUP_IDS = new Set(GROUPS.map((g) => g[0]));
const num = (v) => (v === undefined || v === null || v === "" || isNaN(+v) ? undefined : +v);

// 都市計畫內沒填建蔽率、容積率時，用桃園土管摘錄自動帶入（標明出處、要核對原檔）
async function fillFromLanduse(args, inp) {
  if (!args.plan_area || !args.zone_name || (inp.bcr != null && inp.far != null)) return null;
  const n = await landuseNumbers({ area: args.plan_area, zone: args.zone_name }).catch(() => null);
  if (!n || n.bcr == null) return n && n.why ? `土管自動帶入建蔽率、容積率失敗：${n.why}` : null;
  const src = `${n.area}・${args.zone_name}：${n.src}；自動擷取，數字要開原檔核對`;
  if (inp.bcr == null) { inp.bcr = n.bcr; inp.bcrSrc = src; }
  if (inp.far == null) { inp.far = n.far; inp.farSrc = src; }
  return `建蔽率 ${n.bcr}%、容積率 ${n.far}% 由土管要點自動帶入（${src}）`;
}
function normalize(a = {}) {
  const errs = [];
  let group = String(a.group || "").toUpperCase().replace(/[－–—_ ]/g, "-").replace(/^([A-I])(\d)$/, "$1-$2");
  if (!group) errs.push("缺少 group（使用類組，如 H-2、G-2、B-2）");
  else if (!GROUP_IDS.has(group)) errs.push(`不認得類組「${a.group}」。可用：${GROUPS.map((g) => `${g[0]} ${g[1]}`).join("、")}`);
  const F = num(a.floors ?? a.F), typ = num(a.typical_floor_area ?? a.typ);
  if (!(F >= 1)) errs.push("缺少 floors（地上層數，至少 1）");
  const anyArea = [...(Array.isArray(a.floor_areas) ? a.floor_areas : []), ...(Array.isArray(a.uses) ? a.uses : [])].some((x) => x && num(x.area) > 0);
  if (!(typ > 0) && !anyArea) errs.push("缺少 typical_floor_area（標準層，也就是最大單層的樓地板面積，㎡），或用 floor_areas 逐層填面積");
  const normG = (g) => String(g || "").toUpperCase().replace(/[－–—_ ]/g, "-").replace(/^([A-I])(\d)$/, "$1-$2");
  const uses = [];
  for (const u of Array.isArray(a.uses) ? a.uses : []) {
    const g = normG(u && u.group);
    if (!GROUP_IDS.has(g)) { errs.push(`uses 裡不認得類組「${u && u.group}」`); continue; }
    if (!String(u.floors ?? "").match(/\d/)) { errs.push(`uses 的 ${g} 沒有填 floors（例如 "1" 或 "2-5"）`); continue; }
    uses.push({ group: g, floors: String(u.floors), ...(num(u.area) ? { area: num(u.area) } : {}) });
  }
  if (!group && uses.length) group = undefined, errs.splice(errs.indexOf("缺少 group（使用類組，如 H-2、G-2、B-2）"), 1);
  const yn = (v) => (v === true || v === "yes" ? "yes" : v === false || v === "no" ? "no" : undefined);
  const inp = {
    group, F, typ, B: num(a.basements ?? a.B) ?? 0, site: num(a.site_area ?? a.site), H: num(a.height ?? a.H), units: num(a.units),
    vfa: num(a.far_floor_area ?? a.vfa), tfa: num(a.total_floor_area ?? a.tfa), ba: num(a.building_area ?? a.ba), b1: num(a.basement_floor_area ?? a.b1), parkEx: num(a.parking_exclude ?? a.parkEx), wsArea: num(a.workshop_area ?? a.wsArea), Sw: num(a.road_width ?? a.Sw), L: num(a.frontage ?? a.L), addA: num(a.addition_area ?? a.addA), exA: num(a.existing_area ?? a.exA), farBonus: num(a.far_bonus ?? a.farBonus),
    bcr: num(a.max_coverage ?? a.bcr), far: num(a.max_far ?? a.far), zone: /商|com/i.test(a.zone || "") ? "com" : "res", zoneTxt: [a.zone, a.zone_name, a.land_use].filter(Boolean).join(" "), ty: /桃園/.test(String(a.city || "")) || !!a.plan_area, urban: a.urban_plan === false || a.urban === false ? false : true,
    fireproof: a.fireproof === false ? false : undefined, pub: yn(a.public_use ?? a.pub),
    uses: uses.length ? uses : undefined, floorAreas: (Array.isArray(a.floor_areas) ? a.floor_areas : []).filter((x) => x && String(x.floors ?? "").match(/\d/) && num(x.area)).map((x) => ({ floors: String(x.floors), area: num(x.area) })), kw: num(a.power_kw ?? a.kw), ind: /倉|warehouse/i.test(a.industrial || "") ? "warehouse" : undefined,
  };
  for (const k of Object.keys(inp)) if (inp[k] === undefined) delete inp[k];
  return { inp, errs };
}

// 逐層面積摘要：連續相同面積的樓層合併（1F 420、2F～9F 350、10F 200）
function faTxt(c) {
  const segs = []; for (let f = 1; f <= c.F; f++) { const a = c.A(f), last = segs[segs.length - 1]; if (last && last.a === a) last.b = f; else segs.push({ a, s: f, b: f }); }
  return segs.map((x) => `${x.s === x.b ? x.s + "F" : `${x.s}F～${x.b}F`} ${x.a}㎡`).join("、");
}
function summary(c) {
  const est = [];
  if (c.Hest) est.push(`高度未填，以 ${c.H} m 估算（每層 3.3 m）`);
  if (c.vfaEst) est.push("容積樓地板未填，以地上樓地板估算");
  return [
    `本案：${c.mixed ? "混合用途 " + c.useTxt : `${c.g}（${(GROUPS.find((g) => g[0] === c.g) || [])[1] || ""}）`}、地上 ${c.F} 層、地下 ${c.B} 層、${c.faGiven ? `逐層面積 ${faTxt(c)}（最大單層 ${c.typ} ㎡）` : `標準層 ${c.typ} ㎡（各層視為相同）`}${c.site != null ? `、基地 ${c.site} ㎡` : ""}${c.units != null ? `、${c.units} 戶` : ""}`,
    `推算：地上樓地板 ${Math.round(c.tfa)} ㎡、地下合計 ${Math.round(c.bsum)} ㎡、總樓地板 ${Math.round(c.total)} ㎡、高度 ${c.H} m${c.Hest ? "（估）" : ""}；${c.high ? "高層建築物" : "非高層建築物"}`,
    `防火構造：${c.fpNeed ? "應為防火構造（第 69 條）" : "第 69 條未要求，可做非防火構造"}${c.fpConflict ? "；你填了非防火構造，與第 69 條矛盾，以下以防火構造檢討" : ""}——${c.fpWhy}`,
    `供公眾使用：${c.pubSrc === "輸入" ? (c.pub ? "是（依輸入）" : "否（依輸入）") : c.pub ? "是" : c.pubUnsure ? "需確認" : "否"}——依內政部 99.03.03 台內營字第 0990801045 號令「供公眾使用建築物之範圍」：${c.pubList.map((p) => `${c.mixed ? p.g + "：" : ""}${p.why}`).join("；")}${c.pubUnsure ? "（以非供公眾使用試算，確認後可用 public_use 指定）" : ""}`,
    `第 170 條公共建築物（無障礙）：${c.pubBldg ? "是或可能是" : "否"}；消防場所分類：${c.klassTxt}`,
    c.anyG("C") ? `C 類以${c.ind === "warehouse" ? "倉庫" : "工廠"}檢討${c.ind === "warehouse" ? "" : "（倉庫請填 industrial=\"倉庫\"）"}` : "",
    c.mixed ? "混合用途：第 69、90、93、95、96-1、99、59 條與消防第 15、17、19 條已逐用途或逐層檢討；其他條文以主要類組 " + c.g + " 檢討，請對照各用途。" : "",
    est.length ? `注意：${est.join("；")}。填入實際數值會更準。` : "",
  ].filter(Boolean);
}

const artKey = (law, art) => `${law}|${art}`;
async function liveInfo(out) {
  const keys = [...new Set(out.map((o) => artKey(o.law, o.art)))];
  const m = new Map();
  await Promise.all(keys.map(async (k) => { const [law, art] = k.split("|"); try { m.set(k, await articleInfo(law, art)); } catch { m.set(k, null); } }));
  return m;
}
function drift(o, info) {
  const snap = SNAP.articles[artKey(o.law, o.art)];
  if (!info) return "⚠ 目前讀不到這條條文，無法確認規則是否仍與現行條文一致";
  if (!info.exists) return "⚠ 現行法規找不到這一條（可能已刪除或改條號），這條規則需重新確認，先不要採用";
  if (snap === undefined) return null;
  if ((info.amended || null) !== (snap || null)) return `⚠ 條文已於 ${info.amended || "？"} 修正，晚於規則核對時的版本（${snap || "無修正紀錄"}）：這條規則的門檻需重新確認，請以 get_article 讀到的現行條文為準`;
  return null;
}

async function ruleBlock(o, info) {
  const cite = `${info?.name || o.law} 第 ${o.art} 條`;
  const tag = o.on === "info" ? "【需確認，不是定論】" : o.verify ? "【觸發；細節需對照條文附表】" : "";
  const L = [`■ ${o.title}｜${cite}${tag}`];
  if (o.why) L.push(`  本案與門檻：${o.why}`);
  for (const [a, b] of o.calc || []) L.push(`  ・${a}：${b}`);
  if ((o.req || []).length) L.push(`  要求：${o.req.join("；")}`);
  if (o.note) L.push(`  注意：${o.note}`);
  const d = drift(o, info); if (d) L.push("  " + d);
  const rr = RULINGS[o.id];
  if (rr) {
    for (const p of rr.pick || []) {
      const rev = p.id ? await rulingRevokedNow(p.id).catch(() => null) : null;
      L.push(`  函釋（第 2 級）：${p.no}${p.id ? `［get_ruling id="${p.id}"］` : "（本庫未收錄）"}${p.gist}${p.stale ? `（${p.note || `早於條文 ${p.amendAfter} 修正，引用前對照現行條文`}）` : ""}${rev || p.revoked ? `　⚠ ${rev || "已停止適用"}，不能當依據` : ""}`);
    }
    for (const t of rr.ty || []) L.push(`  桃園決議（第 3 級，只適用桃園市）：${t.name}・${t.no}・主持 ${t.chair}［get_minutes id="${t.id}" page=${t.page}］${t.gist}${t.rel ? `　→ ${t.rel}` : ""}`);
    if (rr.n) L.push(`  （本條共有 ${rr.n} 則國土署函釋${rr.nStale ? `，其中 ${rr.nStale} 則早於條文修正` : ""}；上面是人工挑選的重點，完整清單用 search_rulings law="${info?.name || o.law}" article="${rr.art}"）`);
  }
  L.push(`  讀條文：get_article law="${o.law}" articles=["${o.art}"]${info?.amended ? `（本條最近修正 ${info.amended}）` : ""}${info?.url ? `　${info.url}` : ""}`);
  return L.join("\n");
}

export async function checkBuilding(args = {}) {
  const { inp, errs } = normalize(args);
  if (errs.length) return `輸入不完整，無法檢討：\n- ${errs.join("\n- ")}`;
  const lu = await fillFromLanduse(args, inp);
  const { c, out } = solve(inp);
  const info = await liveInfo(out);
  const on = out.filter((o) => o.on === true), maybe = out.filter((o) => o.on === "info"), off = out.filter((o) => !o.on);
  const L = [NOTE, "", ...summary(c), "", `結果：觸發 ${on.length} 項、需確認 ${maybe.length} 項、未觸發 ${off.length} 項（共 ${R.length} 條規則；規則核對基準 ${SNAP.verified}）`];
  const want = String(args.category || "").trim();
  const cats = want ? CATS.filter((x) => x.includes(want) || want.includes(x)) : CATS;
  if (want && !cats.length) L.push("", `沒有「${want}」這個分類，改列全部。分類：${CATS.join("、")}`);
  if (want && cats.length) L.push(`（只詳列：${cats.join("、")}；其他分類只列標題，拿掉 category 可看全部）`);
  const detail = new Set(cats.length ? cats : CATS);
  for (const cat of CATS) {
    const xs = on.filter((o) => o.cat === cat);
    if (xs.length && !detail.has(cat)) { L.push("", `════ ${cat}（${xs.length} 項，未展開）════`, ...xs.map((o) => `- ${o.title}（第 ${o.art} 條）`)); continue; }
    if (!xs.length) continue;
    L.push("", `════ ${cat}（${xs.length} 項）════`);
    for (const o of xs) L.push(await ruleBlock(o, info.get(artKey(o.law, o.art))));
  }
  if (maybe.length) {
    L.push("", "════ 需確認（資訊不足或要對照附表，不能當成「要」或「不要」）════");
    for (const o of maybe) L.push(await ruleBlock(o, info.get(artKey(o.law, o.art))));
  }
  if (off.length) {
    L.push("", "════ 未觸發（依輸入未達門檻；量體一改就可能觸發，見 threshold_radar）════");
    for (const o of off) { const i = info.get(artKey(o.law, o.art)); const d = drift(o, i); L.push(`- ${o.title}（${i?.name || o.law} 第 ${o.art} 條）：${o.why || "未達門檻"}${d ? "　" + d : ""}`); }
  }
  if (args.plan_area) { L.push("", "════ 桃園市土管要點（線索，不是判定）════"); if (lu) L.push(lu); for (const x of await landuseHints({ area: args.plan_area, zone: args.zone_name }).catch((e) => [`土管查詢失敗：${e.message}`])) L.push(x); }
  L.push("", "沒有涵蓋：都市計畫土管（桃園用 search_landuse／landuse_points）、變更使用、桃園以外縣市的都市設計規定、日照、山坡地、室內裝修審查、結構與設備細部、消防設備的完整檢討（甲類場所各層面積、無開口樓層等）。");
  return L.join("\n");
}

export async function thresholdRadar(args = {}) {
  const { inp, errs } = normalize(args);
  if (errs.length) return `輸入不完整，無法檢討：\n- ${errs.join("\n- ")}`;
  await fillFromLanduse(args, inp);
  const { c } = solve(inp);
  const items = radar(inp);
  const names = new Map();
  const nm = async (law) => { if (!names.has(law)) names.set(law, (await articleInfo(law, "1").catch(() => null))?.name || law); return names.get(law); };
  const K = { add: "＋多出", drop: "－少掉", chg: "～改變" };
  const L = [NOTE, "", ...summary(c), "", "門檻雷達：只改一個量（其餘不變），看下一個門檻會讓哪些要求多出、少掉或改變等級。「改變」是指仍要檢討，但標準不同（例如梯的種類、座數、時效）。"];
  if (!items.length) L.push("", "附近沒有會改變結果的門檻。");
  for (const it of items) {
    L.push("", `▶ ${it.label}（${it.dir === "up" ? "往上" : "往下"}）：`);
    for (const ch of it.ch) L.push(`  ${K[ch.kind]}　${ch.title}（${await nm(ch.law)} 第 ${ch.art} 條）`);
  }
  L.push("", "要看某一種量體的完整要求，用 check_building 帶入那組數字。雷達掃地上與地下層數、標準層面積、高度（20、31、50、90、100 m）、五層以下集合住宅的 50 戶、基地面積（150、300、1,500、20,000㎡）的門檻；高度未填時用每層 3.3 m 估算。");
  return L.join("\n");
}

// 測試與快照用
export const _solver = { solve, radar, R, RULINGS, SNAP, artKey };
