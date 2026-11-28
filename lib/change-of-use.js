// 變更使用類組初篩（check_change_of_use）：依「建築物使用類組及變更使用辦法」附表三（變更使用原則表）、
// 附表四（各類組規定項目檢討標準）、附表五（主從用途關係）與第 5～8 條，列出要檢討的項目與標準；
// 有填層數、面積時，另用求解器算出變更後類組在各項目的門檻。桃園市另列免辦理變更使用執照管理辦法。
import DATA from "./change-of-use-data.json" with { type: "json" };
import { solve, GROUPS } from "./law-solver-engine.js";

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
const parkClass = (g) => g.startsWith("H") ? { k: 2, f: 500, ru: 150, rn: 300 } : /^(A|B-1|B-2|B-3|G|D-1)/.test(g) ? { k: 1, f: 300, ru: 150, rn: 250 } : /^(B-4|D-2|E|F-1|F-2)/.test(g) ? { k: 3, f: 500, ru: 200, rn: 350 } : g === "I" ? null : { k: 4, f: 500, ru: 250, rn: 350 };
const need = (p, A, urban) => (A > p.f ? Math.ceil((A - p.f) / (urban ? p.ru : p.rn)) : 0);

function rocDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})/); if (!m) return null;
  let y = +m[1]; if (y < 1000) y += 1911;
  return y * 10000 + +m[2] * 100 + +m[3];
}

// 桃園市一定規模以下建築物免辦理變更使用執照管理辦法第 3 條第 2 項：變更後屬下列項目者，要防火標章或公安申報後才能使用
const TY_CERT = {
  "D-1": "室內兒童樂園、健身房、室內操練場、室內體育場所、室內高爾夫球練習場、健身休閒中心",
  "D-2": "會議廳、展示廳、圖書館、文康中心、親子館、集會堂（場）、社區（里）活動中心",
  "D-5": "補習（訓練）班、文康機構、兒童課後照顧服務中心",
  "F-3": "兒童及少年安置教養機構、幼兒園（兼辦國民小學兒童課後照顧服務）、托嬰中心",
  "G-2": "身心障礙者就業服務機構",
  "G-3": "診所、動物收容、寵物繁殖或買賣場所",
};

