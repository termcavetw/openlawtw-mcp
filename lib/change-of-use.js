// 變更使用類組初篩（check_change_of_use）：依「建築物使用類組及變更使用辦法」附表三（變更使用原則表）、
// 附表四（各類組規定項目檢討標準）、附表五（主從用途關係）與第 5～8 條，列出要檢討的項目與標準；
// 有填層數、面積時，另用求解器算出變更後類組在各項目的門檻。桃園市另列免辦理變更使用執照管理辦法。
import DATA from "./change-of-use-data.json" with { type: "json" };
import { solve, GROUPS } from "./law-solver-engine.js";
import { attachmentData, getDocument } from "./openlaw.js";

const GN = Object.fromEntries(GROUPS);
const num = (v) => (v === undefined || v === null || v === "" || isNaN(+v) ? undefined : +v);
const normG = (g) => String(g || "").toUpperCase().replace(/[－–—_ ]/g, "-").replace(/^([A-I])(\d)$/, "$1-$2");
const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString("en-US");
const LAW = "D0070141";

// 附表三說明：各符號要檢討的附表四項次
const BASE = [1, 2, 3, 4, 5, 7, 16, 20];               // 說明二（△）
const CROSS = [6, 8, 9, 10, 11, 12, 13, 14, 15];       // 說明三（※）另加
const FULL = [17, 18, 19];                             // 說明四（○）另加
const SYM = {
  "△": "同類跨組變更（B 類除外）：檢討說明二的項目",
  "※": "跨類變更或 B 類跨組變更：檢討說明二、三的項目",
  "○": "檢討說明二、三、四的項目",
  "◎": "依建築技術規則全部檢討",
  "☆": "只檢討停車空間與無障礙設施（說明二），其餘免檢討",
};
function itemsOf(sym, to) {
  let it = sym === "☆" ? [16, 20] : sym === "△" ? BASE : sym === "※" ? [...BASE, ...CROSS] : [...BASE, ...CROSS, ...FULL];
  if (sym === "◎") it = Array.from({ length: (DATA.t4[to] || []).length }, (_, i) => i + 1);
  if (to.startsWith("H") && sym !== "◎" && sym !== "△") it = [...it, 17, 21];   // 變更為 H 類：通風、日照、採光
  if (to === "H-1" && sym !== "◎" && sym !== "△") it = [...it, 22];             // H-1 宿舍：防音
  return [...new Set(it)].filter((i) => DATA.t4[to] && DATA.t4[to][i - 1]).sort((a, b) => a - b);
}
// 附表四項次 → 求解器規則（顯示變更後類組在該項的門檻）
const RULE = { 1: ["z79", "z79-2"], 3: ["z88"], 4: ["e93"], 5: ["e108"], 6: ["g33"], 7: ["fp69"], 8: ["e90"], 10: ["e95"], 12: ["e92"], 13: ["e96"], 16: ["p59"], 18: ["e99"], 19: ["p141"], 20: ["a167", "a170"] };

// 建築技術規則設計施工編第 59 條分類（與求解器相同）
// 第 59 條類別以附表四各類組「停車空間」項目寫的類別為準（例如 D-1、H-1 是第三類），與新建時依用途判斷不一定相同
const PK = { 1: { f: 300, ru: 150, rn: 250 }, 2: { f: 500, ru: 150, rn: 300 }, 3: { f: 500, ru: 200, rn: 350 }, 4: { f: 500, ru: 250, rn: 350 } };
const parkClass = (g) => { const it = (DATA.t4[g] || []).find((x) => x.n === "停車空間"); const m = it && it.s.match(/第五十九條第([一二三四])類/); const k = m ? "一二三四".indexOf(m[1]) + 1 : null; return k ? { k, ...PK[k] } : null; };
const need = (p, A, urban) => (A > p.f ? Math.ceil((A - p.f) / (urban ? p.ru : p.rn)) : 0);

function rocDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})/); if (!m) return null;
  let y = +m[1]; if (y < 1000) y += 1911;
  return y * 10000 + +m[2] * 100 + +m[3];
}

// 桃園市一定規模以下建築物免辦理變更使用執照管理辦法第 3 條第 5 項（115.11.11 修正）：變更後屬下列項目者，要防火標章或公安申報後才能使用
const TY_CERT = {   // 115.11.11 修正後第 3 條第 5 項
  "D-1": "室內兒童樂園、健身房、室內操練場、室內體育場所、室內高爾夫球練習場、健身休閒中心",
  "D-2": "會議廳、展示廳、圖書館、文康中心、社教館、集會堂（場）、社區（里）活動中心",
  "D-5": "補習（訓練）班、文康機構、兒童課後照顧服務中心",
  "F-3": "兒童及少年安置教養機構、幼兒園（兼辦國民小學兒童課後照顧服務）、托嬰中心",
  "G-2": "身心障礙者就業服務機構",
  "G-3": "診所、動物收容、寵物繁殖或買賣場所",
  "H-1": "民宿（客房數六間以上）、機構住宿式或社區式服務（日間照顧、團體家屋、小規模多機能服務）的長期照顧服務機構、社區式日間照顧及重建服務場所",
  "H-2": "民宿（客房數五間以下）、社區式服務的小型長照機構、小型安養機構、身心障礙者職業訓練機構、日間型與住宿型精神復健機構、社區式日間照顧及重建服務、社區式身心障礙者日間服務場所",
};

