// openlawtw data access + legal lookup logic (no dependencies).
// Data comes from the openlawtw static JSON API and is cached in memory.

import { fold, variants, has } from "./fold.js";
import ATT from "./attachments.js";

const SITE = "https://law.termcavetw.com";
const BASE = (process.env.OPENLAW_BASE || SITE).replace(/\/$/, "");
const TTL_MS = 10 * 60 * 1000; // manifest / catalog：每 10 分鐘用 ETag 確認一次（沒變只回 304，不重抓）

const cache = new Map(); // path -> { at, data }
const pending = new Map();

async function fetchJSON(path, immutable = true) {
  const hit = cache.get(path);
  if (hit && (immutable || Date.now() - hit.at < TTL_MS)) return hit.data;
  if (pending.has(path)) return pending.get(path);
  const p = (async () => {
    const headers = { "User-Agent": "openlawtw-mcp/1.0" };
    if (hit && hit.etag) headers["If-None-Match"] = hit.etag;
    const res = await fetch(BASE + path, { headers });
    if (res.status === 304 && hit) { hit.at = Date.now(); return hit.data; }
    if (!res.ok) {
      if (hit) return hit.data;
      throw new Error(`無法取得 ${path}（HTTP ${res.status}）`);
    }
    const data = await res.json();
    cache.set(path, { at: Date.now(), data, etag: res.headers.get("etag") });
    return data;
  })().finally(() => pending.delete(path));
  pending.set(path, p);
  return p;
}

const manifest = () => fetchJSON("/data/manifest.json", false);
const catalog = () => fetchJSON("/data/catalog.json", false);

const EXTRA_ALIASES = {
  "農發條例": "農業發展條例",
  "危老獎勵": "都市危險及老舊建築物建築容積獎勵辦法",
  "危老容積獎勵": "都市危險及老舊建築物建築容積獎勵辦法",
  "危老獎勵辦法": "都市危險及老舊建築物建築容積獎勵辦法",
  "危老細則": "都市危險及老舊建築物加速重建條例施行細則",
  "危老施行細則": "都市危險及老舊建築物加速重建條例施行細則",
  "危老結構評估": "都市危險及老舊建築物結構安全性能評估辦法",
};
const FAMILIES = { "危老": "都市危險及老舊建築物", "都更": "都市更新", "建技": "建築技術規則", "建技規": "建築技術規則", "技規": "建築技術規則", "非都": "非都市土地", "綠建築": "綠建" };

async function aliases() {
  let base = {};
  try { base = await fetchJSON("/data/aliases.json", false); } catch { /* optional */ }
  return { ...base, ...EXTRA_ALIASES };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  });
  await Promise.all(workers);
  return out;
}

// Data files are content-addressed; after openlawtw redeploys, old URLs disappear.
// On a 404, drop the cached index once and look the file up again.
function refreshIndex() {
  cache.delete("/data/manifest.json");
  cache.delete("/data/catalog.json");
  rulingsIndex = null;
}

async function fetchVersioned(getEntry) {
  const entry = await getEntry();
  try {
    return await fetchJSON(entry.url);
  } catch (e) {
    if (!/404/.test(String(e.message))) throw e;
    refreshIndex();
    return fetchJSON((await getEntry()).url);
  }
}

// 桃園市法規執行疑義會議紀錄：openlawtw manifest.minutes（內容定址，每週增量同步）。
export async function loadMinutes() {
  return fetchVersioned(async () => {
    const m = (await manifest()).minutes;
    if (!m || !m.url) throw new Error("openlawtw 資料尚未提供會議紀錄（manifest.minutes）");
    return m;
  });
}

// 新北市政府工務局建照業務工作手冊：openlawtw manifest.ntpcManual。
export async function loadNtpc() {
  return fetchVersioned(async () => {
    const m = (await manifest()).ntpcManual;
    if (!m || !m.url) throw new Error("openlawtw 資料尚未提供新北市建照業務工作手冊（manifest.ntpcManual）");
    return m;
  });
}

// 桃園市都市計畫土地使用分區管制要點：openlawtw manifest.landuse（每週增量同步）。
export async function loadLanduse() {
  return fetchVersioned(async () => {
    const m = (await manifest()).landuse;
    if (!m || !m.url) throw new Error("openlawtw 資料尚未提供土管要點（manifest.landuse）");
    return m;
  });
}

// 內政部地政司「地政法令彙編」解釋函：openlawtw manifest.land（使用者匯出、openlawtw 解析）。
export async function loadLand() {
  return fetchVersioned(async () => {
    const m = (await manifest()).land;
    if (!m || !m.url) throw new Error("openlawtw 資料尚未提供地政司函釋（manifest.land）");
    return m;
  });
}
let landIndex = null, landKey = null;
async function land() {
  const D = await loadLand();
  if (landIndex && landKey === D) return landIndex;
  const byId = new Map(D.items.map((r) => [String(r.id), r]));
  landIndex = { D, list: D.items, byId }; landKey = D;
  return landIndex;
}
const landHead = (r) => `${r.issuer || "內政部"} ${r.date || "日期不明"} ${r.docNo || "字號不明"}`;

