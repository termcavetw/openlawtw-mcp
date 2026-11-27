// 異體字摺疊：搜尋時把常見通用寫法視為同一字（台／臺、升／昇、着／著、峯／峰、綫／線、裡／裏）。
const MAP = { 台: "臺", 升: "昇", 陞: "昇", 着: "著", 峯: "峰", 綫: "線", 裏: "裡", 汙: "污", 菸: "煙" };
const RE = new RegExp(`[${Object.keys(MAP).join("")}]`, "g");
// PDF 文字層常把字存成 CJK 相容字（如 U+F9D1「六」），先轉回一般字，搜尋與點次辨識才對得上
export const compat = (s) => String(s ?? "").replace(/[\u2E80-\u2FDF\uF900-\uFAFF]/g, (c) => c.normalize("NFKC"));
export const fold = (s) => compat(s || "").replace(RE, (c) => MAP[c]);
import { GROUPS, ABBR } from "./synonyms.js";
// 同義詞：alts(k) 回傳 k 與它的同義詞（都已摺疊）；has(text, k) 判斷 text（已摺疊）是否含其中任一個。
const SYN = new Map();
for (const g of GROUPS) { const f = g.map(fold); for (const t of f) SYN.set(t, [...new Set([...(SYN.get(t) || []), ...f])]); }
for (const [a, full] of Object.entries(ABBR)) SYN.set(fold(a), [...new Set([fold(a), ...full.map(fold)])]);
const altCache = new Map();
export const alts = (k) => {
  let v = altCache.get(k);
  if (!v) { const f = fold(k).replace(/\s+/g, ""); v = SYN.get(f) || SYN.get(f.toUpperCase()) || [fold(k)]; if (!v.includes(fold(k))) v = [fold(k), ...v]; altCache.set(k, v); }
  return v;
};
export const has = (text, k) => { for (const v of alts(k)) if (text.includes(v)) return true; return false; };
// 這次搜尋有哪些關鍵字帶了同義詞（給輸出結尾的說明用）
export const synNote = (kws) => { const n = (kws || []).filter((k) => alts(k).length > 1).map((k) => `${k}＝${alts(k).filter((v) => v !== fold(k)).join("／")}`); return n.length ? `（同義詞已一併搜尋：${n.join("；")}）` : ""; };
// 給 snippet 定位用：關鍵字的各種寫法（含同義詞）
export const variants = (kws) => [...new Set(kws.flatMap((k0) => alts(k0).concat(k0)).flatMap((k) => { const f = fold(k); const back = Object.entries(MAP).reduce((t, [a, b]) => t.split(b).join(a), f); return [k, f, back]; }))];