// 桃園市免辦理變更使用執照管理辦法附表一（openlawtw 人工逐格整理的 transcription）：原類組 → 新類組的符號與條件判斷
const TY_LAW = "桃園市-GL001285";
const FOOD = /餐廳|飲食|飲料|理髮|按摩|美容/;
const D1_OK = /兒童樂園|健身房|操練場|體育場所|高爾夫|健身休閒/, D2_OK = /會議廳|展示廳|圖書館|文康中心|集會堂|活動中心/;
async function tyExempt(from, to, a, A, fno) {
  let R; try { R = await attachmentData(TY_LAW); } catch { R = null; }
  const att = R && R.attachments.find((x) => /附表一/.test(x.title) && x.transcription);
  if (!att) return { lines: ["■ 附表一（免辦變使的規模條件）讀不到，請開原檔：https://law.tycg.gov.tw/Download.ashx?FileID=7858&id=GL001285&type=LAW"] };
  const m = new Map();
  for (const l of att.transcription.text.split("\n")) { const x = l.match(/^(\S+) → (\S+)：(\S)(?:（(.*)）)?$/); if (x) m.set(`${x[1]}>${x[2]}`, { s: x[3], why: x[4] || "" }); }
  const e = m.get(`${from}>${to}`);
  const L = [`■ 附表一：${from} → ${to}「${e ? e.s : "表未列"}」${e && e.why ? `：${e.why}` : ""}［get_document document="桃園市一定規模以下建築物免辦理變更使用執照管理辦法" section="附表一 ${from} → ${to}"］`];
  if (!e) return { lines: L };
  const item = String(a.use_item || ""), f1 = fno === 1, need = [];
  let ok = null; // true 符合、false 不符、null 要確認
  const lt = (n) => (A == null ? null : A < n);
  switch (e.s) {
    case "╳": ok = false; if (to === "H-2") need.push("說明二：已變更為他種類組、擬恢復為原領使照核定的 H-2，且使用樓地板面積未達 300㎡ 者免辦變使"); break;
    case "○": ok = fno == null || A == null ? null : f1 && A < 300; break;
    case "◎": ok = fno == null || A == null ? null : f1 && A < 200; need.push("限汽（機）車修理（保養）場、洗車場"); if (!/修理|保養|洗車/.test(item)) ok = ok === false ? false : null; break;
    case "①": ok = fno == null || A == null ? null : f1 && A < 100; if (/^C/.test(from)) need.push("C-1、C-2 以工廠依消防法兼作 I 類公共危險物品儲存場所為限"); break;
    case "②": ok = lt(200); need.push("限附建未達 200㎡ 的防空避難設備兼作他種用途的臨時使用"); break;
    case "③": ok = lt(300); break;
    case "④": ok = fno == null || A == null ? null : f1 && A < 200; if (ok) { if (a.standalone === true) ok = true; else { ok = a.standalone === false ? false : null; need.push("限第一層使用之獨棟或他棟建築物（填 standalone）"); } } break;
    case "⑤": ok = lt(500); if (to === "D-1") { need.push("D-1 限室內兒童樂園、健身房、室內操練場、室內體育場所、室內高爾夫球練習場、健身休閒中心"); if (ok && !D1_OK.test(item)) ok = item ? false : null; }
      if (to === "D-2") { need.push("D-2 限會議廳、展示廳、圖書館、文康中心、集會堂（場）、社區（里）活動中心"); if (ok && !D2_OK.test(item)) ok = item ? false : null; } break;
    case "※": { const lim = f1 ? 500 : fno >= 2 && fno <= 5 ? 300 : null; ok = A == null || fno == null ? null : lim != null && A <= lim; if (ok) { ok = null; need.push("樓梯寬度 1.2 m 以上、分間牆及室內裝修材料符合建築技術規則"); } break; }
    case "△": { const lim = FOOD.test(item) ? 300 : 500; ok = A == null ? null : A < lim; if (!item) { need.push("餐廳、飲食店、飲料店、理髮、按摩、美容院等未達 300㎡，其他使用項目未達 500㎡（填 use_item）"); if (A != null && A >= 300 && A < 500) ok = null; } break; }
    default: ok = null;
  }
  const verdict = ok === true ? "符合附表一條件：得免辦理變更使用執照" : ok === false ? "不符附表一條件：要辦理變更使用執照（建築法第 73 條第 2 項）" : "要再確認";
  L.push(`  判斷：${verdict}${A != null ? `（變更範圍 ${fmt(A)} ㎡${fno != null ? `、${fno > 0 ? fno + "F" : "地下層"}` : ""}）` : "（填 area、floor 可直接判斷）"}`);
  for (const n of need) L.push(`  條件：${n}`);
  L.push("  說明一：以一戶或使用執照已核准、有 1 小時防火時效防火牆或防火門窗區劃的單元申請");
  if (from === "H-2" && to !== "H-2") L.push("  說明四：使照領得滿 30 年的 H-2 住宅或集合住宅，地上二層以上要先附結構承載計算書與耐震能力初步評估報告書報市府備查，才可依本表變更");
  return { lines: L, ok };
}

/* ───── 使用分區容許使用（第 3 條）───── */
const ZID = "桃園市-GL001628", ZLN = "都市計畫法桃園市施行細則";
const LANDCAT = /(甲種建築用地|乙種建築用地|丙種建築用地|丁種建築用地|農牧用地|林業用地|養殖用地|鹽業用地|礦業用地|窯業用地|交通用地|水利用地|遊憩用地|古蹟保存用地|生態保護用地|國土保安用地|殯葬用地|特定目的事業用地|海域用地)/;
function zoneKind(z, urban) {
  const s = String(z || ""); if (!s) return null;
  if (urban === false || LANDCAT.test(s) || /特定農業區|一般農業區|鄉村區|山坡地保育區|森林區|河川區|特定專用區/.test(s)) return "non";
  if (/乙種工業|乙工/.test(s)) return "ind2"; if (/甲種工業|甲工/.test(s)) return "ind1"; if (/工業/.test(s)) return "ind";
  if (/住宅|^住|住[一二三四五\d]/.test(s)) return "res"; if (/商業|^商|商[一二三四五\d]/.test(s)) return "com";
  if (/農業/.test(s)) return "agr"; if (/保護|保存/.test(s)) return "prot"; return "other";
}
const ZSYN = [[/餐|飲食|小吃|咖啡|飲料|冰/, ["零售", "營業", "餐飲"]], [/辦公|事務所|公司/, ["辦公", "營業"]], [/補習|教育|課後/, ["教育", "課後"]], [/幼兒園|托嬰/, ["幼兒園", "托嬰"]],
  [/旅館|飯店|民宿/, ["旅館", "民宿", "營業"]], [/工廠|製造|加工/, ["工業", "工廠"]], [/倉庫|倉儲/, ["倉儲"]], [/長照|護理|安養|養護|老人/, ["長期照顧", "護理", "老人福利"]],
  [/寺|廟|教會|教堂|宗教/, ["宗教"]], [/住宅|住家|宿舍/, ["住宅", "宿舍"]], [/診所|醫院|醫療/, ["醫療"]], [/零售|商店|賣場|超商|便利/, ["零售"]], [/修理|修車|保養|洗車/, ["修理"]]];