// 臺北市解釋令函（manifest.taipei，第 3 級、只適用臺北市）與中央部會函釋（manifest.central：臺北市法規查詢系統轉載的消防署、經濟部、農業部函，第 2 級）
const EXTRA = {
  taipei: { key: "taipei", label: "臺北市政府解釋令函", level: "第 3 級：縣市主管機關的函釋，只適用臺北市；與條文或中央函釋不一致時以條文與中央函釋為準", none: "臺北市解釋令函：沒有找到（本庫收臺北市法規查詢系統「都市發展類」「工務類」）。" },
  nfa: { key: "nfa", label: "內政部消防署函釋（法令解釋、執法疑義）", level: "第 2 級：中央主管機關函釋（內政部、消防署）；發文機關是縣市政府或消防局的只屬第 3 級、只適用該縣市", none: "消防署函釋：沒有找到。本庫收內政部消防署「消防法令查詢系統」的法令解釋與執法疑義，查不到不代表沒有函釋。" },
  central: { key: "central", label: "中央部會函釋（經濟部工廠管理輔導相關函釋，含經濟部中部辦公室函釋彙編與經濟部主管法規查詢系統的解釋令；以及臺北市法規查詢系統轉載的消防署、經濟部、農業部函）", level: "第 2 級：中央主管機關函釋（發文機關以每則所載為準）", none: "中央部會函釋（經濟部、消防署等）：沒有找到。本庫收經濟部中部辦公室《工廠管理輔導法暨相關函釋彙編》（收到 112 年 5 月）、經濟部主管法規查詢系統的部分解釋令，以及臺北市法規查詢系統轉載在消防法、工廠管理輔導法、農業發展條例等條文下的函；查不到不代表沒有函釋。" },
};
// 函早於所涉條文的最近修正日：openlawtw 在 manifest.<kind>Refs.stale 算好（#62）。
const REFKEY = { agri: "agriRefs", land: "landRefs", nfa: "nfaRefs", taipei: "taipeiRefs", central: "centralRefs" };
async function staleMap(kind) { return (await refsOf(kind)).stale || {}; }
// 同來源「停止適用」：openlawtw 在 manifest.<kind>Refs.revoked 算好（函釋 id → [停止它的函 id, 日期, 字號, 是否部分]）
async function refsOf(kind) {
  try {
    const D = await fetchVersioned(async () => { const m = (await manifest())[REFKEY[kind]]; if (!m || !m.url) throw new Error("none"); return m; });
    return D || {};
  } catch { return {}; }
}
// ⛔ 已列出的停止函，其他「可能被停止」的提示（跨來源比對、MCP 自己的比對）點名同一份函時就不再重複
const nums = (t) => String(t).match(/\d{7,}/g) || [];
export function dropDup(rv, ws) {
  const seen = new Set(rv.flatMap(nums)), ids = rv.map((w) => (w.match(/id="([^"]+)"/) || [])[1]).filter(Boolean);
  return ws.filter((w) => !nums(w).some((n) => seen.has(n)) && !ids.some((id) => w.includes(id.replace(/^[a-z]+:/, ""))));
}
export async function revokedWarn(kind, r) {
  const v = ((await refsOf(kind)).revoked || {})[String(r.id)];
  if (!v) return [];
  const [by, date, label, partial] = v;
  return [`⛔ 已由 ${label || "較新的函"}（${date || "日期不明"}）${partial ? "部分" : ""}停止適用［get_ruling id="${kind}:${by}"］${partial ? "，引用前請讀該函確認哪些部分仍適用" : "，不能當依據"}`];
}
export async function staleWarn(kind, r) {
  const s = (await staleMap(kind))[String(r.id)] || [];
  return s.map(([, art, d, name]) => `⚠ ${name || ""}${art || ""}於 ${d} 修正，晚於本函（${r.date || "日期不明"}），引用前請對照現行條文`);
}
const extraCache = {};
async function extra(kind) {
  const D = await fetchVersioned(async () => {
    const m = (await manifest())[EXTRA[kind].key];
    if (!m || !m.url) throw new Error(`openlawtw 資料尚未提供${EXTRA[kind].label}（每週同步後才會有）`);
    return m;
  });
  const c = extraCache[kind];
  if (c && c.D === D) return c;
  return (extraCache[kind] = { D, list: D.items || [], byId: new Map((D.items || []).map((r) => [String(r.id), r])) });
}
const extraRefs = (r) => [...(r.filed || []).map((x) => `${x.law}${x.article ? " " + x.article : ""}`), ...(r.refs || []).map((x) => `${x.law}${(x.articles || []).length ? " " + [...new Set(x.articles)].join("、") : ""}`)];
const localIssuer = (r) => /^(臺北|台北|新北|桃園|臺中|台中|臺南|台南|高雄|基隆|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|連江)/.test(r.issuer || "") && !!r.kind; // 只用在消防署資料（有 kind 欄位）
const extraHead = (r) => `${r.issuer || ""} ${r.date || "日期不明"} ${r.docNo || "字號不明"}`.trim();
async function searchExtra(kind, { kws, lawName, article, limit, explicit }) {
  let ix;
  try { ix = await extra(kind); } catch (e) { return explicit ? e.message : ""; }
  const fk = kws.map(fold);
  const artNo = article ? normNo(article) : null;
  const out = ix.list.filter((r) => {
    if (lawName) {
      const laws = [...(r.filed || []).map((x) => [x.law, [x.article]]), ...(r.refs || []).map((x) => [x.law, x.articles || []])].filter(([n]) => n && (n === lawName || lawName.includes(n) || n.includes(lawName)));
      if (!laws.length) return false;
      if (artNo && !laws.some(([, arts]) => arts.some((a) => a && normNo(String(a).replace(/[第條\s]/g, "")) === artNo))) return false;
    }
    const blob = fold((r.summary || "") + "\n" + (r.body || "") + "\n" + (r.docNo || "") + "\n" + (r.issuer || ""));
    return fk.every((k) => has(blob, k));
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!out.length) return explicit ? EXTRA[kind].none : "";
  const lines = [`${EXTRA[kind].label}符合：${out.length} 則（依日期新到舊；${EXTRA[kind].level}）`];
  for (const r of out.slice(0, limit)) {
    lines.push(`\n■ [${kind}:${r.id}] ${extraHead(r)}${r.kind ? `（${r.kind}）` : ""}${/^\(廢\)/.test(r.issuer || "") ? "（發文機關已裁撤）" : ""}${localIssuer(r) ? `（${r.issuer}發文：第 3 級，只適用該縣市）` : ""}\n  ${String(r.summary || "").slice(0, 160)}`);
    if (r.abolished) lines.push("  ⚠ 消防法令查詢系統標示本則已停止適用／廢止，不能當依據");
    for (const w of [...(await revokedWarn(kind, r)), ...(await staleWarn(kind, r))]) lines.push("  " + w);
    const refs = [...new Set(extraRefs(r))];
    if (refs.length) lines.push(`  涉及：${refs.slice(0, 4).join("、")}${refs.length > 4 ? "…" : ""}`);
    if (r.body && kws.length) lines.push("  " + snippet(r.body, variants(kws), 60));
    if (r.origin) lines.push(`  出處：${r.origin}${(r.topics || []).length ? `；主題：${r.topics.join("、")}` : ""}`);
    lines.push(`  ${r.url ? r.url + "　" : ""}讀全文：get_ruling id="${kind}:${r.id}"`);
  }
  if (out.length > limit) lines.push(`\n（還有 ${out.length - limit} 則，用 source="${{ taipei: "臺北市", nfa: "消防署", central: "部會" }[kind]}" 並調大 limit）`);
  return lines.join("\n");
}

// 跨來源「停止適用／不再援用／廢止」：國土署、農業部、地政司三邊的函互相點名時也要標出來。
// 目標：被點名的函（以 7 碼以上字號比對）；回傳 key = "來源:id" → 最新的點名者。
let crossRev = null, crossKey = null;
async function crossRevocations() {
  let nl = null, ag = null, ld = null;
  try { nl = await rulings(); } catch {}
  try { ag = await agri(); } catch {}
  try { ld = await land(); } catch {}
  const key = [nl, ag, ld];
  if (crossRev && crossKey && crossKey.every((x, i) => x === key[i])) return crossRev;
  const all = [
    ...(nl ? nl.list.map((r) => ({ src: "nlma", id: String(r.id), no: r.number || "", date: r.date || "", body: r.body || "", head: `${r.number || ""}（${r.date || ""}）`, ref: `ruling ${r.id}` })) : []),
    ...(ag ? ag.list.map((r) => ({ src: "agri", id: String(r.id), no: r.docNo || "", date: r.date || "", body: r.body || "", head: agriHead(r), ref: `agri:${r.id}` })) : []),
    ...(ld ? ld.list.map((r) => ({ src: "land", id: String(r.id), no: r.docNo || "", date: r.date || "", body: r.body || "", head: landHead(r), ref: `land:${r.id}` })) : []),
  ];
  const byNum = new Map();
  for (const x of all) for (const n of x.no.match(/\d{7,}/g) || []) { if (!byNum.has(n)) byNum.set(n, []); byNum.get(n).push(x); }
  const map = new Map();
  for (const r of all) {
    const b = r.body;
    for (const m of b.matchAll(/停止適用|不再適用|不再援用|不予援用|(?:令|函)[^。；\n]{0,6}廢止/g)) {
      const win = b.slice(Math.max(0, m.index - 220), m.index + 40);
      const seg = b.slice(Math.max(0, m.index - 12), m.index);
      if (/(無|未|非|免|尚|並無)[^。]{0,6}$/.test(seg) && !/廢止/.test(m[0])) continue;
      const partial = /部分|部份|說明[一二三四五六七八九十]+[^。]{0,20}刪除|刪除/.test(win);
      for (const n of win.match(/\d{7,}/g) || []) {
        // 「前以 X 號函停止適用 Y 函」：X 是點名者不是被停用者
        if (new RegExp(n + "\\s*號?\\s*(?:函|令)?\\s*(?:停止適用|廢止|不再援用)").test(win.replace(/\s+/g, ""))) continue;
        for (const old of byNum.get(n) || []) {
          if (old === r || (r.no.match(/\d{7,}/g) || []).includes(n) || (old.date || "") > (r.date || "")) continue;
          const k = `${old.src}:${old.id}`;
          const prev = map.get(k);
          if (!prev || (prev.by.date || "") < r.date) map.set(k, { by: r, partial });
        }
      }
    }
  }
  crossRev = map; crossKey = key;
  return map;
}
// 只回傳「別的來源」點名的（同來源的由各自原本的偵測處理）；地政司全部都由這裡處理
export async function crossWarn(src, id) {
  const hit = (await crossRevocations().catch(() => new Map())).get(`${src}:${id}`);
  if (!hit || (src !== "land" && hit.by.src === src)) return [];
  return [`⚠ 本函${hit.partial ? "部分內容" : ""}可能已被 ${hit.by.head}［${hit.by.ref}］停止適用、刪除或不再援用，請讀該函確認`];
}

// 農業部（農地農舍）解釋函／令：openlawtw manifest.agri（每週同步）。
export async function loadAgri() {
  return fetchVersioned(async () => {
    const m = (await manifest()).agri;
    if (!m || !m.url) throw new Error("openlawtw 資料尚未提供農業部函釋（manifest.agri）");
    return m;
  });
}
let agriIndex = null, agriKey = null;
async function agri() {
  const D = await loadAgri();
  if (agriIndex && agriKey === D) return agriIndex;
  const byId = new Map(D.items.map((r) => [String(r.id), r]));
  // 「停止適用」：較新的函在正文點名舊函字號
  const revokedBy = new Map();
  const byNum = new Map();
  for (const r of D.items) for (const n of String(r.docNo || "").match(/\d{6,}/g) || []) byNum.set(n, r);
  for (const r of D.items) {
    const b = r.body || "";
    for (const m of b.matchAll(/停止適用|不再適用|不再援用|不予援用/g)) {
      const win = b.slice(Math.max(0, m.index - 220), m.index + 30);
      for (const n of win.match(/\d{7,}/g) || []) { const old = byNum.get(n); if (old && old !== r && (old.date || "") <= (r.date || "")) revokedBy.set(String(old.id), r); }
    }
  }
  agriIndex = { D, list: D.items, byId, revokedBy }; agriKey = D;
  return agriIndex;
}
const agriHead = (r) => `${r.issuer || "農業部"} ${r.date || "日期不明"} ${r.docNo || "字號不明"}${r.cls === "解釋令" ? "（解釋令）" : "函"}`;
async function landWarn(r) { const rv = await revokedWarn("land", r); return [...rv, ...dropDup(rv, await crossWarn("land", r.id))]; }
async function agriWarnAll(ix, r) {
  const rv = await revokedWarn("agri", r), by = ix.revokedBy.get(String(r.id));
  return [...rv, ...dropDup(rv, [...agriWarn(ix, r), ...(await crossWarn("agri", r.id))]), ...(await staleWarn("agri", r))];
}
function agriWarn(ix, r) { const by = ix.revokedBy.get(String(r.id)); return by ? [`⚠ 本函可能已被 ${agriHead(by)}［agri:${by.id}］停止適用，請讀該函確認`] : []; }

async function loadLaw(id) {
  return fetchVersioned(async () => {
    const entry = (await manifest()).laws[id];
    if (!entry) throw new Error(`資料庫裡沒有 ${id}`);
    return entry;
  });
}

let rulingsIndex = null;
async function rulings() {
  if (rulingsIndex) return rulingsIndex;
  const keys = Object.keys((await manifest()).rulings);
  const parts = await mapLimit(keys, 12, (k) => fetchVersioned(async () => (await manifest()).rulings[k]));
  const all = parts.flat();
  for (const r of all) if (!r.date || !r.number) fillHeader(r);
  // de-duplicate letters listed twice
  const seen = new Set();
  const list = [];
  const dupOf = new Map(); // duplicate id -> kept record
  const keptBy = new Map();
  for (const r of all) {
    const key = r.numberKey ? `${r.numberKey}|${r.date}` : `id:${r.id}`;
    if (seen.has(key)) { dupOf.set(String(r.id), { kept: keptBy.get(key), dup: r }); continue; }
    seen.add(key);
    keptBy.set(key, r);
    list.push(r);
  }
  const byId = new Map(list.map((r) => [String(r.id), r]));
  const byKey = new Map();
  for (const r of list) if (r.numberKey && !byKey.has(r.numberKey)) byKey.set(r.numberKey, r);
  rulingsIndex = { list, byId, byKey, dupOf, revokedBy: buildRevocations(list, byKey) };
  return rulingsIndex;
}

// Some letters start with an editor's note (※註：…) or a meeting title, so the
// source left date/number empty. Recover them from the first lines of the body.
const HEADER_RE = /((?:內政部|行政院|司法院|考選部|財政部|經濟部|法務部|臺灣省政府|台灣省政府)[^\d\n（）()]{0,10}?)?(\d{2,3})[.．](\d{1,2})[.．](\d{1,2})[.．]?\s*([^\s（）()「」，。]{1,24}?號)(函|令|代電|公告)?/;
function fillHeader(r) {
  const lines = String(r.body || "").split("\n").map((l) => l.trim()).filter((l) => l && !/^※?註[：:]/.test(l)).slice(0, 3);
  for (const l of lines) {
    const m = l.match(HEADER_RE);
    if (!m) continue;
    const [, agency = "", y, mo, d, no, kind = ""] = m;
    if (!r.date) r.date = `${Number(y) + 1911}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!r.number) {
      r.number = `${agency}${y}.${mo}.${d}${no}${kind}`.replace(/^x/, "");
      const core = cnDigitsToArabic((no.match(/第(.+?)號/) || no.match(/字(.+?)號/) || [, no])[1]).replace(/\D/g, "");
      if (!r.numberKey && core.length >= 4) r.numberKey = core;
      r.headerFromBody = true;
    }
    return;
  }
}

// ---------------------------------------------------------------- numbers

const CN = { "零": 0, "〇": 0, "○": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
const CN_UNIT = { "十": 10, "百": 100, "千": 1000 };

function cn2int(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if ([...s].every((c) => c in CN)) return parseInt([...s].map((c) => CN[c]).join(""), 10); // 一一三 = 113
  let total = 0, num = 0;
  for (const ch of s) {
    if (ch in CN) num = CN[ch];
    else if (ch in CN_UNIT) { total += (num || 1) * CN_UNIT[ch]; num = 0; }
    else throw new Error(s);
  }
  return total + num;
}

function normNo(s) {
  let t = String(s).replace(/[ 　]/g, "").replace(/^第/, "").replace("條之", "-").replace("點之", "-").replace(/[條點]$/, "");
  t = t.replace(/之/g, "-").replace(/[－—]/g, "-");
  try { return t.split("-").filter(Boolean).map((p) => String(cn2int(p))).join("-"); } catch { return t; }
}

const cnDigitsToArabic = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[零〇○一二三四五六七八九]{3,}/g, (m) => [...m].map((c) => CN[c]).join(""));

const ROC_DATE = /(?:中華)?民國\s*([〇零一二三四五六七八九十百0-9]+)\s*年\s*([〇零一二三四五六七八九十0-9]+)\s*月\s*([〇零一二三四五六七八九十0-9]+)\s*日/;
function rocDate(text) {
  const m = ROC_DATE.exec(text || "");
  if (!m) return null;
  try {
    const [y, mo, d] = m.slice(1).map(cn2int);
    return `${String(y + 1911).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  } catch { return null; }
}

// ---------------------------------------------------------------- amendments

function expandList(chunk) {
  const out = [];
  for (const part of chunk.replace(/\s/g, "").split(/[、，,]/)) {
    if (!part) continue;
    if (/[～~]/.test(part)) {
      const [a, b] = part.split(/[～~]/);
      const pa = a.split("-"), pb = b.split("-");
      if (pa.length === 1 && pb.length === 1) for (let i = +pa[0]; i <= +pb[0]; i++) out.push(String(i));
      else if (pa.length === 2 && pb.length === 2 && pa[0] === pb[0]) for (let i = +pa[1]; i <= +pb[1]; i++) out.push(`${pa[0]}-${i}`);
      else out.push(a, b);
    } else out.push(part);
  }
  return out;
}

const amendCache = new Map();
function amendments(law) {
  if (amendCache.has(law.id)) return amendCache.get(law.id);
  const dates = {};
  let full = null;
  for (const item of ("\n" + (law.history || "")).split(/\n\s*\d+\.\s*/)) {
    const text = item.replace(/\s*\n\s*/g, "");
    const d = rocDate(text);
    if (!d) continue;
    if (/全文\s*\d*\s*條|修正發布全文|修正全文/.test(text)) full = full && full > d ? full : d;
    for (const m of text.matchAll(/第\s*([0-9][0-9\-、～~，,\s]*?)\s*條/g)) {
      for (const no of expandList(m[1])) {
        const k = normNo(no);
        if (k && (dates[k] || "") < d) dates[k] = d;
      }
    }
  }
  const r = { dates, full };
  amendCache.set(law.id, r);
  return r;
}

function articleAmended(law, no) {
  const { dates, full } = amendments(law);
  let d = dates[normNo(no)];
  if (full && (!d || full > d)) d = full;
  return d || null;
}

function enactedDate(law) {
  return rocDate((law.history || "").split("\n")[0]);
}

// ---------------------------------------------------------------- revocations

function buildRevocations(list, byKey) {
  const revokedBy = new Map(); // old ruling id -> { by, partial }
  const NUM = /第\s*([0-9A-Za-z]{5,12})\s*號/g;
  for (const r of list) {
    const body = cnDigitsToArabic(r.body || "");
    for (const m of body.matchAll(/([^。；\n]{0,200}?)(停止適用|不再援用|不再適用)/g)) {
      let seg = m[1];
      if (/(無|未|非|不|免)[廢止或]{0,3}$/.test(seg)) continue; // 「尚無廢止或停止適用」
      // 「A 號函…業經 B 號函停止適用」: B revokes A
      let revoker = r;
      const k = seg.lastIndexOf("經");
      if (k >= 0) {
        const after = [...seg.slice(k).matchAll(NUM)].map((x) => x[1]);
        if (after.length) {
          const b = byKey.get(after[after.length - 1]);
          if (b) revoker = b;
          seg = seg.slice(0, k);
        }
      }
      const nums = [...seg.matchAll(NUM)].map((x) => x[1]);
      if (!nums.length) continue;
      const targets = /等\s*\d*\s*[函則件]/.test(seg) ? nums : [nums[nums.length - 1]];
      const partial = /部分|說明[一二三四五六七八九十0-9]|第\s*[0-9一二三四五六七八九十]+\s*[點項款]/.test(seg.slice(seg.lastIndexOf(targets[targets.length - 1])));
      for (const n of targets) {
        const old = byKey.get(n);
        if (!old || old.id === revoker.id || (old.date || "") >= (revoker.date || "")) continue;
        const prev = revokedBy.get(String(old.id));
        if (!prev || (prev.by.date || "") < (revoker.date || "")) revokedBy.set(String(old.id), { by: revoker, partial });
      }
    }
  }
  return revokedBy;
}

// ---------------------------------------------------------------- laws

const lawLink = (id, anchor) => `${SITE}/laws/${encodeURIComponent(id)}.html${anchor ? "#" + anchor : ""}`;

async function resolveLaw(q, region) {
  const laws = (await catalog()).laws;
  q = String(q).trim();
  const byId = laws.find((l) => l.id === q);
  if (byId) return { law: byId, others: [] };
  const al = await aliases();
  const target = al[q.toLowerCase()] || al[q] || q;
  const pool = laws.filter((l) => !region || l.region === region);
  const exact = pool.filter((l) => fold(l.name) === fold(target)).sort((a, b) => (a.region !== "中央") - (b.region !== "中央"));
  if (exact.length) return { law: exact[0], others: [] };
  // 指定了縣市但該縣市沒有同名法規：若全庫有完全同名者（例如中央的「建築法」），直接用它，避免子字串誤配到地方辦法
  if (region) {
    const any = laws.filter((l) => fold(l.name) === fold(target));
    if (any.length) return { law: any.sort((a, b) => (a.region !== "中央") - (b.region !== "中央"))[0], others: [] };
  }
  let cand = pool.filter((l) => fold(l.name).includes(fold(target)));
  if (!cand.length) {
    const pat = new RegExp([...fold(target)].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"));
    cand = pool.filter((l) => pat.test(fold(l.name)));
  }
  if (!cand.length) return { law: null, others: [] };
  cand.sort((a, b) => (a.region !== "中央") - (b.region !== "中央") || a.name.length - b.name.length);
  return { law: cand[0], others: cand[0].name.startsWith(target) ? [] : cand.slice(1, 8) };
}

function lawHeader(law) {
  const lines = [`${law.name}（${law.region || ""}｜${law.kind || ""}）[${law.id}]`];
  const first = enactedDate(law);
  if (first) lines.push(`制定／訂定日期：${first}`);
  if (law.modified) lines.push(`整部法規最新修正日期：${law.modified}（不是各條的修正日；各條看「本條最近修正」）`);
  if (law.status && law.status.includes("廢止") && !law.status.includes("未標")) lines.push(`⚠ 狀態：${law.status}`);
  if (law.effectiveNote) lines.push("施行日註記：" + law.effectiveNote.replace(/\n/g, " "));
  if (law.url) lines.push(`官方來源：${law.url}`);
  return lines.join("\n");
}

function clean(text, law) {
  if (law.region === "中央") return text;
  return text.replace(/(?<![。：；！？」）)])\n\s*\n?\s*/g, "").replace(/\n\s*\n/g, "\n");
}

function articleAttachments(law, art) {
  const files = law.attachments || [];
  if (!files.length) return [];
  const no = normNo(art.no);
  const labels = new Set([...art.text.matchAll(/(附[表圖件][一二三四五六七八九十〇0-9]+)/g)].map((m) => m[1]));
  const picked = [], seen = new Set();
  for (const f of files) {
    const t = f.title || "";
    const m = /^第\s*([0-9\-之]+)\s*條/.exec(t);
    const mine = (m && normNo(m[1]) === no) || [...labels].some((lb) => t.startsWith(lb));
    if (!mine) continue;
    const stem = t.replace(/\.(pdf|doc|docx|odt|jpg|png)$/i, "");
    if (seen.has(stem)) continue;
    seen.add(stem);
    picked.push(f);
  }
  return picked;
}

// ---------------------------------------------------------------- exceptions (但書、除外、免除)

const EXC_RULES = [
  ["但書", /(^|[。；：\s])但[^書]/],
  ["但書", /不在此限/],
  ["除外", /除[^。；]{1,80}?外[，、之]/],
  ["免受限制", /得?不受[^。；]{0,40}(限制|規定|拘束)/],
  ["不適用", /不適用/],
  ["免計／免設", /(得不計入|(?<!包括|包含|併計|合併)不計入|免計|得免|免予|免辦|免設|免附|免檢討)/],
  ["另有規定", /另有規定者?，?從其規定/],
];
const KUAN = /^\s*([一二三四五六七八九十]+)、/;
const MU = /^\s*[（(]([一二三四五六七八九十]+)[）)]/;

function exceptionsOf(text) {
  const out = [];
  let para = 0, kuan = null, mu = null;
  const lines = text.split(/\n/).filter((l) => l.trim() && !/[┌┐└┘├┤┬┴┼│─]/.test(l) && !(/^ {2,}/.test(l) && !KUAN.test(l) && !MU.test(l)));
  const paraCount = lines.filter((l) => !KUAN.test(l) && !MU.test(l)).length;
  for (const line of lines) {
    if (KUAN.test(line)) { kuan = KUAN.exec(line)[1]; mu = null; }
    else if (MU.test(line)) { mu = MU.exec(line)[1]; }
    else { para++; kuan = null; mu = null; }
    for (const sentence of line.split(/(?<=。)/)) {
      const kinds = [...new Set(EXC_RULES.filter(([, re]) => re.test(sentence)).map(([k]) => k))];
      if (!kinds.length) continue;
      const where = [paraCount > 1 ? `第${para}項` : "", kuan ? `第${kuan}款` : "", mu ? `第${mu}目` : ""].join("");
      out.push({ where, kinds, text: sentence.trim().replace(/\s+/g, " ") });
    }
  }
  return out;
}

const findArticle = (law, no) => law.articles.find((a) => normNo(a.no) === normNo(no)) || null;
const isDeleted = (a) => /^\s*[（(]?\s*刪除/.test(a.text);

function attSnippet(text, ks) {
  const keep = text.replace(/[ \t]+/g, "").replace(/\n+/g, "⏎");
  return ks.some((k) => keep.includes(k)) ? snippet(keep, ks) : snippet(text.replace(/\s+/g, ""), ks);
}

function snippet(text, kws, width = 70) {
  const t = text.replace(/\n/g, " ");
  const positions = kws.map((k) => t.indexOf(k)).filter((p) => p >= 0);
  const pos = positions.length ? Math.min(...positions) : 0;
  const s = Math.max(0, pos - Math.floor(width / 3));
  return (s ? "…" : "") + t.slice(s, s + width * 2) + (s + width * 2 < t.length ? "…" : "");
}

// ---------------------------------------------------------------- self-references (conflicts)

const CNNUM = "[一二三四五六七八九十百零〇]+(?:條之[一二三四五六七八九十]+)?";
const SELF_REF = new RegExp(`(本編|本規則|本辦法|本細則|本條例|本標準|本準則|本法)((?:第${CNNUM}條(?:[至、及或與]|規定)?)+)`, "g");
const toNo = (x) => x.split(/條之/).map(cn2int).join("-");
function refTargets(chain) {
  const out = [];
  const items = [...chain.matchAll(new RegExp(`(至)?第(${CNNUM})條`, "g"))];
  for (const it of items) {
    let no;
    try { no = toNo(it[2]); } catch { continue; }
    if (it[1] && out.length && !no.includes("-") && !out[out.length - 1].includes("-")) {
      for (let i = +out[out.length - 1] + 1; i < +no; i++) out.push(String(i));
    }
    out.push(no);
  }
  return out;
}

function selfRefWord(name) {
  if (/編$/.test(name)) return ["本編", "本規則"];
  if (/施行細則$/.test(name)) return ["本細則"];
  if (/辦法$/.test(name)) return ["本辦法"];
  if (/規則$/.test(name)) return ["本規則"];
  if (/條例$/.test(name)) return ["本條例"];
  if (/標準$/.test(name)) return ["本標準"];
  if (/準則$/.test(name)) return ["本準則"];
  if (/法$/.test(name)) return ["本法"];
  return [];
}

function brokenRefs(law, onlyArticle) {
  const words = selfRefWord(law.name);
  if (!words.length) return [];
  const byNo = new Map(law.articles.map((a) => [normNo(a.no), a]));
  const out = [];
  for (const a of law.articles) {
    if (onlyArticle && normNo(a.no) !== normNo(onlyArticle)) continue;
    if (isDeleted(a)) continue;
    for (const m of a.text.matchAll(SELF_REF)) {
      if (!words.includes(m[1])) continue;
      for (const no of refTargets(m[2])) {
        const t = byNo.get(no);
        const label = `${m[1]}第 ${no} 條`;
        if (!t) out.push({ from: a.no, ref: label, problem: "引用的條文不存在" });
        else if (isDeleted(t)) out.push({ from: a.no, ref: label, problem: "引用的條文已刪除" });
      }
    }
  }
  return out;
}

function invalidNotes(law, onlyArticle) {
  const out = [];
  for (const a of law.articles) {
    if (onlyArticle && normNo(a.no) !== normNo(onlyArticle)) continue;
    const m = /[（(]註[：:][^）)]*無效[^）)]*[）)]/.exec(a.text) || /[^。\n]*函告[^。\n]*無效[^。\n]*/.exec(a.text);
    if (m) out.push({ article: a.no, note: m[0].replace(/\s+/g, " ") });
  }
  return out;
}

// ---------------------------------------------------------------- ruling warnings

async function rulingWarnings(r) {
  const notes = [];
  const idx = await rulings();
  const rev = idx.revokedBy.get(String(r.id));
  if (rev) notes.push(`⚠ ${rev.partial ? "部分內容" : "本函釋"}已由 ${rev.by.number}（${rev.by.date}）停止適用 [ruling ${rev.by.id}]`);
  notes.push(...(await crossWarn("nlma", r.id)));
  const laws = (await manifest()).laws;
  for (const x of r.refs || []) {
    if (!x.article || !laws[x.law]) continue;
    const law = await loadLaw(x.law);
    const d = articleAmended(law, x.article);
    if (d && r.date && r.date < d) notes.push(`⚠ ${law.name}${x.article}於 ${d} 修正，晚於本函釋（${r.date}），引用前請對照現行條文`);
  }
  return notes;
}

async function refsText(r) {
  const names = new Map((await catalog()).laws.map((l) => [l.id, l.name]));
  return (r.refs || []).map((x) => `${names.get(x.law) || x.law} ${x.article || ""}`.trim()).join("、");
}

// ---------------------------------------------------------------- tools

export async function findLaw({ query, region, limit = 20 }) {
  const laws = (await catalog()).laws;
  const regions = new Set(laws.map((l) => l.region));
  const al = await aliases();
  const terms = [];
  for (const t of String(query || "").split(/\s+/).filter(Boolean)) {
    if (regions.has(fold(t)) && !region) region = fold(t); else terms.push(t);
  }
  const variants = (t) => new Set([t, al[t.toLowerCase()] || al[t] || t, FAMILIES[t]].filter(Boolean));
  const hits = laws
    .filter((l) => !region || l.region === region)
    .filter((l) => terms.includes(l.id) || terms.every((t) => [...variants(t)].some((v) => fold(l.name).includes(fold(v)))))
    .sort((a, b) => (a.region !== "中央") - (b.region !== "中央") || a.name.length - b.name.length);
  if (!hits.length) return "沒有找到。可以換個關鍵字，或用 search_articles 搜條文內容。";
  return hits.slice(0, limit).map((l) => `${l.id}｜${l.region}｜${l.kind || ""}｜${l.name}（修正 ${l.modified || "—"}，${l.articleCount ?? "?"} 條）`).join("\n")
    + (hits.length > limit ? `\n…還有 ${hits.length - limit} 部` : "");
}

// 關聯檢討提示：常見「只看本條會答錯」的跨條、跨法規組合（只放條文本身沒寫、但實務上必須一起檢討的）
const RELATED = {
  "M0110013|12": "解除套繪是建管程序；之後若要分割配耕地，耕地（非都市土地農牧用地等）分割後每宗原則上要 0.25 公頃以上：農業發展條例第 16 條、耕地分割執行要點。89 年前以配合耕地核准的舊案也可考慮更換配合耕地（內政部 99.09.21 內授營建管字第0990807865號函）。",
  "M0020001|18": "農舍面積、高度等依農業用地興建農舍辦法；解除套繪依同辦法第 12 條。",
  "M0020001|16": "建管同意解除農舍套繪不代表地政准分割；分割程序細節見耕地分割執行要點。",
  "D0070115|69": "表下但書：作業廠房樓地板面積合計超過 50㎡ 者，主要構造要用不燃材料；工廠只有三層以上才要防火構造。",
  "D0070115|162": "工廠類建築物（第十四章適用者）陽臺不能免計，見第 273 條；免計項目合計上限依本條第 1 項第 2 款但書（只須一座直通樓梯者 10%，其餘 15%）。",
  "D0070115|59": "都市計畫土管要點常另訂較嚴的停車標準，從其規定；機車停車位依土管或都設規定。",
  "D0070115|95": "要二座直通樓梯時，另檢討第 96 條安全梯、第 96-1 條住宅免改設；面積可依第 89 條第 5 款扣除機械房、樓梯間等。",
  "D0070115|167": "第 3 項：設置確有困難者，可經主管建築機關核准不適用本章一部或全部（各縣市有審查程序）；工廠類依營建署 103.07.14 營署建管字第1030044357號書函仍要檢討。",
  "D0070115|269": "第十四章只適用工業區、丁種建築用地內的工廠；其他分區（窯業用地、農業區等）的廠房不適用第 270～276 條。",
  "D0060013|9": "都市計畫範圍內不適用本條，依各都市計畫土管要點；縣市政府可調降。",
};
export async function getArticle({ law, articles, region }) {
  const { law: meta, others } = await resolveLaw(law, region);
  if (!meta) return `找不到法規「${law}」。請先用 find_law 確認名稱。`;
  const L = await loadLaw(meta.id);
  const parts = [lawHeader(L)];
  if (others.length) parts.push(`（「${law}」對到多部法規，先用最可能的一部；其他候選：${others.map((o) => `${o.name} [${o.id}]`).join("、")}）`);
  if (!(L.articles || []).length && (await documentIds()).includes(L.id)) {
    parts.push("這部是原文文件（PDF／HTML），沒有逐條條文。請用 search_documents 搜尋，或 get_document 讀節號／頁碼" + (((await manifest()).documentReaders || {})[L.id] ? "（例：section=\"805\"）" : "") + "。");
    return parts.join("\n");
  }
  const nos = (Array.isArray(articles) ? articles : [articles]).filter(Boolean);
  if (!nos.length) parts.push("（沒有指定條號。可以用 list_articles 看章節目錄。）");
  for (const no of nos) {
    const art = findArticle(L, no);
    parts.push("──────────────");
    if (!art) {
      const base = normNo(no).split("-")[0];
      const near = L.articles.filter((a) => normNo(a.no).split("-")[0] === base).map((a) => a.no);
      parts.push(`找不到「${no}」。${near.length ? "相近：" + near.join("、") : ""}`);
      continue;
    }
    const path = (art.path || []).join(" > ");
    const amended = articleAmended(L, art.no);
    const att = articleAttachments(L, art);
    let text = clean(art.text, L);
    if (att.length) text = text.replace(/\n?圖表附件：[^\n]*/g, "");
    const lines = [`${L.name} ${art.no}${path ? `［${path}］` : ""}${amended ? `（本條最近修正：${amended}）` : ""}`, text];
    const AL0 = attLaw(L.id);
    for (const f of att.slice(0, 8)) {
      const k = AL0 && attKeyOf(f.title || "");
      const hd = k && AL0.docs.find((d) => d.key === k);
      const has = !!hd;
      const secArg = hd && hd.units.some((u) => u.id === "表") ? `${k} 表` : k;
      lines.push(`圖表附件：${f.title}　${f.url}${has ? `　（已抽出文字，可用 get_document document="${L.name}" section="${secArg}" 直接讀／search_documents 搜）` : ""}`);
    }
    if (att.length > 8) lines.push(`（另有 ${att.length - 8} 個附件，請看官方來源）`);
    const ALx = attLaw(L.id);
    if (!att.length && /附[表圖]/.test(art.text)) lines.push(ALx && ALx.docs.length ? `（條文提到附表／附圖；本庫已自行抽出文字的附表：${ALx.docs.map((d) => d.key).join("、")}，用 get_document document="${L.name}" section="${ALx.docs[0].key}" 讀，PDF 抽出，引用前請核對原檔）` : "（條文提到附表／附圖，本庫沒有對應附件連結，請開官方來源查看）");
    const exc = exceptionsOf(clean(art.text, L));
    if (exc.length) {
      lines.push(`【例外與但書】${exc.length} 處（適用前要逐一確認是否符合）`);
      for (const e of exc.slice(0, 12)) lines.push(`  ・${e.where ? e.where + "：" : ""}[${e.kinds.join("、")}] ${e.text.length > 160 ? e.text.slice(0, 160) + "…" : e.text}`);
      if (exc.length > 12) lines.push(`  …另有 ${exc.length - 12} 處`);
    }
    for (const b of brokenRefs(L, art.no)) lines.push(`⚠ 本條引用的「${b.ref}」${b.problem.replace('引用的條文', '')}，請查證現行適用規定`);
    const rel = RELATED[`${L.id}|${normNo(art.no)}`]; if (rel) lines.push(`【關聯檢討】${rel}`);
    lines.push(`連結：${lawLink(L.id, art.anchor)}`);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n");
}

export async function listArticles({ law, region }) {
  const { law: meta } = await resolveLaw(law, region);
  if (!meta) return `找不到法規「${law}」。`;
  const L = await loadLaw(meta.id);
  const out = [lawHeader(L)];
  let last = null;
  for (const a of L.articles) {
    const path = (a.path || []).join(" > ");
    if (path !== last) { out.push(`\n［${path || "（無章節）"}］`); last = path; }
    out.push(`  ${a.no}  ${a.text.trim().split("\n")[0].slice(0, 40)}`);
  }
  return out.join("\n");
}

export async function searchArticles({ keywords, region, law, limit = 15, any = false }) {
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/)).filter(Boolean);
  if (!kws.length) return "請給至少一個關鍵字。";
  const cat = (await catalog()).laws;
  let ids;
  if (law) {
    ids = [];
    for (const x of String(law).split(/[,，]/)) {
      const { law: m } = await resolveLaw(x, region);
      if (m) ids.push(m.id);
    }
  } else {
    const regions = new Set(String(region || "中央").split(/[,，]/));
    ids = cat.filter((l) => regions.has(l.region) || regions.has("全部")).map((l) => l.id);
  }
  const mf = (await manifest()).laws;
  const laws = await mapLimit(ids.filter((i) => mf[i]), 16, loadLaw);
  const hits = [];
  const fk = kws.map(fold);
  for (const L of laws) for (const a of L.articles) {
    const ft = fold(a.text);
    const matched = fk.filter((k) => has(ft, k)).length;
    if (matched === kws.length || (any && matched)) hits.push({ matched, n: fk.reduce((s, k) => s + ft.split(k).length - 1, 0), L, a });
  }
  hits.sort((x, y) => y.matched - x.matched || y.n - x.n || (x.L.region !== "中央") - (y.L.region !== "中央"));
  const out = [`搜尋「${kws.join(" ")}」：${hits.length} 條符合（範圍：${laws.length} 部法規）`];
  for (const h of hits.slice(0, limit)) out.push(`\n■ ${h.L.name} ${h.a.no}${articleAmended(h.L, h.a.no) ? `（本條最近修正 ${articleAmended(h.L, h.a.no)}）` : ""}　[${h.L.id}]\n  ${snippet(clean(h.a.text, h.L), variants(kws))}\n  ${lawLink(h.L.id, h.a.anchor)}`);
  if (hits.length > limit) out.push(`\n…還有 ${hits.length - limit} 條，加大 limit 或增加關鍵字。`);
  if (!hits.length && !any) out.push("沒有全部關鍵字都符合的條文。可以設 any=true，或換同義詞再查。開挖率、建蔽率、容積率、退縮等常規定在各都市計畫的土地使用分區管制要點：桃園市的用 search_landuse 查，其他縣市本庫未收錄。");
  if (!hits.length) out.push("無障礙設施設計規範、耐震設計規範、綠建築各項技術規範等是原文文件，請改用 search_documents。");
  return out.join("\n");
}

export async function searchRulings({ keywords, law, article, limit = 10, source }) {
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/)).filter(Boolean);
  const src = /消防署/.test(source || "") ? "nfa" : /北/.test(source || "") ? "taipei" : /消防|經濟|部會|central/i.test(source || "") ? "central" : /農/.test(source || "") ? "agri" : /地政/.test(source || "") ? "land" : /全|all/i.test(source || "") ? "all" : /國土|營建|nlma/i.test(source || "") ? "nlma" : "auto";
  let lawId = null, lawName = null;
  if (law) {
    const { law: m } = await resolveLaw(law);
    if (!m) return `找不到法規「${law}」。`;
    lawId = m.id; lawName = m.name;
  }
  if (src === "taipei" || src === "central" || src === "nfa") return searchExtra(src, { kws, lawName, article, limit, explicit: true });
  const kwText = kws.join(" ") + " " + (lawName || "");
  const extraTopic = EXTRA_RE.test(kwText);
  const fireTopic = FIRE_RE.test(kwText);
  const nfaPart = src === "auto" || src === "all" ? await searchExtra("nfa", { kws, lawName, article, limit: fireTopic ? limit : Math.min(limit, 2), explicit: false }) : "";
  const centralPart = src === "auto" || src === "all" ? await searchExtra("central", { kws, lawName, article, limit: extraTopic ? limit : Math.min(limit, 3), explicit: false }) : "";
  const taipeiPart = (src === "all" || /臺北|北市/.test(fold(kwText)) || /臺北市/.test(lawName || "")) ? await searchExtra("taipei", { kws: kws.filter((k) => !/^(臺北市?|北市)$/.test(fold(k))), lawName, article, limit: Math.min(limit, 5), explicit: false }) : "";
  const landTopic = LAND_RE.test(kws.join(" ") + " " + (lawName || ""));
  const landPart = src === "nlma" || src === "agri" ? "" : await searchLand({ kws, lawName, article, limit: src === "land" || landTopic ? limit : Math.min(limit, 3), explicit: src === "land" });
  if (src === "land") return landPart;
  const agriTopic = AGRI_RE.test(kws.join(" ") + " " + (lawName || ""));
  const agriPart = src === "nlma" ? "" : await searchAgri({ kws, lawName, article, limit: src === "agri" || agriTopic ? limit : Math.min(limit, 5), explicit: src === "agri" });
  if (src === "agri") return agriPart;
  const nlmaPart = await searchNlma({ kws, lawId, article, limit });
  const landNote = /分割/.test(kws.join(" ")) ? "\n\n（提醒：土地分割是地政程序，耕地分割後每宗原則要 0.25 公頃以上（農業發展條例第 16 條），耕地以外的農業用地不受此限；細節看耕地分割執行要點（find_law query=\"耕地分割執行要點\"）與地政司函釋（search_rulings source=\"地政司\"）。建管同意解除套繪不代表地政准分割。）" : "";
  const main = !agriPart ? nlmaPart : agriTopic ? `（農地農舍相關問題：農業部函釋列在前面，國土署函釋在後，兩邊都要讀）\n\n${agriPart}\n\n${nlmaPart}` : nlmaPart + "\n\n" + agriPart;
  let res = !landPart ? main : landTopic ? `（地政相關問題：內政部地政司函釋列在前面，都要讀）\n\n${landPart}\n\n${main}` : main + "\n\n" + landPart;
  if (centralPart) res = extraTopic ? `（消防、工廠等問題：消防署、經濟部等部會函釋列在前面，都要讀）\n\n${centralPart}\n\n${res}` : res + "\n\n" + centralPart;
  if (nfaPart) res = fireTopic ? `（消防問題：消防署函釋列在最前面，國土署等函釋在後，都要讀）\n\n${nfaPart}\n\n${res}` : res + "\n\n" + nfaPart;
  if (taipeiPart) res += "\n\n" + taipeiPart;
  return res + landNote;
}