export async function checkChangeOfUse(a = {}) {
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
  let sv = null;
  if (A && (F || a.floor)) {
    try { sv = solve({ group: to, F: F || 1, typ: A, urban, site: num(a.site_area) }); } catch { sv = null; }
  }
  // 停車（說明二（七））
  const pf = parkClass(from), pt = parkClass(to);
  let parkTxt;
  if (!pf || !pt) parkTxt = "I 類（危險物品）停車另定，請依規定檢討";
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
    : `原建照 101.12.31 以前申請：變更後若屬公共建築物（設計施工編第 170 條），依替代改善認定原則第二點設置、確有困難可提替代改善計畫；不是公共建築物則免檢討`;

  if (sym === "◎") L.push("", "◎ 要依建築技術規則全部檢討：建議直接用 check_building 以變更後類組跑完整初篩，下面列附表四的各項標準供對照。");
  L.push("", `════ 檢討項目與標準（附表四 ${to}，共 ${items.length} 項）════`);
  for (const i of items) {
    const it = DATA.t4[to][i - 1];
    let std = it.s;
    if (i === 16) std += `\n  → ${parkTxt}`;
    if (i === 20) std += `\n  → ${accTxt}`;
    L.push(`${i}. ${it.n}：${std}`);
    if (sv && RULE[i] && i !== 16) for (const id of RULE[i]) {
      const o = sv.out.find((x) => x.id === id); if (!o) continue;
      const st = o.on === true ? "觸發" : o.on === "info" ? "需確認" : "未觸發";
      L.push(`  求解器（${to}、${A} ㎡${F ? `、${F} 層` : ""}）：第 ${o.art} 條${o.title}｜${st}：${o.why}`);
    }
  }
  if (sym !== "◎" && sym !== "☆") {
    const skip = DATA.t4[to].map((x, k) => k + 1).filter((k) => !items.includes(k));
    if (skip.length) L.push(`（附表三免檢討：${skip.map((k) => DATA.t4[to][k - 1].n).join("、")}）`);
  }

  L.push("", "════ 其他條文 ════");
  if (a.whole_floor === false) L.push("■ 局部變更（第 5 條）：原則上要整層變更；局部變更要不妨害其他部分的防火避難設施，且（一）變更範圍直接連接直通樓梯、梯廳或屋外，以 1 小時防火時效的牆、樓板、防火門窗區劃（防火設備要有 1 小時阻熱性），或（二）以符合第 92 條的走廊連接直通樓梯或屋外，開向走廊的開口以 1 小時防火門窗區劃（同樣要阻熱）");
  else L.push("■ 第 5 條：變更使用類組原則上以整層為之；局部變更要符合區劃條件（whole_floor=false 會列細節）");
  if (/^(A|B|C|D-1)/.test(to)) L.push(`■ 第 7 條（變更為 A、B、C 類或 D-1）：與同層、直上層、直下層相鄰的其他使用單元要依第 5 條區劃；主要構造要是防火構造；坐落在非商業區時，與 H 類、F-1～F-3 使用單元之間要以 1 小時防火時效的無開口牆壁及防火構造樓地板區劃${a.zone ? `（本案：${a.zone}${/商業/.test(a.zone) ? "，屬商業區，後段不適用" : ""}）` : ""}`);
  L.push("■ 第 6 條：同一使用單元變更為多種類組，各類組都要符合；主從關係符合附表五、所有權相同、從屬用途 ≤ 使用單元面積 2/5、主從空間相互連通時，得以主用途檢討");
  const mg = normG(a.main_group);
  if (mg && DATA.t5[to]) { const s5 = DATA.t5[to][mg]; L.push(`  附表五：${to} 作為 ${mg} 的從屬用途：${s5 === "○" ? "具從屬關係（○）" : s5 === "△" ? "具從屬關係，但面積還要符合設計施工編第 272 條（△）" : s5 === "╳" ? "不具從屬關係（╳）" : s5 || "表未列"}`); }
  L.push("■ 第 8 條：基礎樑柱、防火區劃、直通樓梯與安全梯、走廊、緊急進口、排煙、緊急昇降機、屋頂避難平臺、防火間隔、消防設備、停車位、昇降設備、分戶牆、外牆、防空避難設備、開放空間等有變更者，也要辦理變更使用執照");
  L.push("■ 消防：變更用途後的消防安全設備依「各類場所消防安全設備設置標準」重新檢討（可用 check_building 的消防設備類）");

  if (ty) {
    L.push("", "════ 桃園市一定規模以下建築物免辦理變更使用執照管理辦法 ════");
    L.push("■ 第 3 條：符合附表一規模條件者得免辦理變更使用執照，但仍要符合土管、非都市土地使用管制與目的事業主管機關的容許使用項目。附表一的規模條件本庫未收錄文字，請開原檔：https://law.tycg.gov.tw/Download.ashx?FileID=7858&id=GL001285&type=LAW");
    if (TY_CERT[to]) L.push(`■ 第 3 條第 2 項：變更後若屬 ${to} 的「${TY_CERT[to]}」，免辦變使後仍要提防火標章證明送市府備查，或委託建築師完成防火避難設施及設備安全檢查簽證申報，才能使用`);
    if (/^H/.test(to)) L.push("■ 第 3 條第 2 項第 7、8 款（H-1、H-2 的民宿、長照、精神復健機構等）已由行政院 108.01.29 院臺建字第 1080000619 號函告無效");
    L.push("■ 第 4 條：構造、設施、設備等與原核定不合的變更，符合附表二規模者得免辦變使；施工前應報審者要檢附申請書與圖說，完工後檢附竣工圖、照片、防火構造證明、結構安全證明報備（附表二原檔：https://law.tycg.gov.tw/Download.ashx?FileID=7859&id=GL001285&type=LAW）");
    L.push("■ 第 5 條：免辦變使者，消防安全仍依消防法規定辦理");
  }
  L.push("", `讀條文：get_article law="${LAW}" articles=["3","4","5","6","7","8"]　附表：get_document document="建築物使用類組及變更使用辦法" section="附表四 ${to}"`);
  return L.join("\n");
}