const isG = (to, re) => re.test(to);
async function zoneCheck(a, to, A, fl) {
  const k = zoneKind(a.zone, a.urban_plan === false ? false : undefined); if (!k) return null;
  const u = String(a.use_item || ""), rw = num(a.road_width), L = [], z = String(a.zone);
  const ty = /桃園/.test(String(a.city || ""));
  const up = fl.up, bs = fl.b, flKnown = up != null || bs != null;
  const on = (ok, txt) => (!flKnown ? `；要確認樓層：${txt}` : ok ? `；本案 ${up != null ? up + "F" : "B" + bs} 符合（${txt}）` : `；本案 ${up != null ? up + "F" : "B" + bs} 不符（${txt}）`);
  const r = { lines: L, v: null, head: "" };
  const cite = (art) => `${ZLN}第 ${art}（get_article law="${ZID}" articles=["${String(art).split(" ")[0].replace(/條.*/, "")}"]）`;
  if (k === "non") {
    const cat = (z.match(LANDCAT) || [])[1];
    L.push(`■ 非都市土地${cat ? `（${cat}）` : ""}：變更後用途要是非都市土地使用管制規則第 6 條附表一的容許使用項目，且依附表一附帶條件經目的事業主管機關等同意（容許使用）後才能申請變更使用；不屬容許使用的要先變更編定`);
    if (cat) {
      let txt = ""; try { txt = await getDocument({ document: "非都市土地使用管制規則", section: `附表一 ${cat}` }) || ""; } catch {}
      const rows = txt.split("\n").filter((l) => l.includes("｜") && l.includes(cat));
      const keys = [u, ...(ZSYN.find(([re]) => re.test(u)) || [null, []])[1]].filter(Boolean);
      const col = (l, i) => l.split("｜")[i] || "";
      let hit = u ? rows.filter((l) => keys.some((w) => col(l, 2).includes(w))) : [];
      if (u && !hit.length) hit = rows.filter((l) => keys.some((w) => col(l, 1).includes(w)));
      hit = hit.slice(0, 6);
      if (hit.length) { r.v = "cond"; L.push(`  附表一 ${cat} 可能對應的細目（關鍵字：${keys.join("、")}；對應是否正確要自己判斷）：`, ...hit.map((l) => "  ・" + l.replace(/^[^｜]*｜/, "").replace(/｜+$/, "").slice(0, 160))); r.head = `非都市土地 ${cat}：附表一有可能對應的容許使用細目，要確認附帶條件並辦理容許使用`; }
      else if (u && rows.length) { L.push(`  附表一 ${cat} 共 ${rows.length} 列，沒有找到含「${keys.join("、")}」的細目：可能不屬容許使用（或細目名稱不同），請讀全表`); r.head = `非都市土地 ${cat}：附表一沒找到對應「${u}」的細目，可能不能作此使用，要逐列核對`; }
      L.push(`  全表：get_document document="非都市土地使用管制規則" section="附表一 ${cat}"`);
    } else L.push('  請填使用地類別（如 zone="甲種建築用地"），會列出附表一的對應細目');
    return r;
  }
  if (!ty) { L.push(`■ 使用分區「${z}」：本工具只內建桃園市的都市計畫法施行細則；其他縣市請查該縣市的施行細則（find_law query="都市計畫法 施行細則" region=縣市）與細部計畫土管要點`); return r; }
  const ban = (art, why) => { r.v = "ban"; r.head = `⛔ ${z}不得作此使用：${why}（${ZLN}第 ${art}）→ 不能變更使用`; L.push(`■ ⛔ ${why}：${cite(art)}`); };
  const cond = (art, why) => { if (r.v !== "ban") r.v = "cond"; if (!r.head) r.head = `⚠ ${z}：${why}（${ZLN}第 ${art}）`; L.push(`■ ⚠ ${why}：${cite(art)}`); };
  const ok = (why, art) => { if (!r.v) r.v = "ok"; if (!r.head) r.head = `✓ ${z}：${why}${art ? `（${ZLN}第 ${art}）` : ""}`; L.push(`■ ✓ ${why}${art ? `：${cite(art)}` : ""}`); };
  const fz = (art, why, fok) => (!flKnown ? cond(art, why) : fok ? ok(why, art) : ban(art, why));
  if (k === "res") {
    const RES = [
      [/舞廳|舞場|酒家|酒吧|酒廊|特種咖啡|三溫暖|一般浴室|性交易/, "14 條第 1 項第 11 款", "住宅區不得作舞廳、酒家、酒吧、特種咖啡茶室、三溫暖、一般浴室等"],
      [/飲酒店|夜店|啤酒屋/, "14 條第 1 項第 12 款", "住宅區不得作飲酒店、夜店"],
      [/加油|加氣站/, "14 條第 1 項第 5 款", "住宅區不得作加油（氣）站"],
      [/殯葬|禮儀|壽具/, "14 條第 1 項第 8 款", "住宅區不得作殯葬服務業、壽具店（僅供辦公室、聯絡處所且不交易、儲存、展示貨品者除外）"],
      [/電子遊戲|視聽歌唱|KTV|卡拉|錄影節目|MTV|戲院|電影|歌廳|保齡球|動物園|機械式遊樂|攤販集中|零售市場/, "14 條第 1 項第 10 款", "住宅區不得作戲院、電影、視聽歌唱、電子遊戲場、歌廳、保齡球館、攤販集中場、零售市場等"],
    ];
    let hit = RES.find(([re]) => re.test(u));
    if (!hit && !u && isG(to, /^B-1$/)) hit = [null, "14 條第 1 項第 10 至 12 款", "B-1（視聽歌唱、電子遊戲場、舞廳、酒家、三溫暖等）在住宅區都屬禁止使用"];
    if (hit) ban(hit[1], hit[2]);
    else if (/旅館|飯店|汽車旅館|駕駛訓練/.test(u) || (!u && to === "B-4")) {
      if (rw != null && rw >= 12) cond("14 條第 1 項第 10 款但書", `住宅區原則不得作旅館、汽車駕駛訓練場；面臨 ${rw}m ≥12m 道路、經目的事業主管機關審查核准且不妨礙居住安寧、公共安全與衛生者除外`);
      else ban("14 條第 1 項第 10 款", `住宅區不得作旅館、汽車駕駛訓練場${rw != null ? `（但書要面臨 12m 以上道路，本案 ${rw}m）` : "（但書：面臨 12m 以上道路且經目的事業主管機關審查核准；填 road_width 可判斷）"}`);
    } else if (/釣蝦|釣魚/.test(u)) {
      if (rw != null && rw >= 12) cond("14 條第 1 項第 10 款但書、第 2 項第 1 款", `室內釣蝦（魚）場面臨 ${rw}m ≥12m 道路、不妨礙居住安寧者得設，限第一層${on(up === 1, "限 1F")}`);
      else ban("14 條第 1 項第 10 款", "住宅區不得作室內釣蝦（魚）場（但書要面臨 12m 以上道路）");
    } else if (/汽車.*(修|保養)|機車.*(修|保養)|修車|汽修|機車行/.test(u)) {
      const moto = /機車/.test(u), need = moto ? 8 : 10;
      if (rw != null && rw >= need) cond("14 條第 1 項第 3 款第 10 目但書、第 2 項第 2 款", `${moto ? "機車修理業面臨 8m" : "汽車清潔、潤滑、檢查、調整、維護、總成更換、車輪定位、電機業務面臨 10m"}以上道路者得設（本案 ${rw}m），限第一層及地下一層${on(up === 1 || bs === 1, "限 1F、B1")}；一般汽車修理（鈑噴）不在但書內`);
      else ban("14 條第 1 項第 3 款第 10 目", `住宅區不得作汽車或機車修理業（但書：汽車保養類要面臨 10m、機車修理要面臨 8m 以上道路${rw != null ? `，本案 ${rw}m` : "；填 road_width 可判斷"}）`);
    } else if (/自助儲物|迷你倉/.test(u)) {
      const okc = rw != null && rw >= 12 && (A == null || A < 1000);
      (okc ? cond : ban)("14 條第 1 項第 23 款", `住宅區自助儲物空間要面臨 12m 以上道路、總樓地板未達 1,000㎡、限 1F 及 B1、獨立出入口${on(up === 1 || bs === 1, "限 1F、B1")}`);
    } else if (/證券|期貨|金融|銀行|票券|信用卡/.test(u) || (!u && to === "G-1")) {
      if (A != null && A > 2000) ban("14 條第 1 項第 14、15 款", `住宅區不得作總樓地板超過 2,000㎡ 的證券、期貨、金融業分支機構（本案 ${fmt(A)}㎡）`);
      else cond("14 條第 2 項第 4 款", `住宅區證券、期貨、金融業分支機構要面臨 12m 以上道路${rw != null ? `（本案 ${rw}m${rw >= 12 ? "" : "，不符"}）` : ""}、限 1F～3F 及 B1、要有獨立出入口${on((up != null && up <= 3) || bs === 1, "1F～3F、B1")}`);
      if (rw != null && rw < 12 && r.v !== "ban") { r.v = "ban"; r.head = `⛔ ${z}：證券、期貨、金融業要面臨 12m 以上道路（本案 ${rw}m）→ 不能變更使用`; }
    } else if (/餐|飲食|小吃|飲料|咖啡|冰|茶/.test(u) || (!u && to === "B-3")) {
      if (A != null && A > 600) {
        const e15 = rw != null && rw >= 15 && A <= 900;
        (e15 ? cond : ban)(e15 ? "15 條" : "14 條第 1 項第 13 款", e15 ? `飲食店超過 600㎡：第 15 條例外（主要出入口面臨 15m 以上道路、限 1F、2F、B1、停車加倍附設、與相鄰基地留 4m 以上空地，上限 900㎡）` : `住宅區不得作總樓地板超過 600㎡ 的大型飲食店（本案 ${fmt(A)}㎡；第 15 條例外要面臨 15m 以上道路且上限 900㎡）`);
      } else {
        const fok = up === 1 || up === 2 || bs === 1;
        fz("14 條第 2 項第 3 款", `住宅區飲食店（${A != null ? `${fmt(A)}㎡ ≤600㎡` : "≤600㎡"}）限建築物第一層、第二層及地下一層${on(fok, "1F、2F、B1")}`, fok);
      }
    } else if (/理髮|美容|美髮|美甲|按摩|指壓|民俗調理|腳底/.test(u)) {
      const fok = up === 1 || up === 2 || bs === 1;
      fz("14 條第 2 項第 3 款", `住宅區美容美髮服務業、民俗調理業限第一層、第二層及地下一層${on(fok, "1F、2F、B1")}`, fok);
    } else if (/商場|商店|零售|賣場|超市|百貨|量販|便利|超商|門市|店/.test(u) || (!u && to === "B-2")) {
      if (A != null && A > 1000) {
        const e15 = rw != null && rw >= 15 && A <= 1500;
        (e15 ? cond : ban)(e15 ? "15 條" : "14 條第 1 項第 13 款", e15 ? "大型商場（店）超過 1,000㎡：第 15 條例外（面臨 15m 以上道路、限 1F、2F、B1、停車加倍、留 4m 空地，上限 1,500㎡）" : `住宅區不得作總樓地板超過 1,000㎡ 的大型商場（店）（本案 ${fmt(A)}㎡）`);
      } else {
        const fok = up === 1 || bs === 1;
        fz("14 條第 2 項第 2 款", `住宅區商場（店）（≤1,000㎡）限建築物第一層及地下一層${on(fok, "1F、B1")}`, fok);
      }
    } else if (/工廠|製造|加工|作業廠房/.test(u) || (!u && /^C-/.test(to))) {
      if (A != null && A > 100) ban("14 條第 1 項第 2 款", `住宅區作業廠房樓地板面積合計不得超過 100㎡（本案 ${fmt(A)}㎡；另有動力 6 匹馬力、電熱 50 瓩的限制）`);
      else { const fok = up === 1 || bs === 1; (flKnown && !fok ? ban : cond)("14 條第 1 項第 2 款、第 2 項第 2 款", `住宅區工廠：作業廠房 ≤100㎡、動力 ≤6 匹馬力、電熱 ≤50 瓩，且限第一層及地下一層（銀樓金飾加工可到 2F）${on(fok, "1F、B1")}`); }
    } else ok(`第 14 條未見明文禁止「${u || to}」（仍要逐款核對第 14 條第 1 項各款，含第 24 款市府認定有礙居住安寧者）`);
  } else if (k === "com") {
    if (/公墓|火化|骨灰|納骨/.test(u)) ban("16 條第 1 項第 4 款", "商業區不得作公墓、火化場、骨灰（骸）存放設施");
    else if (/畜|禽|馬廄/.test(u)) ban("16 條第 1 項第 7 款", "商業區不得作畜禽舍");
    else if (/賽車/.test(u)) ban("16 條第 1 項第 10 款", "商業區不得作賽車場");
    else if (/自助儲物|迷你倉/.test(u)) { const okc = rw != null && rw >= 8 && (!flKnown || up === 1 || up === 2 || bs === 1); (okc ? cond : ban)("16 條第 1 項第 12 款", `商業區自助儲物空間要面臨 8m 以上道路${rw != null ? `（本案 ${rw}m）` : ""}、限 1F、2F、B1${on(up === 1 || up === 2 || bs === 1, "1F、2F、B1")}`); }
    else if (/工廠|製造|加工/.test(u) || (!u && /^C-/.test(to))) {
      if (A != null && A > 300) ban("16 條第 1 項第 2 款", `商業區作業廠房樓地板面積合計不得超過 300㎡（本案 ${fmt(A)}㎡；報業印刷、冷藏業除外）`);
      else cond("16 條第 1 項第 2、3 款", "商業區工廠：作業廠房 ≤300㎡、動力 ≤15 匹馬力、電熱 ≤60 瓩，且不得經營第 3 款列舉的事業");
    } else ok(`第 16 條未見明文禁止「${u || to}」（第 16 條多為工業、公害類限制，仍要逐款核對）`);
  } else if (k === "ind2" || k === "ind1" || k === "ind") {
    const IND = [[/辦公|研發|推廣|展示/, "第 2 項第 1 款第 1 目（工廠研發、推廣、服務辦公室）"], [/倉庫|倉儲/, "第 2 項第 1 款第 2 目或第 2 款第 7 目（倉庫、倉儲業，賣場除外）"], [/宿舍/, "第 2 項第 1 款第 3 目（員工宿舍）"], [/員工餐廳/, "第 2 項第 1 款第 3 目（員工餐廳）"],
      [/修理|修車|保養/, "第 2 項第 2 款第 15 目（機車、汽車及機械修理業）"], [/洗衣/, "第 2 項第 2 款第 4 目（300㎡ 以上大型洗衣業）"], [/幼兒園|課後照顧/, "第 2 項第 3 款第 12 目（幼兒園、兒童課後照顧服務中心）"],
      [/托嬰|早療|長照|長期照顧|身心障礙/, "第 2 項第 3 款第 11 目（社會福利設施）"], [/醫院|診所|醫事/, "第 2 項第 3 款第 10 目（醫事機構，土地不超過工業區 5%）"], [/銀行|郵局|保險|信用/, "第 2 項第 3 款第 13 目（金融分支機構，土地不超過工業區 5%）"],
      [/運動|健身|球場/, "第 2 項第 3 款第 20 目（運動設施，土地不超過工業區 5%）"], [/旅館|飯店/, "第 2 項第 3 款第 21 目（旅館：面臨 12m 以上道路、土地不超過工業區 5%、限整棟）"], [/宗教|寺|廟|教會/, "第 2 項第 3 款第 16 目（宗教設施，總樓地板 ≤500㎡）"],
      [/零售|商店|餐|飲食|小吃|咖啡|超商|便利/, "第 2 項第 3 款第 22 目（一般零售及餐飲業：不超過單一基地面積 5%、總樓地板 ≤500㎡）"], [/加油|加氣/, "第 2 項第 3 款第 6 目（加油站、汽車加氣站）"], [/駕駛訓練/, "第 2 項第 3 款第 14 目（汽車駕駛訓練場）"]];
    const art = k === "ind1" ? "18" : "17";
    if (k === "ind1") cond("18 條", `甲種工業區：依第 18 條，限工廠與所列附屬、工業發展有關、公共服務及公用事業設施，請逐款核對「${u || to}」`);
    else if (/^C-/.test(to) && !u) ok("工廠（C 類）為乙種工業區的主要用途；仍要確認不屬第 17 條第 1 項第 2、3 款禁止的工業");
    else {
      const h = IND.find(([re]) => re.test(u));
      if (h) cond(`17 條${h[1]}、第 3 項`, `乙種工業區只能作工廠與第 17 條第 2 項列舉的設施；「${u}」可能屬${h[1]}，要經市府審查核准才能變更使用`);
      else if (/住宅|住家|集合住宅|補習|KTV|視聽|舞廳|酒|三溫暖|電子遊戲/.test(u) || (!u && /^(H-2|B-1|D-5)$/.test(to))) ban("17 條第 2 項", `乙種工業區只能作工廠與第 17 條第 2 項列舉的設施，「${u || to}」不在其中`);
      else cond("17 條第 2 項", `乙種工業區只能作工廠與第 17 條第 2 項列舉的設施，「${u || to}」要逐目核對，列舉設施都要經市府審查核准（第 3 項）`);
    }
  } else if (k === "agr") cond("29 條", `農業區除農業生產外，僅得申請農舍、農業產銷必要設施、休閒農業、自然保育、綠能及農村再生公共設施（第 30～32 條另有規定），「${u || to}」原則上不得，要逐條核對`);
  else if (k === "prot") cond(/保護/.test(z) ? "27 條" : "13 條", `${/保護/.test(z) ? "保護區只得經市府審查核准作第 27 條列舉的設施" : "保存區等分區依施行細則與計畫書規定"}，「${u || to}」原則上不得，要逐條核對`);
  else L.push(`■ 使用分區「${z}」：本工具沒有內建這類分區的規則，請查施行細則與該計畫的土管要點`);
  L.push(`■ 細部計畫的土管要點可能更嚴（例如住一、住二不得作某些用途、樓層或面積限制）：search_landuse keywords=["${u || to}"] 再用 get_landuse 讀該計畫區的要點`);
  return r;
}