const FIRE_RE = /消防|防火管理|滅火|警報|排煙|避難器具|撒水|灑水|緩降機|避難指標|標示設備|公共危險物品|可燃性高壓氣體|檢修申報|防焰|消防栓|火警|瓦斯漏氣|各類場所/;
const EXTRA_RE = /消防|防火管理|滅火|警報|排煙|避難器具|撒水|工廠|工業區|工廠登記|特定工廠|工廠管理輔導法/;
const LAND_RE = /分割|地政|登記|地籍|共有|繼承|地上權|地目|土地法|平均地權|非都市土地|使用分區變更|使用地變更|編定|法定空地分割|耕地/;

async function searchLand({ kws, lawName, article, limit, explicit }) {
  let ix;
  try { ix = await land(); } catch (e) { return explicit ? `地政司函釋目前無法讀取：${e.message}` : ""; }
  const fk = kws.map(fold);
  const artNo = article ? normNo(article) : null;
  const out = ix.list.filter((r) => {
    if (lawName) {
      let refs = (r.refs || []).filter((x) => x.law && (x.law === lawName || lawName.includes(x.law) || x.law.includes(lawName)));
      if (artNo) refs = refs.filter((x) => x.article && normNo(String(x.article).replace(/[第條\s]/g, "")) === artNo);
      if (!refs.length) return false;
    }
    const blob = fold((r.summary || "") + "\n" + (r.body || "") + "\n" + (r.docNo || ""));
    return fk.every((k) => has(blob, k));
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!out.length) return explicit ? "內政部地政司函釋：沒有找到。本庫收的是地政司「地政法令彙編」解釋函（依法條分類），查不到不代表沒有函釋。" : "";
  const lines = [`內政部地政司函釋符合：${out.length} 則（依日期新到舊；來源：內政部地政司地政法令彙編，屬第 2 級中央主管機關函釋，適用於土地法、土地登記、耕地分割、非都市土地使用管制等地政事項）`];
  for (const r of out.slice(0, limit)) {
    lines.push(`\n■ [land:${r.id}] ${landHead(r)}\n  ${r.summary || ""}`);
    const refs = [...new Set((r.refs || []).map((x) => `${x.law}${x.article ? " " + x.article : ""}`))];
    if (refs.length) lines.push(`  涉及：${refs.slice(0, 4).join("、")}${refs.length > 4 ? "…" : ""}`);
    for (const w of [...(await landWarn(r)), ...(await staleWarn("land", r))]) lines.push("  " + w);
    if (r.body && kws.length) lines.push("  " + snippet(r.body, variants(kws), 60));
    lines.push(`  讀全文：get_ruling id="land:${r.id}"`);
  }
  if (out.length > limit) lines.push(`\n（地政司函釋還有 ${out.length - limit} 則，用 source="地政司" 並調大 limit）`);
  return lines.join("\n");
}

const AGRI_RE = /農舍|套繪|農地|農業用地|農業設施|資材室|農牧|耕地|農用證明|農業使用|農業發展條例|配合耕地|配耕/;

async function searchAgri({ kws, lawName, article, limit, explicit }) {
  let ix;
  try { ix = await agri(); } catch (e) { return explicit ? `農業部函釋目前無法讀取：${e.message}` : ""; }
  const fk = kws.map(fold);
  const out = ix.list.filter((r) => {
    if (lawName && !(r.laws || []).some((n) => n === lawName || n.includes(lawName) || lawName.includes(n))) return false;
    const blob = fold((r.title || "") + "\n" + (r.body || ""));
    if (article) { const a = String(article).replace(/之/g, "-"); const [m, sub] = a.split("-"); const pats = sub ? [`第${m}條之${sub}`, `第${a}條`] : [`第${m}條`]; if (!pats.some((p) => blob.includes(p) && (sub || !blob.includes(`第${m}條之`) || blob.split(p).length > blob.split(`第${m}條之`).length))) return false; }
    return fk.every((k) => has(blob, k));
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!out.length) return explicit ? "農業部（農地農舍）函釋：沒有找到。本庫只收農村發展及水土保持署「農地及農舍法規檢索系統」上的通案函釋。" : "";
  const lines = [`農業部（農地農舍）函釋符合：${out.length} 則（依日期新到舊；來源：農村發展及水土保持署農地及農舍法規檢索系統，屬第 2 級中央主管機關函釋，發文機關以每則所載為準）`];
  for (const r of out.slice(0, limit)) {
    lines.push(`\n■ [agri:${r.id}] ${agriHead(r)}\n  ${r.title || ""}`);
    if ((r.laws || []).length) lines.push(`  涉及：${r.laws.join("、")}`);
    for (const w of await agriWarnAll(ix, r)) lines.push("  " + w);
    if (r.body) lines.push("  " + snippet(r.body, kws.length ? variants(kws) : [""], 60));
    lines.push(`  ${r.url || ""}　讀全文：get_ruling id="agri:${r.id}"`);
  }
  if (out.length > limit) lines.push(`\n（農業部函釋還有 ${out.length - limit} 則，用 source="農業部" 並調大 limit）`);
  return lines.join("\n");
}

async function searchNlma({ kws, lawId, article, limit }) {
  const idx = await rulings();
  const artNo = article ? normNo(article) : null;
  const out = idx.list.filter((r) => {
    if (lawId) {
      let ok = (r.refs || []).filter((x) => x.law === lawId);
      if (artNo) ok = ok.filter((x) => x.article && normNo(x.article) === artNo);
      if (!ok.length) return false;
    }
    const blob = fold((r.title || "") + "\n" + (r.body || ""));
    return kws.every((k) => has(blob, k));
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const lines = [`國土署函釋符合：${out.length} 則（依日期新到舊）`];
  for (const r of out.slice(0, limit)) {
    lines.push(`\n■ [${r.id}] ${r.date || "日期不明"}　${r.number || "字號不明"}${r.headerFromBody ? "（由正文推得）" : ""}\n  ${r.title || ""}`);
    if (r.refs && r.refs.length) lines.push(`  涉及：${await refsText(r)}`);
    for (const w of await rulingWarnings(r)) lines.push("  " + w);
    if (r.body) lines.push("  " + snippet(r.body, kws.length ? variants(kws) : [""], 60));
    lines.push(`  ${r.url || ""}`);
  }
  if (!out.length) lines.push("國土署函釋沒有找到（下面若有其他來源的函釋請一併讀）。查不到不代表沒有函釋。");
  return lines.join("\n");
}


// 函內引用的其他函：標出本庫有收（給 id）或未收錄
async function citedLetters(body, selfNo, extraIds = [], max = 12) {
  const out = [], seen = new Set();
  let nl = null, ag = null;
  try { nl = await rulings(); } catch {}
  try { ag = await agri(); } catch {}
  let ld = null; try { ld = await land(); } catch {}
  const xs = {}; for (const k of ["nfa", "central", "taipei"]) { try { xs[k] = await extra(k); } catch {} }
  const selfKeys = new Set(String(selfNo || "").match(/\d{6,}/g) || []);
  for (const m of String(body || "").matchAll(/((?:[\u4e00-\u9fff][ \t\r\n　]{0,20}){0,9}[\u4e00-\u9fff]字第\s*[A-Za-z]?\s*[0-9][0-9\-\s]{5,}[0-9]\s*號)/g)) {
    const no = m[1].replace(/\s+/g, "").replace(/^.*[於日曰月年及與暨、函之並和或以已同部會]/, "").replace(/^(?:本署)+/, "");
    const key = (no.match(/\d{6,}/g) || [])[0];
    if (!key || selfKeys.has(key) || seen.has(key)) continue;
    const before = String(body).slice(Math.max(0, m.index - 40), m.index);
    // 來函（「復貴府…函」「依據貴局…函」）與地方機關的公文不是解釋函，跳過
    const tail = before.slice(-30), gi = tail.lastIndexOf("貴");
    // 「復貴府…函」是來函；「貴府所援引之本部…函」是本部的函，不能跳過
    if (/(復|依據|依|准)\s*(貴|臺端|台端|○)[^，。；]*$/.test(tail) || (gi >= 0 && /^貴[府局處會所部署院][^，。；]*$/.test(tail.slice(gi)) && !/本[部署會]|援引|所引|引用|所提/.test(tail.slice(gi))) || /^(府|縣|市|新北|北市|北府|桃|中市|中府|高市|南市|竹|苗|彰|投|雲|嘉|屏|宜|花|東|澎|金|連|基)/.test(no)) { seen.add(key); continue; }
    seen.add(key);
    const hitN = nl && nl.list.find((r) => (r.number || "").replace(/\s+/g, "").includes(key));
    const hitA = !hitN && ag && ag.list.find((r) => (r.docNo || "").replace(/\s+/g, "").includes(key));
    const hitL = !hitN && !hitA && ld && ld.list.find((r) => (r.docNo || "").replace(/\s+/g, "").includes(key));
    let hitX = null;
    if (!hitN && !hitA && !hitL) for (const k of ["nfa", "central", "taipei"]) { const ix = xs[k]; const r = ix && ix.list.find((x) => (x.docNo || "").replace(/\s+/g, "").includes(key)); if (r) { hitX = `${k}:${r.id}`; break; } }
    out.push(hitN ? `${no} → 本庫有：get_ruling id="${hitN.id}"` : hitA ? `${no} → 本庫有：get_ruling id="agri:${hitA.id}"` : hitL ? `${no} → 本庫有：get_ruling id="land:${hitL.id}"` : hitX ? `${no} → 本庫有：get_ruling id="${hitX}"` : `${no} → 被引用但本庫未收錄，要引用請找原函（未見原文，僅供參考）`);
    if (out.length >= max) break;
  }
  return out.length ? ["本函引用的其他函：", ...out.map((x) => "  ・" + x)] : [];
}

export async function getRuling({ id }) {
  const xm = String(id || "").trim().match(/^(taipei|central|nfa|臺北市?|部會|消防署?)[:：\-\s]*(\S+)$/i);
  if (xm) {
    const kind = /central|部會/i.test(xm[1]) ? "central" : /nfa|消防/i.test(xm[1]) ? "nfa" : "taipei";
    const ix = await extra(kind);
    const r = ix.byId.get(xm[2]);
    if (!r) return `找不到 ${kind}:${xm[2]}。`;
    const refs = [...new Set(extraRefs(r))];
    return [`${extraHead(r)}［${kind}:${r.id}］${r.kind ? `（${r.kind}）` : ""}`, r.summary || "", refs.length ? `涉及：${refs.join("、")}` : "", r.abolished ? "⚠ 消防法令查詢系統標示本則已停止適用／廢止，不能當依據" : "", ...(await revokedWarn(kind, r)), ...(await staleWarn(kind, r)), (r.topics || []).length ? `主題：${r.topics.join("、")}` : "", localIssuer(r) ? `（${r.issuer}發文：第 3 級，只適用該縣市）` : `（${EXTRA[kind].level}；來源：${r.origin || ix.D.source || ""}）`, "──────────────", r.body || "（無全文）", "──────────────", ...(await citedLetters(r.body, r.docNo)), `來源：${r.url || (r.origin ? r.origin + (/彙編/.test(r.origin) ? "（PDF 彙編，無個別網頁）" : "") : ix.D.sourceUrl || "")}`].filter(Boolean).join("\n");
  }
  const lm = String(id || "").trim().match(/^(?:land|地政司?)[:：\-\s]*([0-9a-f]{6,})$/i);
  if (lm) {
    const ix = await land();
    const r = ix.byId.get(lm[1].toLowerCase());
    if (!r) return `找不到地政司函釋 land:${lm[1]}。`;
    const refs = [...new Set((r.refs || []).map((x) => `${x.law}${x.article ? " " + x.article : ""}`))];
    return [`${landHead(r)}［land:${r.id}］`, r.summary || "", refs.length ? `涉及：${refs.join("、")}` : "", ...(await landWarn(r)), ...(await staleWarn("land", r)), "（第 2 級：中央主管機關函釋；來源：內政部地政司地政法令彙編。彙編可能附註後來的修正或停止適用，請讀全文的按語）", "──────────────", r.body || "（無全文）", "──────────────", ...(await citedLetters(r.body, r.docNo)), `來源：${ix.D.sourceUrl || "內政部地政司地政法令彙編"}`].filter(Boolean).join("\n");
  }
  const am = String(id || "").trim().match(/^(?:agri|農業部?)[:：\-\s]*(\d+)$/i);
  if (am) {
    const ix = await agri();
    const r = ix.byId.get(am[1]);
    if (!r) return `找不到農業部函釋 agri:${am[1]}。`;
    return [`${agriHead(r)}［agri:${r.id}］`, r.title || "", (r.laws || []).length ? `涉及：${r.laws.join("、")}` : "", ...(await agriWarnAll(ix, r)), "（第 2 級：中央主管機關函釋；來源：農村發展及水土保持署農地及農舍法規檢索系統）", "──────────────", r.body || "（無全文）", "──────────────", ...(await citedLetters(r.body, r.docNo)), `來源：${r.url || ""}`].filter(Boolean).join("\n");
  }
  const idx = await rulings();
  let r = idx.byId.get(String(id));
  let dupNote = "";
  if (!r && idx.dupOf.has(String(id))) {
    const { kept, dup } = idx.dupOf.get(String(id));
    r = kept;
    dupNote = `（ruling ${id} 是國土署網站重複登錄的同一封函（字號、日期相同），內容以 ruling ${kept.id} 呈現；原登錄頁：${dup.url || ""}）`;
  }
  if (!r) return `找不到函釋 ${id}。`;
  const lines = [`${r.number || "（字號不明）"}（${r.date || "日期不明"}${r.unit ? "，" + r.unit : ""}）[ruling ${r.id}]`, r.title || ""];
  if (dupNote) lines.push(dupNote);
  if (r.headerFromBody) lines.push("（原始資料缺字號與日期，以上是從正文推得，引用前請開原文確認）");
  if (r.refs && r.refs.length) lines.push(`涉及：${await refsText(r)}`);
  lines.push(...(await rulingWarnings(r)));
  lines.push("──────────────", r.body || "（本庫未收錄全文，只能引用標題與字號，請看原始連結）", "──────────────", ...(await citedLetters(r.body, r.number)), `來源：${r.url || ""}`);
  return lines.join("\n");
}

export async function checkConflicts({ law, article, region }) {
  const { law: meta } = await resolveLaw(law, region);
  if (!meta) return `找不到法規「${law}」。`;
  const L = await loadLaw(meta.id);
  const lines = [`衝突檢查：${L.name}${article ? " " + (findArticle(L, article)?.no || article) : "（全部條文）"}`];
  const broken = brokenRefs(L, article);
  lines.push(`\n【引用已刪除或不存在的條文】${broken.length} 處`);
  for (const b of broken.slice(0, 30)) lines.push(`  ${b.from}：「${b.ref}」${b.problem}`);
  const inv = invalidNotes(L, article);
  lines.push(`\n【經函告無效或部分無效的註記】${inv.length} 處`);
  for (const x of inv) lines.push(`  ${x.article}：${x.note}`);
  const idx = await rulings();
  const artNo = article ? normNo(article) : null;
  const linked = idx.list.filter((r) => (r.refs || []).some((x) => x.law === L.id && (!artNo || (x.article && normNo(x.article) === artNo))));
  const revoked = linked.filter((r) => idx.revokedBy.has(String(r.id)));
  const stale = [];
  for (const r of linked) for (const x of r.refs || []) {
    if (x.law !== L.id || !x.article || (artNo && normNo(x.article) !== artNo)) continue;
    const d = articleAmended(L, x.article);
    if (d && r.date && r.date < d) { stale.push({ r, art: x.article, d }); break; }
  }
  lines.push(`\n【已被停止適用的函釋】${revoked.length} 則（相關函釋共 ${linked.length} 則）`);
  for (const r of revoked.slice(0, 20)) {
    const v = idx.revokedBy.get(String(r.id));
    lines.push(`  [${r.id}] ${r.date} ${r.number} → ${v.partial ? "部分" : ""}停止適用，依 [${v.by.id}] ${v.by.date} ${v.by.number}`);
  }
  lines.push(`\n【早於條文修正的函釋】${stale.length} 則`);
  for (const s of stale.slice(0, 20)) lines.push(`  [${s.r.id}] ${s.r.date} ${s.r.number}：${s.art}於 ${s.d} 修正`);
  lines.push("\n說明：以上為自動比對結果，「停止適用」依函釋全文字句判斷，引用前請開原文確認。中央與地方規定的實質差異無法自動判斷。");
  return lines.join("\n");
}


// ---------------------------------------------------------------- documents (PDF / HTML 原文文件，例如無障礙設施設計規範)

const docLink = (id, page) => `${SITE}/laws/${encodeURIComponent(id)}.html${page ? "#document-page-" + page : ""}`;

async function loadDocText(id) {
  return fetchVersioned(async () => {
    const e = ((await manifest()).documentTexts || {})[id];
    if (!e) throw new Error(`${id} 沒有原文文字`);
    return e;
  });
}
async function loadDocReader(id) {
  const has = ((await manifest()).documentReaders || {})[id];
  if (!has) return null;
  return fetchVersioned(async () => (await manifest()).documentReaders[id]);
}

// Units to search: reader sections (with section ids such as 805) when available, otherwise PDF/HTML pages.
async function docUnits(id) {
  const reader = await loadDocReader(id);
  if (reader) {
    const out = [];
    for (const ch of reader.chapters || []) {
      if (/封面|目錄/.test(ch.title)) continue;
      for (const sec of ch.sections || []) out.push({ label: sec.title, chapter: ch.title, page: sec.startPage, text: sec.text || "", sec });
    }
    return out;
  }
  const t = await loadDocText(id);
  return (t.pages || []).map((p) => ({ label: `第 ${p.page} 頁`, chapter: "", page: p.page, text: p.text || "" }));
}

async function documentIds() {
  return Object.keys((await manifest()).documentTexts || {});
}

async function resolveDocument(q, region) {
  const ids = new Set(await documentIds());
  const { law, others } = await resolveLaw(q, region);
  if (law && ids.has(law.id)) return law;
  const cand = [law, ...others].filter((l) => l && ids.has(l.id));
  if (cand.length) return cand[0];
  const cat = (await catalog()).laws.filter((l) => ids.has(l.id) && (!region || l.region === region));
  return cat.find((l) => l.name.includes(q)) || null;
}

// A clause like 805.1 inside section 805: from its line to the next numbered clause.
function clauseOf(text, id) {
  // A clause heading is the number followed by a space or its CJK title, e.g. 「207.3.2 與壁面距離」.
  // Lines like 「207.3.2)。」 are the tail of a figure reference and are not headings.
  // Cross-references that wrap to a line start (「202.4者」「207節規定」) are not headings either:
  // a heading stays in the same section (same first three digits) and is not followed by 者／節／之….
  const top = id.split(".")[0];
  const head = (l) => {
    const m = l.match(/^\s*(\d{3}(?:\.\d+)*)(?=[\s㐀-鿿])(?![者之節條項款規及或與等公])/);
    return m && m[1].split(".")[0] === top ? m[1] : null;
  };
  const lines = text.split("\n");
  const start = lines.findIndex((l) => head(l) === id);
  if (start < 0) return null;
  const depth = id.split(".").length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const n = head(lines[i]);
    if (n && n !== id && n.split(".").length <= depth && !n.startsWith(id + ".")) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

// PDF text breaks lines mid-sentence. Join soft breaks before looking for 但書, keeping
// real breaks before clause numbers, figures and tables.
function unwrapPdf(text) {
  return text.replace(/\n(?!\s*(?:\d{3}(?:\.\d+)*(?=[\s㐀-鿿])(?![者之節條項款規及或與等公])|[圖表]\s?\d|[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）))/g, (m, off) => (/[。：]$/.test(text.slice(0, off)) ? "\n" : ""));
}


// ---------------------------------------------------------------- 附件表（自行抽出文字的官方 PDF 附表）

const nk = (t) => String(t).normalize("NFKC").replace(/\s+/g, "");
const attLink = (d) => `https://law.moj.gov.tw/LawClass/LawGetFile.ashx?FileId=${d.fileId}`;
const attLaw = (id) => ATT.laws.find((x) => x.lawId === id);
const ATT_KEY = /附表[一二三四五六七八九十]?(?:之[一二三四五六七八九十]+)?|第[\d\-之]+條/;
const attKeyOf = (t) => { const m = nk(t).match(ATT_KEY); return m ? (m[0].startsWith("第") ? m[0].replace(/之/g, "-") : m[0]) : null; };

async function attHeader(AL, d) {
  const L = await loadLaw(AL.lawId);
  const lines = [lawHeader(L), `附表原檔：${d.title}.PDF　${attLink(d)}`,
    `（此附表文字由 PDF 自動抽出（${ATT.extractedAt}，原檔 sha256 ${d.sha.slice(0, 12)}…），不是 openlawtw 資料庫內容；表格欄位可能斷行，引用前請開原檔核對。）`];
  if (d.note) lines.push(`（${d.note}）`);
  if (L.modified && AL.lawModified && L.modified !== AL.lawModified) lines.push(`⚠ 法規最新修正日已變為 ${L.modified}，本附表抽出時法規為 ${AL.lawModified}，附表可能已修正，請以原檔為準。`);
  return lines.join("\n");
}

function attachmentHits(ks, any, lawIds) {
  const out = [];
  for (const AL of ATT.laws) {
    if (lawIds && !lawIds.has(AL.lawId)) continue;
    for (const d of AL.docs) {
      const docHits = [];
      for (const u of d.units) {
        const hay = nk(u.label + u.text);
        const fh = fold(hay);
        const matched = ks.filter((k) => fh.includes(fold(nk(k)))).length;
        if (matched === ks.length || (any && matched)) docHits.push({ AL, d, u, hay, matched, n: ks.reduce((x, k) => x + fh.split(fold(nk(k))).length - 1, 0) });
      }
      if (docHits.length) out.push(...docHits);
      else if (!any && ks.length > 1) {
        // Tables often span pages: keywords may sit on different pages of the same attachment.
        const per = ks.map((k) => d.units.find((u) => fold(nk(u.label + u.text)).includes(fold(nk(k)))));
        if (per.every(Boolean)) out.push({ AL, d, u: per[0], hay: nk(per[0].label + per[0].text), matched: ks.length - 0.5, n: 1, cross: ks.map((k, i) => `「${k}」在 ${per[i].id}`) });
      }
    }
  }
  return out.sort((a, b) => b.matched - a.matched || b.n - a.n);
}

async function getAttachment(document, section) {
  const key = attKeyOf(`${section || ""}`) || attKeyOf(`${document || ""}`);
  const lawQ = String(document || "").replace(new RegExp(ATT_KEY.source, "g"), "").replace(/完整條文/g, "").trim();
  if (!lawQ) return null;
  const { law } = await resolveLaw(lawQ);
  const AL = law && attLaw(law.id);
  if (!AL) return null;
  const sk = key && (AL.skipped || []).find((x) => x.key === key);
  if (sk && !AL.docs.some((x) => x.key === key)) return `${law.name}${key}沒有抽出文字（${sk.title.includes("公報") ? "官方附件是公報掃描頁，沒有表格內容" : "此附表未收文字"}）。請開原檔：${attLink(sk)}`;
  if (!key) {
    const sec0 = nk(section || "").toUpperCase();
    if (sec0) {
      const found = AL.docs.filter((d) => d.units.some((u) => nk(u.id).toUpperCase() === sec0));
      if (found.length === 1) return getAttachment(`${AL.lawName}`, `${found[0].key} ${section}`);
      if (found.length > 1) return `${AL.lawName}的「${section}」出現在多張附表，請指定：${found.map((d) => `section="${d.key} ${section}"`).join("、")}`;
    }
    const lines = [`${AL.lawName}　可讀的附表（PDF 抽出文字）：`];
    for (const d of AL.docs) lines.push(`  ${d.key}　${d.title}${d.units.length > 1 ? `（${d.units.length} 段／頁：${d.units.slice(0, 12).map((u) => u.id).join("、")}${d.units.length > 12 ? "…" : ""}）` : ""}`);
    for (const x of AL.skipped || []) lines.push(`  ${x.key}　${x.title}（${x.title.includes("公報") ? "公報掃描頁" : "未收文字"}，未收，請開原檔 ${attLink(x)}）`);
    const d0 = AL.docs[0]; if (d0) lines.push(`用法：get_document document="${AL.lawName}" section="${d0 ? (d0.units.length > 1 ? `${d0.key} ${d0.units[0].id}` : d0.key) : ""}"；或 search_documents 搜關鍵字。`);
    return lines.join("\n");
  }
  const d = AL.docs.find((x) => x.key === key);
  if (!d) {
    if (!key.startsWith("附表")) return null;
    const att = (await loadLaw(law.id)).attachments?.find((a) => nk(a.title).startsWith(key));
    if (!att) return `${law.name}沒有「${key}」這個附表。可讀的附表：${AL.docs.map((x) => x.key).join("、") || "（無）"}。不填 section 可以看目錄。`;
    return `${law.name}${key}目前只有官方 PDF 連結，沒有抽出文字（可能是掃描圖、申請書或流程圖，抽出後容易誤導，沒有收）。請開原檔：${att.url || ""}`;
  }
  const head = await attHeader(AL, d);
  let sec = String(section || "").replace(new RegExp(ATT_KEY.source, "g"), "").replace(/^[\s第]+/, "").replace(/[頁]$/, "").replace(/^p/i, "").trim();
  if (sec) {
    const want = nk(sec).toUpperCase();
    const u = d.units.find((x) => nk(x.id).toUpperCase() === want);
    if (!u) {
      // Row filter: the table's first column (e.g. 使用地類別「四、丁種建築用地」、用地類別「公園」) contains the section text.
      const want2 = nk(sec);
      const picked = [];
      for (const x of d.units) {
        const rows = x.text.split("\n").filter((r) => r.includes("｜") && !r.startsWith("（表頭）") && nk(r.split("｜")[0]).includes(want2));
        const cjk = (r) => r.replace(/(?<=[\u3000-\u9fff\uff00-\uffef])[ \t]+(?=[\u3000-\u9fff\uff00-\uffef])/g, "");
        if (rows.length) picked.push({ x, rows: rows.map(cjk) });
      }
      if (picked.length) {
        const hdr = (d.units[0].text.split("\n").find((r) => r.includes("｜")) || "").replace(/^（表頭）/, "").replace(/(?<=[\u3000-\u9fff])[ \t]+(?=[\u3000-\u9fff])/g, "");
        const out = [head, "──────────────", `${d.title}：第一欄含「${sec}」的列，共 ${picked.reduce((n, p) => n + p.rows.length, 0)} 列，在第 ${picked.map((p) => p.x.id).join("、")} 頁／段（跨頁的列可能不完整；表外的備註請讀整頁）`, hdr ? `（欄位）${hdr}` : ""].filter(Boolean);
        let len = 0, cut = false;
        for (const p of picked) {
          const blk = `── ${p.x.id} ──\n${p.rows.join("\n")}`;
          if (len + blk.length > 24000) { cut = true; break; }
          out.push(blk); len += blk.length;
        }
        if (cut) out.push(`（內容太長已截斷，其餘請用 section="${key} 頁碼" 逐頁讀）`);
        return out.join("\n");
      }
      return head + `\n──────────────\n${key} 沒有「${sec}」。可用：${d.units.map((x) => x.id).join("、")}（也可填表格第一欄的類別，例如使用地或用地名稱）`;
    }
    return head + `\n──────────────\n${u.label}\n${u.text}`;
  }
  if (d.units.length === 1) return head + `\n──────────────\n${d.units[0].text}`;
  return head + `\n──────────────\n${d.title}（共 ${d.units.length} 段／頁），可用 section 讀：${d.units.map((x) => x.id).join("、")}，或用 search_documents 搜關鍵字。`;
}

export async function searchDocuments({ keywords, document, region, limit = 10, any = false }) {
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/)).filter(Boolean);
  const cat = new Map((await catalog()).laws.map((l) => [l.id, l]));
  if (!kws.length) {
    const readers = (await manifest()).documentReaders || {};
    const regions = region ? new Set(String(region).split(/[,，]/)) : null;
    const docs = (await documentIds()).map((i) => cat.get(i) || { id: i, name: i, region: "" }).filter((l) => !regions || regions.has("全部") || regions.has(l.region));
    docs.sort((a, b) => (a.region !== "中央") - (b.region !== "中央") || a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
    return [`原文文件 ${docs.length} 份（給 keywords 就會搜尋內文）：`, ...docs.map((l) => `  ${l.region}｜${l.name}　[${l.id}]${readers[l.id] ? "　可依節號讀" : ""}`), `另有自行抽出文字的官方 PDF 附表：\n${ATT.laws.map((x) => `  ${x.lawName}　${x.docs.length ? x.docs.map((d) => d.key).join("、") : "（附表未收文字，僅附原檔連結）"}`).join("\n")}\n（例：document="變使" section="附表四 B-3"；document="非都管制規則" section="附表一 5"（頁））`].join("\n");
  }
  let ids = await documentIds();
  if (document) {
    const d = await resolveDocument(document, region);
    const r = (await resolveLaw(String(document).replace(new RegExp(ATT_KEY.source, "g"), "").trim() || document)).law;
    if (!d && !(r && attLaw(r.id))) return `找不到原文文件「${document}」。可以不填 document 搜全部 ${ids.length} 份原文文件。`;
    ids = d ? [d.id] : [];
  } else if (region) {
    const regions = new Set(String(region).split(/[,，]/));
    ids = ids.filter((i) => regions.has("全部") || regions.has(cat.get(i)?.region));
  }
  const ks = kws.map((k) => fold(k.replace(/\s+/g, ""))).filter(Boolean);
  const hits = [];
  for (const id of ids) {
    let units;
    try { units = await docUnits(id); } catch { continue; }
    for (const u of units) {
      // PDF text is often letter-spaced (「適 用 範 圍」), so compare without whitespace.
      const raw = (u.label + u.text).replace(/\s+/g, "");
      const hay = fold(raw);
      const matched = ks.filter((k) => has(hay, k)).length;
      if (matched === ks.length || (any && matched)) hits.push({ id, u, hay: raw, matched, n: ks.reduce((s, k) => s + hay.split(k).length - 1, 0) });
    }
  }
  let attIds = null;
  if (document) { const r = (await resolveLaw(String(document).replace(new RegExp(ATT_KEY.source, "g"), "").trim() || document)).law; attIds = new Set(r ? [r.id] : []); }
  else if (region) { const rg = new Set(String(region).split(/[,，]/)); if (!rg.has("全部") && !rg.has("中央")) attIds = new Set(); }
  const ahits = attachmentHits(ks, any, attIds);
  const attIn = ahits.length > 0;
  const attCount = ATT.laws.filter((x) => !attIds || attIds.has(x.lawId)).reduce((n, x) => n + x.docs.length, 0);
  hits.sort((a, b) => b.matched - a.matched || b.n - a.n);
  const out = [`在 ${ids.length} 份原文文件${attCount ? `與 ${attCount} 份自行抽出文字的附表` : ""}搜尋「${kws.join(" ")}」：${hits.length + ahits.length} 處符合`];
  for (const h of ahits.slice(0, limit)) out.push(`\n■ ${h.AL.lawName}　${h.u.label}${h.cross ? `\n  ⚠ 關鍵字分散在同一附表的不同頁（表格跨頁）：${h.cross.join("、")}，請分別讀這幾頁一起判斷` : ""}　[附表原檔 ${attLink(h.d)}]\n  ${attSnippet(h.u.text, variants(ks))}\n  用 get_document（document="${h.AL.lawName}" section="${nk(h.u.id) === h.d.key ? h.d.key : h.d.key + " " + h.u.id}"）讀全文；此為 PDF 抽出文字，引用前請開原檔核對。`);
  for (const h of hits.slice(0, limit)) {
    const L = cat.get(h.id) || { name: h.id };
    const secId = h.u.sec ? h.u.sec.id : "";
    out.push(`\n■ ${L.name}　${h.u.label}${h.u.chapter ? `（${h.u.chapter}）` : ""}　PDF 第 ${h.u.page} 頁　[${h.id}${secId ? " / " + secId : ""}]\n  ${snippet(h.hay.slice(h.u.label.replace(/\s+/g, "").length), variants(ks))}\n  ${docLink(h.id, h.u.page)}`);
  }
  if (hits.length > limit) out.push(`\n…還有 ${hits.length - limit} 處，加大 limit 或增加關鍵字。`);
  if (hits.length) out.push("\n用 get_document 讀全文（section 填節號如 805 或 805.1，或填 page）。");
  else if (!any && !ahits.length) out.push("沒有全部關鍵字都符合的段落，可以設 any=true 或換同義詞。");
  return out.join("\n");
}

export async function getDocument({ document, section, page, region }) {
  const att = await getAttachment(document, section);
  if (att) return att;
  const meta = await resolveDocument(document || "", region);
  if (!meta) return `找不到原文文件「${document}」。可以先用 search_documents 搜尋。`;
  const L = await loadLaw(meta.id);
  const head = [lawHeader(L)];
  for (const a of (L.attachments || []).slice(0, 3)) head.push(`原檔：${a.title}　${a.url}`);
  head.push("（本文件為官方 PDF／HTML 原文擷取的文字；圖、表、公式請以原檔為準。）");
  const reader = await loadDocReader(meta.id);
  const cap = (t) => (t.length > 6000 ? t.slice(0, 6000) + "\n…（內容過長已截斷，請開連結看全文）" : t);
  if (section && reader) {
    const want = String(section).replace(/^第/, "").trim();
    const base = want.split(".")[0];
    for (const ch of reader.chapters || []) for (const sec of ch.sections || []) {
      if (sec.id !== base && sec.id !== want && !sec.title.startsWith(want)) continue;
      const body = want.includes(".") ? clauseOf(sec.text || "", want) : sec.text;
      if (!body) return head.join("\n") + `\n──────────────\n${sec.title} 裡找不到 ${want}。`;
      const exc = exceptionsOf(unwrapPdf(body));
      const lines = [`${L.name}　${want.includes(".") ? want : sec.title}［${ch.title}］　PDF 第 ${sec.startPage}${sec.endPage && sec.endPage !== sec.startPage ? "–" + sec.endPage : ""} 頁`, cap(body)];
      if (exc.length) {
        lines.push(`【例外與但書】${exc.length} 處（適用前要逐一確認是否符合）`);
        for (const e of exc.slice(0, 10)) lines.push(`  ・[${e.kinds.join("、")}] ${e.text.length > 160 ? e.text.slice(0, 160) + "…" : e.text}`);
      }
      lines.push(`連結：${docLink(L.id, sec.startPage)}`);
      return head.join("\n") + "\n──────────────\n" + lines.join("\n");
    }
    return head.join("\n") + `\n──────────────\n找不到節號「${section}」。不填 section 可以看目錄。`;
  }
  if (page) {
    const t = await loadDocText(meta.id);
    const p = (t.pages || []).find((x) => x.page === Number(page));
    if (!p) return head.join("\n") + `\n──────────────\n沒有第 ${page} 頁（共 ${(t.pages || []).length} 頁）。`;
    return head.join("\n") + `\n──────────────\n${L.name}　PDF 第 ${p.page} 頁\n${cap(p.text || "")}\n連結：${docLink(L.id, p.page)}`;
  }
  if (reader) {
    const toc = [];
    for (const ch of reader.chapters || []) {
      if (/封面|目錄/.test(ch.title)) continue;
      toc.push(`${ch.title}（PDF ${ch.startPage}–${ch.endPage} 頁）`);
      for (const sec of ch.sections || []) toc.push(`  ${sec.title}　p.${sec.startPage}`);
    }
    return head.join("\n") + "\n──────────────\n目錄（section 填節號讀全文）：\n" + toc.join("\n");
  }
  const t = await loadDocText(meta.id);
  const pages = t.pages || [];
  return head.join("\n") + `\n──────────────\n共 ${pages.length} 頁（page 填頁碼讀全文）：\n` + pages.slice(0, 40).map((p) => `  第 ${p.page} 頁：${(p.text || "").replace(/\s+/g, " ").slice(0, 50)}`).join("\n") + `\n連結：${docLink(L.id)}`;
}

export async function dataInfo() {
  const m = await manifest(), c = await catalog(), idx = await rulings();
  return [
    `openlawtw 資料版本 ${m.release}，收錄 ${Object.keys(m.laws).length} 部法規、${idx.list.length} 則函釋`,
    `原文文件 ${Object.keys(m.documentTexts || {}).length} 份（PDF／HTML，用 search_documents、get_document 查），其中建築物無障礙設施設計規範可依節號查詢`,
    `最近同步：${c.collected}`,
    `資料來源：${BASE}`,
    `自行抽出文字的官方 PDF 附表：${ATT.laws.filter((x) => x.docs.length).map((x) => x.lawName).join("、")}（用 get_document／search_documents 查，PDF 抽出，引用前請核對原檔）`,
    "收錄範圍：中央與 22 縣市建築、都市計畫、土地使用相關法規；國土管理署（原營建署）函釋彙編。",
    `桃園市法規疑義會議紀錄：另見 search_minutes（只適用桃園市；第 3 或第 4 級，視決議由誰作成）`,
    `桃園市都市計畫土管要點：另見 search_landuse（只有桃園市；其他縣市未收）`,
    `農業部（農地農舍）函釋：search_rulings source="農業部"（${(await loadAgri().catch(() => ({ items: [] }))).items.length} 則）`,
    `內政部地政司函釋（地政法令彙編）：search_rulings source="地政司"（${(await loadLand().catch(() => ({ items: [] }))).items.length} 則）；耕地分割執行要點：find_law query="耕地分割執行要點"`,
    `新北市建照業務工作手冊：search_ntpc_manual（${(await loadNtpc().catch(() => ({ cases: [] }))).cases.length} 案）`,
    `臺北市解釋令函：search_rulings source="臺北市"（${(await extra("taipei").catch(() => ({ list: [] }))).list.length} 則）`,
    `內政部消防署函釋（法令解釋、執法疑義）：search_rulings source="消防署"（${(await extra("nfa").catch(() => ({ list: [] }))).list.length} 則）`,
    `中央部會函釋（經濟部工廠函釋彙編收到 112 年 5 月，另有臺北市法規查詢系統轉載的消防署、經濟部等函）：search_rulings source="部會"（${(await extra("central").catch(() => ({ list: [] }))).list.length} 則${(await extra("central").then(() => "", () => "，尚未同步"))}）`,
    "未收錄：桃園以外各都市計畫書與土地使用分區管制要點；桃園、臺北以外各縣市政府的函釋；經濟部 112 年 5 月以後的函釋（只有彙編、部分解釋令與臺北市系統轉載的部分）；其他部會（如環境部、交通部）的函釋。",
  ].join("\n");
}

export const _internal = { docUnits, clauseOf, unwrapPdf, fillHeader, cache, exceptionsOf, normNo, cn2int, rulings, loadLaw, brokenRefs, catalog };

// 求解器用：某條文目前的「本條最近修正日」、法規名稱與 openlawtw 連結；另查某則國土署函釋現在是否已被停止適用
export async function articleInfo(lawId, artNo) {
  const L = await loadLaw(lawId);
  const art = findArticle(L, String(artNo));
  return { name: L.name, amended: art ? articleAmended(L, art.no) : null, exists: !!art, deleted: !!(art && isDeleted(art)), invalid: art ? (invalidNotes(L, art.no)[0]?.note || null) : null, url: `${SITE}/laws/${encodeURIComponent(lawId)}.html#a-${artNo}` };
}
export async function rulingRevokedNow(id) {
  const idx = await rulings();
  const rev = idx.revokedBy.get(String(id));
  return rev ? `${rev.partial ? "部分內容" : ""}已由 ${rev.by.number}（${rev.by.date}）停止適用` : null;
}

// 給 scripts/missing-cited.mjs：掃各來源全文，統計被引用、但本庫沒有收的函（字號 → 次數、出處）
export async function scanMissingCited() {
  const srcs = [];
  try { const ix = await rulings(); for (const r of ix.list) srcs.push([`國土署 ${r.id}`, r.content || r.body || "", r.number]); } catch {}
  try { const ix = await agri(); for (const r of ix.list) srcs.push([`agri:${r.id}`, r.body, r.docNo]); } catch {}
  try { const ix = await land(); for (const r of ix.list) srcs.push([`land:${r.id}`, r.body, r.docNo]); } catch {}
  for (const k of ["nfa", "central", "taipei"]) { try { const ix = await extra(k); for (const r of ix.list) srcs.push([`${k}:${r.id}`, r.body, r.docNo]); } catch {} }
  try { const D = await loadMinutes(); for (const it of D.items) srcs.push([`桃園 minutes ${it.id}`, (it.pages || []).map((p) => p.text).join("\n"), ""]); } catch {}
  const miss = new Map();
  for (const [where, body, self] of srcs) {
    for (const line of await citedLetters(body, self, [], 200)) {
      const m = line.match(/^  ・(.+?) → 被引用但本庫未收錄/); if (!m) continue;
      const key = (m[1].match(/\d{6,}/) || [])[0]; const e = miss.get(key) || { no: m[1], n: 0, where: [] };
      e.n++; if (e.where.length < 3) e.where.push(where); miss.set(key, e);
    }
  }
  return [...miss.values()].sort((a, b) => b.n - a.n);
}

// 給 verify_citations：用字號裡的 6 碼以上數字在所有函釋來源找這份函
export async function findLetter(key) {
  const norm = (t) => String(t || "").replace(/\s+/g, "");
  try { const ix = await rulings(); const r = ix.list.find((x) => norm(x.number).includes(key)); if (r) { const rev = ix.revokedBy.get(String(r.id)); return { id: String(r.id), src: "國土署", date: r.date, no: r.number, revoked: rev ? `${rev.partial ? "部分" : ""}已由 ${rev.by.number}（${rev.by.date}）停止適用` : null }; } } catch {}
  try { const ix = await agri(); const r = ix.list.find((x) => norm(x.docNo).includes(key)); if (r) { const w = await revokedWarn("agri", r); return { id: `agri:${r.id}`, src: "農業部", date: r.date, no: r.docNo, revoked: w[0] || null }; } } catch {}
  try { const ix = await land(); const r = ix.list.find((x) => norm(x.docNo).includes(key)); if (r) { const w = await revokedWarn("land", r); return { id: `land:${r.id}`, src: "地政司", date: r.date, no: r.docNo, revoked: w[0] || null }; } } catch {}
  for (const k of ["nfa", "central", "taipei"]) { try { const ix = await extra(k); const r = ix.list.find((x) => norm(x.docNo).includes(key)); if (r) { const w = await revokedWarn(k, r); return { id: `${k}:${r.id}`, src: { nfa: "消防署", central: "部會", taipei: "臺北市" }[k], date: r.date, no: r.docNo, revoked: w[0] || (r.abolished ? "消防法令查詢系統標示已停止適用／廢止" : null) }; } } catch {} }
  try { const D = await loadMinutes(); const r = D.items.find((x) => norm(x.docNo).includes(key)); if (r) return { id: `minutes ${r.id}`, src: "桃園會議紀錄", date: r.docDate || null, no: r.docNo, revoked: null }; } catch {}
  try { const D = await loadLanduse(); const r = D.items.find((x) => norm(x.docNo).includes(key)); if (r) return { id: `landuse ${r.id}`, src: "桃園土管公告", date: r.date || null, no: r.docNo, revoked: null }; } catch {}
  return null;
}
export async function resolveLawId(name) { try { const r = await resolveLaw(name); return r && r.law ? { id: r.law.id, name: r.law.name } : null; } catch { return null; } }

// 結構化輸出用：一則函釋的基本資料（字號、日期、來源、級別、是否已停止適用）
export async function rulingMeta(id) {
  id = String(id || "").trim();
  const m = id.match(/^(agri|land|nfa|central|taipei):(.+)$/);
  const LV = { nlma: 2, agri: 2, land: 2, nfa: 2, central: 2, taipei: 3 };
  const NAME = { nlma: "國土署", agri: "農業部", land: "地政司", nfa: "消防署", central: "部會", taipei: "臺北市" };
  try {
    if (!m) {
      const ix = await rulings(); const r = ix.byId.get(id); if (!r) return null;
      const rev = ix.revokedBy.get(id);
      return { id, source: NAME.nlma, level: 2, date: r.date || null, doc_no: r.number || null, revoked: rev ? `${rev.partial ? "部分" : ""}已由 ${rev.by.number}（${rev.by.date}）停止適用` : null, revoked_by: rev ? String(rev.by.id) : null, url: r.url || null };
    }
    const [, k, rid] = m;
    const ix = k === "agri" ? await agri() : k === "land" ? await land() : await extra(k);
    const r = ix.byId.get(k === "land" ? rid.toLowerCase() : rid); if (!r) return null;
    const v = ((await refsOf(k)).revoked || {})[String(r.id)];
    let level = LV[k]; if (k === "nfa" && localIssuer(r)) level = 3;
    return { id: `${k}:${r.id}`, source: NAME[k], level, date: r.date || null, doc_no: r.docNo || null, revoked: v ? `${v[3] ? "部分" : ""}已由 ${v[2]}（${v[1]}）停止適用` : (r.abolished ? "消防法令查詢系統標示已停止適用／廢止" : null), revoked_by: v ? `${k}:${v[0]}` : null, url: r.url || null };
  } catch { return null; }
}

// 給 verify_citations：某部法規條文裡的「函告無效」註記（含發文字號），用來核對回答引用的院臺字號
export async function lawInvalidNotes(lawId) { try { return invalidNotes(await loadLaw(lawId)); } catch { return []; } }
