// verify_citations：把 AI 寫好的回答草稿丟進來，逐一核對裡面的條號、條文修正日、函釋字號與日期。
// 只核對「本庫有收」的部分；沒收的標「本庫未收，無法核對」，不代表錯。
import { articleInfo, findLetter, resolveLawId } from "./openlaw.js";

const LAW_END = "(?:法|條例|規則|辦法|標準|要點|施工編|構造編|設備編|總則編|規範|細則|準則|基準|原則)";
const ART = "第\\s*(\\d+(?:\\s*[-之]\\s*\\d+)?)\\s*條";
const lawCache = new Map();
async function lawOf(name) {
  name = name.replace(/[《》〈〉「」\s]/g, "");
  if (lawCache.has(name)) return lawCache.get(name);
  let hit = null;
  // 名稱前面常黏著「依」「按」「及」等字：從長到短試
  for (let i = 0; i < Math.min(name.length - 2, 12) && !hit; i++) {
    const cand = name.slice(i);
    const r = await resolveLawId(cand);
    if (r && (r.name === cand || r.name.endsWith(cand) || cand.length >= 4)) hit = r;
  }
  lawCache.set(name, hit);
  return hit;
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
// 字號前後的日期：ISO、民國 108.03.20、108年3月20日
function datesNear(t) {
  const out = [];
  for (const m of t.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/g)) out.push(iso(m[1], m[2], m[3]));
  for (const m of t.matchAll(/(?<![\d.])(\d{2,3})[.．/年]\s*(\d{1,2})[.．/月]\s*(\d{1,2})日?(?![\d])/g)) { const y = Number(m[1]); if (y >= 30 && y <= 130) out.push(iso(y + 1911, m[2], m[3])); }
  return out;
}

export async function verifyCitations({ text } = {}) {
  const src = String(text || "");
  if (!src.trim()) return "沒有內容可以核對。請把回答草稿放在 text。";
  const out = [], bad = [], seenA = new Set(), seenL = new Set();
  // 一、條文：找「法規名＋第 X 條」，「同編／同法／同條例」沿用前一部
  // 第 4 組：緊接在頓號、及、與後面的裸條號（「第 269 條、第 162 條」），沿用前一部法規
  const re = new RegExp(`(?:《([^》]{2,40})》|([\\u4e00-\\u9fff]{2,30}?${LAW_END})|(同編|同法|同條例|同辦法|同規則|本編)|([、及與和]))\\s*(?:第\\s*\\d+\\s*章\\s*)?${ART}`, "g");
  let last = null;
  for (const m of src.matchAll(re)) {
    let L = null;
    if (m[3] || m[4]) L = last; else L = await lawOf(m[1] || m[2]);
    if (m[4] && !L) continue;
    if (!L) continue;
    last = L;
    const no = m[5].replace(/\s+/g, "").replace("之", "-");
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 40);
    let claimed = /^([^。；\n]{0,30}?)(\d{4}-\d{2}-\d{2})\s*(?:修正|修訂|增訂)/.exec(after);
    // 「（辦法 2026-05-18 修正）」「（建築法 2022-05-11 修正）」寫的是整部法規的修正日，不拿來比對本條
    if (claimed && /(?:法|條例|規則|辦法|標準|要點|規範|細則|準則|編|全文)\s*$/.test(claimed[1])) claimed = null;
    if (claimed) claimed = [claimed[0], claimed[2]];
    const key = `${L.id}|${no}|${claimed ? claimed[1] : ""}`;
    if (seenA.has(key)) continue; seenA.add(key);
    const info = await articleInfo(L.id, no).catch(() => null);
    if (!info || !info.exists) { bad.push(`✗ ${L.name}第 ${no} 條：本庫查無此條（條號可能寫錯，或已刪除）`); continue; }
    if (claimed && info.amended && claimed[1] !== info.amended) bad.push(`✗ ${L.name}第 ${no} 條：寫「${claimed[1]} 修正」，本條最近修正是 ${info.amended}（若 ${claimed[1]} 是整部法規的修正日，要寫明是法規修正日，不能寫成本條的）`);
    else if (claimed || !out.some((x) => x.startsWith(`✓ ${L.name}第 ${no} 條`))) out.push(`✓ ${L.name}第 ${no} 條${claimed ? `（修正日 ${claimed[1]} 正確）` : ""}`);
  }
  // 二、函釋字號：XX字第 NNNNNN 號
  const LM = [...src.matchAll(/([一-鿿]{1,12})字第\s*([A-Za-z]?\d[\d\-]{5,}\d)\s*號/g)];
  for (const [li, m] of LM.entries()) {
    const prevEnd = li ? LM[li - 1].index + LM[li - 1][0].length : 0, nextStart = li + 1 < LM.length ? LM[li + 1].index : src.length;
    const key = (m[2].match(/\d{6,}/) || [])[0]; if (!key || seenL.has(key)) continue; seenL.add(key);
    const shown = `${m[1].replace(/^.*[於日月年及與暨、函之並和或以已同部會]/, "")}字第${m[2]}號`;
    const r = await findLetter(key);
    if (!r) { out.push(`？ ${shown}：本庫未收，無法核對（不代表錯，引用前要找到原文）`); continue; }
    const near = datesNear(src.slice(Math.max(prevEnd, m.index - 45), m.index) + " " + src.slice(m.index + m[0].length, Math.min(nextStart, m.index + m[0].length + 30)));
    const dateBad = r.date && near.length && !near.includes(r.date);
    const line = `${shown}［${r.src} ${r.id}，${r.date || "日期不明"}］`;
    if (dateBad) bad.push(`✗ ${line}：回答寫的日期 ${[...new Set(near)].join("、")} 與本庫不符`);
    const rv = r.revoked ? String(r.revoked).replace(/^⛔\s*/, "").replace(/，(不能當依據|引用前請讀該函確認哪些部分仍適用)$/, "") : null;
    const said = rv && /停止適用|廢止|停用|不再援用|不能再引用|不得再引用|失效/.test(src.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80));
    if (rv && !said) bad.push(`⛔ ${line}：${rv}；回答沒有註明，不能當依據`);
    if (!dateBad && (!rv || said)) out.push(`✓ ${line}${rv ? "（回答已註明停止適用）" : ""}`);
  }
  if (!out.length && !bad.length) return "沒有找到可以核對的條號或函釋字號（格式要像「建築技術規則建築設計施工編第 95 條」「營署建管字第1081051682號」）。";
  return [
    bad.length ? `發現 ${bad.length} 個問題，回答前要改正：` : "沒有發現錯誤。",
    ...bad, ...(bad.length ? [""] : []),
    `已核對（${out.length}）：`, ...out,
    "",
    "說明：只核對本庫有收的條文與函釋；條文內容與結論是否正確仍要自己讀條文判斷。法規整部的最新修正日不是個別條文的修正日。",
  ].join("\n");
}