/* ───── 公共建築物（設計施工編第 170 條）───── */
function pubBld(to, A, u, F, units) {
  const has = (re) => re.test(u), ge = (n) => (A == null ? null : A >= n);
  const T = (v, t) => ({ v, t });
  switch (to) {
    case "A-1": return T(true, "A-1 戲院、電影院、演藝場、歌廳、觀覽場，以及觀眾席 ≥200㎡ 的音樂廳、文康中心、集會堂、活動中心、體育館等");
    case "A-2": return T(true, "A-2 車站、候船室、航空站");
    case "B-1": return T(false, "B-1 不在第 170 條表列");
    case "B-2": return T(true, "B-2 百貨公司、商場、市場、展覽場、量販店");
    case "B-3": if (has(/小吃街/)) return T(true, "B-3 小吃街"); return ge(300) == null ? T(null, "B-3 餐廳、飲食店、飲料店、飲酒店 ≥300㎡ 才是公共建築物（填 area 可判斷）") : T(ge(300), `B-3 餐廳、飲食店等 ${fmt(A)}㎡ ${A >= 300 ? "≥" : "<"} 300㎡`);
    case "B-4": return T(true, "B-4 旅館");
    case "D-1": return has(/游泳/) ? T(true, "D-1 室內游泳池") : u ? T(false, `D-1 只有室內游泳池是公共建築物（本案「${u}」）`) : T(null, "D-1 只有室內游泳池是公共建築物（填 use_item 可判斷）");
    case "D-2": return T(true, "D-2 會議廳、展示廳、博物館、圖書館等，以及觀眾席 <200㎡ 的集會堂、活動中心、體育館");
    case "D-3": case "D-4": return T(true, `${to} 學校教室、教學大樓`);
    case "D-5": return ge(500) == null ? T(null, "D-5 補習（訓練）班、課後托育中心 ≥500㎡ 才是（填 area）") : T(ge(500), `D-5 補習班、課後托育 ${fmt(A)}㎡ ${A >= 500 ? "≥" : "<"} 500㎡`);
    case "E": return ge(500) == null ? T(null, "E 寺廟、教堂、殯儀館 ≥500㎡ 才是（填 area）") : T(ge(500), `E 寺廟、教堂、殯儀館 ${fmt(A)}㎡ ${A >= 500 ? "≥" : "<"} 500㎡`);
    case "F-1": if (has(/醫院|療養院/)) return T(null, "F-1 醫院、療養院設 10 床以上才是（要確認床數）"); return ge(500) == null ? T(null, "F-1：10 床以上醫院、療養院，或 ≥500㎡ 的護理之家、長照機構") : T(ge(500), `F-1 護理之家、長照機構 ${fmt(A)}㎡ ${A >= 500 ? "≥" : "<"} 500㎡（醫院、療養院看是否 10 床以上）`);
    case "F-2": return T(true, "F-2 身心障礙福利機構、教養機構、職業訓練機構、特殊教育學校");
    case "F-3": if (has(/早療|早期療育|發展遲緩/)) return T(true, "F-3 發展遲緩兒早期療育中心"); return ge(500) == null ? T(null, "F-3 幼兒園、兒少福利機構 ≥500㎡ 才是（填 area）") : T(ge(500), `F-3 幼兒園、兒少福利機構 ${fmt(A)}㎡ ${A >= 500 ? "≥" : "<"} 500㎡`);
    case "G-1": return T(true, "G-1 含營業廳的金融、證券、郵電、公用事業營業場所");
    case "G-2": return has(/政府|機關|公所|郵政|電信|自來水|電力|台電|身心障礙.*就業/) ? T(true, "G-2 公用事業辦公室、政府機關、身障就業服務機構") : u ? T(false, `G-2 只有公用事業辦公室、政府機關、身障就業服務機構是（本案「${u}」）`) : T(null, "G-2 一般辦公室不是；公用事業辦公室、政府機關才是（填 use_item）");
    case "G-3": return has(/衛生所|公共廁所|公廁|便利商店|超商/) ? T(true, "G-3 衛生所、公共廁所、便利商店") : has(/醫院|療養院/) ? T(true, "G-3 未達 10 床的醫院、療養院") : u ? T(false, `G-3 只有衛生所、未達 10 床醫院、公共廁所、便利商店是（本案「${u}」）`) : T(null, "G-3 一般店鋪、診所不是；便利商店、衛生所、公廁才是（填 use_item）");
    case "H-1": return has(/護理之家|長照|長期照|老人福利|養護|安養|文康/) ? T(true, "H-1 <500㎡ 護理之家、長照機構，老人福利機構") : u ? T(false, `H-1 只有護理之家、長照、老人福利機構是（本案「${u}」）`) : T(null, "H-1 民宿、宿舍不是；護理之家、長照、老人福利機構才是（填 use_item）");
    case "H-2": if (F == null) return T(null, "H-2：6 層以上集合住宅，或 5 層以下且 50 戶以上（填 floors）"); if (F >= 6) return T(true, `H-2 ${F} 層 ≥6 層集合住宅`); return units == null ? T(null, `H-2 ${F} 層：5 層以下要 50 戶以上才是（填 units）`) : T(units >= 50, `H-2 ${F} 層、${units} 戶${units >= 50 ? "≥" : "<"} 50 戶`);
    case "I": return has(/加油|加氣/) ? T(true, "I 加油（氣）站") : T(null, "I 類只有加油（氣）站是");
    default: return T(false, `${to} 不在第 170 條表列${/^C-/.test(to) ? "（工廠非公共建築物：營署 103.07.14 營署建管字第 1030044357 號函）" : ""}`);
  }
}

/* ───── 消防：變更前後各類場所消防安全設備設置標準 ───── */
function fireDiff(before, after, from, to) {
  if (!before || !after) return null;
  const L = [], fb = Object.fromEntries(before.out.filter((o) => o.cat === "消防設備").map((o) => [o.id, o]));
  const fc = after.c.fc || (() => ({ t: "" }));
  L.push(`■ 場所分類（第 12 條）：原 ${from} ${fc(from).t} → 新 ${to} ${fc(to).t}${fc(from).k !== fc(to).k ? `（由${fc(from).k}類變為${fc(to).k}類）` : ""}；本案（變更後）：${after.c.klassTxt}`);
  const add = [], keep = [], cond = [];
  for (const o of after.out.filter((x) => x.cat === "消防設備")) {
    const was = fb[o.id] && fb[o.id].on === true;
    const line = `第 ${o.art} 條${o.title}：${o.why}`;
    if (o.on === true) (was ? keep : add).push(line);
    else if (o.on === "info") cond.push(line + (o.note ? `（${o.note}）` : ""));
    else if (o.note && /^(F-|H-1)/.test(to)) cond.push(`第 ${o.art} 條${o.title}：${o.note}`);
  }
  L.push(add.length ? "■ 變更後新增要設：" : "■ 依量體試算，變更後沒有新增要設的設備（仍以消防機關審查為準）");
  add.forEach((x) => L.push("  ＋ " + x));
  if (keep.length) { L.push("■ 原用途本來就要設（變更後仍要）："); keep.forEach((x) => L.push("  ＝ " + x)); }
  if (cond.length) { L.push("■ 需確認："); cond.forEach((x) => L.push("  ？ " + x)); }
  return L;
}

export async function checkChangeOfUse(a = {}) {
  if (a.from_group == null && a.from != null) a = { ...a, from_group: a.from }; if (a.to_group == null && a.to != null) a = { ...a, to_group: a.to };
  const from = normG(a.from_group), to = normG(a.to_group), errs = [];
  if (!GN[from]) errs.push(`不認得原使用類組 from_group「${a.from_group || ""}」`);
  if (!GN[to]) errs.push(`不認得變更後類組 to_group「${a.to_group || ""}」`);
  if (from && from === to) errs.push("原使用類組與變更後類組相同，不是變更使用類組");
  if (errs.length) return `輸入不完整，無法檢討：\n- ${errs.join("\n- ")}\n可用類組：${GROUPS.map((g) => `${g[0]} ${g[1]}`).join("、")}`;
  const A = num(a.area), F = num(a.floors), urban = a.urban_plan !== false, ty = /桃園/.test(String(a.city || ""));
  const sym = (DATA.t3[to] || {})[from];
  const L = ["【初篩，不是主管機關認定】依「建築物使用類組及變更使用辦法」附表三、附表四列出變更使用要檢討的項目與標準；類組以原領使用執照登載的為準（第 2 條、附表三說明一）。都市計畫或非都市土地的容許使用要先確認（第 3 條）。正式檢討以主管建築機關審查為準。", ""];
  L.push(`變更：${from}（${GN[from]}）→ ${to}（${GN[to]}）${A ? `，變更範圍 ${fmt(A)} ㎡` : ""}${a.floor ? `，位於 ${a.floor}` : ""}${F ? `，建築物地上 ${F} 層` : ""}`);
  L.push(`附表三：「${sym}」${SYM[sym] || ""}［get_document document="建築物使用類組及變更使用辦法" section="附表三 說明"］`);
  const items = itemsOf(sym, to);

  // 求解器：變更後類組的門檻（有填面積才跑）
  // 變更所在樓層：地上第 n 層 → 該層改為新類組、其餘樓層維持原類組；地下層 → 以新類組試算地下層
  let sv = null, before = null, svTag = "";
  const fa = num(a.floor_area) || A, fl = String(a.floor || "").trim().toUpperCase();
  const mB = fl.match(/^B(\d+)/), mF = fl.match(/^(\d+)\s*(F|樓|層)?$/);
  if (A && F) {
    try {
      if (mF && +mF[1] >= 1 && +mF[1] <= F) { sv = solve({ group: from, F, typ: fa, uses: [{ group: to, floors: mF[1] }], urban, site: num(a.site_area) }); svTag = `${mF[1]}F 改為 ${to}${F > 1 ? `、其他層 ${from}，各層` : "，該層"} ${fmt(fa)} ㎡`; }
      else if (mB) { sv = solve({ group: to, F, B: +mB[1], b1: fa, typ: fa, urban, site: num(a.site_area) }); svTag = `${to}、地下 ${mB[1]} 層 ${fmt(fa)} ㎡`; }
      else { sv = solve({ group: to, F, typ: fa, urban, site: num(a.site_area) }); svTag = `整棟以 ${to}、各層 ${fmt(fa)} ㎡ 試算`; }
    } catch { sv = null; }
    try { before = mB ? solve({ group: from, F, B: +mB[1], b1: fa, typ: fa, urban, site: num(a.site_area) }) : solve({ group: from, F, typ: fa, urban, site: num(a.site_area) }); } catch { before = null; }
  }
  const zr = await zoneCheck(a, to, A ?? null, { up: mF ? +mF[1] : null, b: mB ? +mB[1] : null });
  const pub = pubBld(to, A ?? null, String(a.use_item || ""), F ?? null, num(a.units) ?? null);
  const tyRes = ty ? await tyExempt(from, to, a, A ?? null, mF ? +mF[1] : mB ? -1 : null) : null;
  const ad = rocDate(a.apply_date), tyOld = ty && ad != null && ad < 20261111;
  if (tyOld && tyRes) { tyRes.ok = null; tyRes.lines.unshift(`■ ⚠ 申請日 ${a.apply_date} 早於 115.11.11 修正：適用修正前的條文與附表一（舊版的符號與條件不同，例如沒有④、D-5 改 G 類的規定不同），下列依新版判斷只供參考，舊版請開桃園市法規網的歷史法規核對`); }
  if (zr && zr.head) L.splice(L.findIndex((l) => l.startsWith("附表三：")) + 1, 0, `使用分區：${zr.head}`);
  if (tyRes && zr && zr.v === "ban" && tyRes.ok === true) tyRes.ok = "zone";
  if (tyRes) L.splice(L.findIndex((l) => l.startsWith(zr && zr.head ? "使用分區：" : "附表三：")) + 1, 0, `桃園市：${tyRes.ok === "zone" ? "規模符合附表一免辦變使的條件，但使用分區不准作此用途，免辦變使也不能使用" : tyRes.ok === true ? "依免辦理變更使用執照管理辦法附表一，得免辦變使（仍要符合容許使用，並依第 3 條第 5 項、消防法規辦理；下列檢討供自主檢查）" : tyRes.ok === false ? "不符免辦變使條件，要辦理變更使用執照" : "能否免辦變使要再確認（見文末桃園市一節）"}`);
  // 停車（說明二（七））
  const pf = parkClass(from), pt = parkClass(to);
  let parkTxt;
  if (!pf || !pt) parkTxt = "附表四未寫明第 59 條類別，請依規定檢討";
  else if (pf.k === pt.k || (pf.f === pt.f && pf.ru === pt.ru && pf.rn === pt.rn)) parkTxt = `原、新類組屬第 59 條同一設置標準（第 ${pf.k} 類${pf.k !== pt.k ? `／第 ${pt.k} 類` : ""}）：免檢討`;
  else {
    const rf = urban ? pf.ru : pf.rn, rt = urban ? pt.ru : pt.rn, lower = rt >= rf && pt.f >= pf.f;
    parkTxt = lower ? `由第 ${pf.k} 類（設置標準較高）變更為第 ${pt.k} 類（較低）：免檢討` : `第 ${pf.k} 類 → 第 ${pt.k} 類，設置標準提高：要檢討`;
    if (!lower && A) parkTxt += `；以變更範圍 ${fmt(A)} ㎡ 試算：原用途 ${need(pf, A, urban)} 輛、新用途 ${need(pt, A, urban)} 輛（${urban ? "都市計畫內" : "都市計畫外"}；免設面積與既有車位的算法依主管機關認定，土管另有規定者從其規定）`;
  }
  // 無障礙（說明二（八））
  const d = rocDate(a.permit_date);
  const accTxt = d == null ? "依原建照申請日：102.1.1 以後申請者要符合設計施工編第十章，不得提替代改善計畫；101.12.31 以前申請、變更為公共建築物者依「既有公共建築物無障礙設施替代改善計畫作業程序及認定原則」第二點設置（確有困難可提替代改善計畫）；101.12.31 以前申請、變更為非公共建築物者免檢討（填 permit_date 可直接判斷）"
    : d >= 20130101 ? "原建照 102.1.1 以後申請：要符合設計施工編第十章無障礙建築物，不得依身權法第 57 條提替代改善計畫"
    : pub.v === true ? `原建照 101.12.31 以前申請，變更後屬公共建築物：依「既有公共建築物無障礙設施替代改善計畫作業程序及認定原則」第二點設置，確有困難可提替代改善計畫`
    : pub.v === false ? `原建照 101.12.31 以前申請，變更後不是公共建築物：免檢討`
    : `原建照 101.12.31 以前申請：變更後若屬公共建築物（設計施工編第 170 條），依替代改善認定原則第二點設置、確有困難可提替代改善計畫；不是公共建築物則免檢討`;
  const pubTxt = `公共建築物（設計施工編第 170 條）：${pub.v === true ? "是" : pub.v === false ? "不是" : "需確認"}——${pub.t}`;

  if (sym === "◎") L.push("", "◎ 要依建築技術規則全部檢討：建議直接用 check_building 以變更後類組跑完整初篩，下面列附表四的各項標準供對照。");
  L.push("", `════ 檢討項目與標準（附表四 ${to}，共 ${items.length} 項）════`);
  for (const i of items) {
    const it = DATA.t4[to][i - 1];
    let std = it.s;
    if (i === 16) std += `\n  → ${parkTxt}`;
    if (i === 20) std += `\n  → ${pubTxt}\n  → ${accTxt}`;
    L.push(`${i}. ${it.n}：${std}`);
    if (sv && RULE[i] && i !== 16) for (const id of RULE[i]) {
      const o = sv.out.find((x) => x.id === id); if (!o || id === "a170") continue;
      const st = o.on === true ? "觸發" : o.on === "info" ? "需確認" : "未觸發";
      L.push(`  求解器（${svTag}）：第 ${o.art} 條${o.title}｜${st}：${o.why}`);
    }
  }
  if (sym !== "◎" && sym !== "☆") {
    const skip = DATA.t4[to].map((x, k) => k + 1).filter((k) => !items.includes(k));
    if (skip.length) L.push(`（附表三免檢討：${skip.map((k) => DATA.t4[to][k - 1].n).join("、")}）`);
  }

  if (zr) { L.push("", "════ 使用分區容許使用（第 3 條）════", ...zr.lines); }
  else L.push("", "（使用分區：填 zone 可檢核。桃園市都市計畫區依都市計畫法桃園市施行細則第 14～29 條；非都市土地填使用地類別，如 zone=\"甲種建築用地\"，會列非都市土地使用管制規則附表一的細目）");
  L.push("", "════ 其他條文 ════");
  if (a.whole_floor === false) L.push("■ 局部變更（第 5 條）：原則上要整層變更；局部變更要不妨害其他部分的防火避難設施，且（一）變更範圍直接連接直通樓梯、梯廳或屋外，以 1 小時防火時效的牆、樓板、防火門窗區劃（防火設備要有 1 小時阻熱性），或（二）以符合第 92 條的走廊連接直通樓梯或屋外，開向走廊的開口以 1 小時防火門窗區劃（同樣要阻熱）");
  else L.push("■ 第 5 條：變更使用類組原則上以整層為之；局部變更要符合區劃條件（whole_floor=false 會列細節）");
  if (/^(A|B|C|D-1)/.test(to)) L.push(`■ 第 7 條（變更為 A、B、C 類或 D-1）：與同層、直上層、直下層相鄰的其他使用單元要依第 5 條區劃；主要構造要是防火構造；坐落在非商業區時，與 H 類、F-1～F-3 使用單元之間要以 1 小時防火時效的無開口牆壁及防火構造樓地板區劃${a.zone ? `（本案：${a.zone}${/商業/.test(a.zone) ? "，屬商業區，後段不適用" : ""}）` : ""}`);
  L.push("■ 第 6 條：同一使用單元變更為多種類組，各類組都要符合；主從關係符合附表五、所有權相同、從屬用途 ≤ 使用單元面積 2/5、主從空間相互連通時，得以主用途檢討");
  const mg = normG(a.main_group);
  if (mg && DATA.t5[to]) { const s5 = DATA.t5[to][mg]; L.push(`  附表五：${to} 作為 ${mg} 的從屬用途：${s5 === "○" ? "具從屬關係（○）" : s5 === "△" ? "具從屬關係，但面積還要符合設計施工編第 272 條（△）" : s5 === "╳" ? "不具從屬關係（╳）" : s5 || "表未列"}`); }
  L.push("■ 第 8 條：基礎樑柱、防火區劃、直通樓梯與安全梯、走廊、緊急進口、排煙、緊急昇降機、屋頂避難平臺、防火間隔、消防設備、停車位、昇降設備、分戶牆、外牆、防空避難設備、開放空間等有變更者，也要辦理變更使用執照");
  const fd = fireDiff(before, sv, from, to);
  L.push("", "════ 消防安全設備（各類場所消防安全設備設置標準，求解器初篩）════");
  if (fd) { L.push(`（${svTag}；變更前以整棟 ${from} 試算比較）`, ...fd); }
  else L.push(`■ 場所分類（第 12 條）依新用途重新認定，消防安全設備依設置標準重新檢討；填 area 與 floors 會列出變更後新增要設的設備`);
  L.push("■ 求解器只涵蓋室內消防栓、自動撒水、火警自動警報與緊急廣播、避難器具、連結送水管、消防專用蓄水池、排煙、緊急電源插座、無線電通信輔助設備（第 15～30 條部分條文）；滅火器、標示設備、緊急照明、防焰物品、防火管理等另依設置標準與消防法檢討");
  L.push("■ 變更用途要向消防機關申請消防安全設備圖說審查及竣工查驗，以消防機關審查為準");

  if (ty) {
    L.push("", "════ 桃園市一定規模以下建築物免辦理變更使用執照管理辦法 ════");
    L.push("■ 第 3 條（115.11.11 府法制字第 1150319663 號令修正）：符合附表一規模條件者得免辦理變更使用執照，但仍要符合土管、非都市土地使用管制與目的事業主管機關的容許使用項目");
    L.push(...tyRes.lines);
    if (TY_CERT[to]) L.push(`■ 第 3 條第 5 項：變更後若屬 ${to} 的「${TY_CERT[to]}」，免辦變使後仍要提防火標章證明送市府備查，或委託建築師完成防火避難設施及設備安全檢查簽證申報，才能使用`);
    if (from === "防空避難設備" || /防空/.test(String(a.from_group))) L.push("■ 第 3 條第 5 項第 9 款：防空避難設備兼作 G-2、G-3 臨時使用，也要防火標章或公安申報");
    L.push(`■ 第 3 條第 2、3 項：附表一 ④ 要檢具申請書與使照存根、建物謄本與測量成果圖、分區證明、同意書、竣工平面圖、門牌整編證明等，送市府辦「免辦理變更使用執照證明文件」；其他符號需要證明文件時也可申請。附表一的原類組以原領使照為準，辦過變使者以最後一次變使登載的類組為準（第 4 項）`);
    L.push("■ 第 4 條：構造、設施、設備等與原核定不合的變更，符合附表二規模者得免辦變使；施工前應報審者要檢附申請書與圖說，完工後檢附竣工圖、照片、防火構造證明、結構安全證明報備（附表二：get_document document=\"桃園市一定規模以下建築物免辦理變更使用執照管理辦法\" section=\"附表二\"）");
    L.push("■ 第 5 條：免辦變使者，消防安全仍依消防法規定辦理");
  }
  L.push("", `讀條文：get_article law="${LAW}" articles=["3","4","5","6","7","8"]　附表：get_document document="建築物使用類組及變更使用辦法" section="附表四 ${to}"`);
  return L.join("\n");
}
