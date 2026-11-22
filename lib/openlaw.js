// openlawtw data access + legal lookup logic (no dependencies).
// Data comes from the openlawtw static JSON API and is cached in memory.

const SITE = "https://openlawtw.vercel.app";
const BASE = (process.env.OPENLAW_BASE || SITE).replace(/\/$/, "");
const TTL_MS = 6 * 3600 * 1000; // manifest / catalog refresh

const cache = new Map(); // path -> { at, data }
const pending = new Map();

async function fetchJSON(path, immutable = true) {
  const hit = cache.get(path);
  if (hit && (immutable || Date.now() - hit.at < TTL_MS)) return hit.data;
  if (pending.has(path)) return pending.get(path);
  const p = (async () => {
    const res = await fetch(BASE + path, { headers: { "User-Agent": "openlawtw-mcp/1.0" } });
    if (!res.ok) {
      if (hit) return hit.data;
      throw new Error(`無法取得 ${path}（HTTP ${res.status}）`);
    }
    const data = await res.json();
    cache.set(path, { at: Date.now(), data });
    return data;
  })().finally(() => pending.delete(path));
  pending.set(path, p);
  return p;
}

const manifest = () => fetchJSON("/data/manifest.json", false);
const catalog = () => fetchJSON("/data/catalog.json", false);

const EXTRA_ALIASES = {
  "危老獎勵": "都市危險及老舊建築物建築容積獎勵辦法",
  "危老容積獎勵": "都市危險及老舊建築物建築容積獎勵辦法",
  "危老獎勵辦法": "都市危險及老舊建築物建築容積獎勵辦法",
  "危老細則": "都市危險及老舊建築物加速重建條例施行細則",
  "危老施行細則": "都市危險及老舊建築物加速重建條例施行細則",
  "危老結構評估": "都市危險及老舊建築物結構安全性能評估辦法",
};
const FAMILIES = { "危老": "都市危險及老舊建築物", "都更": "都市更新", "建技": "建築技術規則", "非都": "非都市土地", "綠建築": "綠建" };

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

async function loadLaw(id) {
  const entry = (await manifest()).laws[id];
  if (!entry) throw new Error(`資料庫裡沒有 ${id}`);
  return fetchJSON(entry.url);
}

let rulingsIndex = null;
async function rulings() {
  if (rulingsIndex) return rulingsIndex;
  const shards = Object.values((await manifest()).rulings);
  const parts = await mapLimit(shards, 12, (s) => fetchJSON(s.url));
  const all = parts.flat();
  // de-duplicate letters listed twice
  const seen = new Set();
  const list = [];
  for (const r of all) {
    const key = r.numberKey ? `${r.numberKey}|${r.date}` : `id:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(r);
  }
  const byId = new Map(list.map((r) => [String(r.id), r]));
  const byKey = new Map();
  for (const r of list) if (r.numberKey && !byKey.has(r.numberKey)) byKey.set(r.numberKey, r);
  rulingsIndex = { list, byId, byKey, revokedBy: buildRevocations(list, byKey) };
  return rulingsIndex;
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
  let t = String(s).replace(/[ 　]/g, "").replace(/^第/, "").replace("條之", "-").replace(/條$/, "");
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
  const exact = pool.filter((l) => l.name === target).sort((a, b) => (a.region !== "中央") - (b.region !== "中央"));
  if (exact.length) return { law: exact[0], others: [] };
  let cand = pool.filter((l) => l.name.includes(target));
  if (!cand.length) {
    const pat = new RegExp([...target].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"));
    cand = pool.filter((l) => pat.test(l.name));
  }
  if (!cand.length) return { law: null, others: [] };
  cand.sort((a, b) => (a.region !== "中央") - (b.region !== "中央") || a.name.length - b.name.length);
  return { law: cand[0], others: cand[0].name.startsWith(target) ? [] : cand.slice(1, 8) };
}

function lawHeader(law) {
  const lines = [`${law.name}（${law.region || ""}｜${law.kind || ""}）[${law.id}]`];
  const first = enactedDate(law);
  if (first) lines.push(`制定／訂定日期：${first}`);
  if (law.modified) lines.push(`最新修正日期：${law.modified}`);
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
  ["免計／免設", /(得不計入|不計入|免計|得免|免予|免辦|免設|免附|免檢討)/],
  ["另有規定", /另有規定者?，?從其規定/],
];
const KUAN = /^\s*([一二三四五六七八九十]+)、/;
const MU = /^\s*[（(]([一二三四五六七八九十]+)[）)]/;

function exceptionsOf(text) {
  const out = [];
  let para = 0, kuan = null, mu = null;
  const lines = text.split(/\n/).filter((l) => l.trim());
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
    if (regions.has(t) && !region) region = t; else terms.push(t);
  }
  const variants = (t) => new Set([t, al[t.toLowerCase()] || al[t] || t, FAMILIES[t]].filter(Boolean));
  const hits = laws
    .filter((l) => !region || l.region === region)
    .filter((l) => terms.includes(l.id) || terms.every((t) => [...variants(t)].some((v) => l.name.includes(v))))
    .sort((a, b) => (a.region !== "中央") - (b.region !== "中央") || a.name.length - b.name.length);
  if (!hits.length) return "沒有找到。可以換個關鍵字，或用 search_articles 搜條文內容。";
  return hits.slice(0, limit).map((l) => `${l.id}｜${l.region}｜${l.kind || ""}｜${l.name}（修正 ${l.modified || "—"}，${l.articleCount ?? "?"} 條）`).join("\n")
    + (hits.length > limit ? `\n…還有 ${hits.length - limit} 部` : "");
}

export async function getArticle({ law, articles, region }) {
  const { law: meta, others } = await resolveLaw(law, region);
  if (!meta) return `找不到法規「${law}」。請先用 find_law 確認名稱。`;
  const L = await loadLaw(meta.id);
  const parts = [lawHeader(L)];
  if (others.length) parts.push(`（「${law}」對到多部法規，先用最可能的一部；其他候選：${others.map((o) => `${o.name} [${o.id}]`).join("、")}）`);
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
    for (const f of att.slice(0, 8)) lines.push(`圖表附件：${f.title}　${f.url}`);
    if (att.length > 8) lines.push(`（另有 ${att.length - 8} 個附件，請看官方來源）`);
    if (!att.length && /附[表圖]/.test(art.text)) lines.push("（條文提到附表／附圖，本庫沒有對應附件連結，請開官方來源查看）");
    const exc = exceptionsOf(clean(art.text, L));
    if (exc.length) {
      lines.push(`【例外與但書】${exc.length} 處（適用前要逐一確認是否符合）`);
      for (const e of exc.slice(0, 12)) lines.push(`  ・${e.where ? e.where + "：" : ""}[${e.kinds.join("、")}] ${e.text.length > 160 ? e.text.slice(0, 160) + "…" : e.text}`);
      if (exc.length > 12) lines.push(`  …另有 ${exc.length - 12} 處`);
    }
    for (const b of brokenRefs(L, art.no)) lines.push(`⚠ 本條引用的「${b.ref}」${b.problem.replace('引用的條文', '')}，請查證現行適用規定`);
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
  for (const L of laws) for (const a of L.articles) {
    const matched = kws.filter((k) => a.text.includes(k)).length;
    if (matched === kws.length || (any && matched)) hits.push({ matched, n: kws.reduce((s, k) => s + a.text.split(k).length - 1, 0), L, a });
  }
  hits.sort((x, y) => y.matched - x.matched || y.n - x.n || (x.L.region !== "中央") - (y.L.region !== "中央"));
  const out = [`搜尋「${kws.join(" ")}」：${hits.length} 條符合（範圍：${laws.length} 部法規）`];
  for (const h of hits.slice(0, limit)) out.push(`\n■ ${h.L.name} ${h.a.no}　[${h.L.id}]\n  ${snippet(clean(h.a.text, h.L), kws)}\n  ${lawLink(h.L.id, h.a.anchor)}`);
  if (hits.length > limit) out.push(`\n…還有 ${hits.length - limit} 條，加大 limit 或增加關鍵字。`);
  if (!hits.length && !any) out.push("沒有全部關鍵字都符合的條文。可以設 any=true，或換同義詞再查。開挖率、建蔽率、容積率等常規定在各都市計畫的土地使用管制要點，本庫未收錄。");
  return out.join("\n");
}

export async function searchRulings({ keywords, law, article, limit = 10 }) {
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/)).filter(Boolean);
  const idx = await rulings();
  let lawId = null;
  if (law) {
    const { law: m } = await resolveLaw(law);
    if (!m) return `找不到法規「${law}」。`;
    lawId = m.id;
  }
  const artNo = article ? normNo(article) : null;
  const out = idx.list.filter((r) => {
    if (lawId) {
      let ok = (r.refs || []).filter((x) => x.law === lawId);
      if (artNo) ok = ok.filter((x) => x.article && normNo(x.article) === artNo);
      if (!ok.length) return false;
    }
    const blob = (r.title || "") + "\n" + (r.body || "");
    return kws.every((k) => blob.includes(k));
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const lines = [`函釋符合：${out.length} 則（依日期新到舊）`];
  for (const r of out.slice(0, limit)) {
    lines.push(`\n■ [${r.id}] ${r.date || ""}　${r.number || ""}\n  ${r.title || ""}`);
    if (r.refs && r.refs.length) lines.push(`  涉及：${await refsText(r)}`);
    for (const w of await rulingWarnings(r)) lines.push("  " + w);
    if (r.body) lines.push("  " + snippet(r.body, kws.length ? kws : [""], 60));
    lines.push(`  ${r.url || ""}`);
  }
  if (!out.length) lines.push("沒有找到。本庫只收國土署（原營建署）函釋彙編，不含經濟部、農業部、消防署及各縣市政府的函釋；查不到不代表沒有函釋。");
  return lines.join("\n");
}

export async function getRuling({ id }) {
  const idx = await rulings();
  const r = idx.byId.get(String(id));
  if (!r) return `找不到函釋 ${id}。`;
  const lines = [`${r.number || ""}（${r.date || ""}，${r.unit || ""}）[ruling ${r.id}]`, r.title || ""];
  if (r.refs && r.refs.length) lines.push(`涉及：${await refsText(r)}`);
  lines.push(...(await rulingWarnings(r)));
  lines.push("──────────────", r.body || "（本庫未收錄全文，只能引用標題與字號，請看原始連結）", "──────────────", `來源：${r.url || ""}`);
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

export async function dataInfo() {
  const m = await manifest(), c = await catalog(), idx = await rulings();
  return [
    `openlawtw 資料版本 ${m.release}，收錄 ${Object.keys(m.laws).length} 部法規、${idx.list.length} 則函釋`,
    `最近同步：${c.collected}`,
    `資料來源：${BASE}`,
    "收錄範圍：中央與 22 縣市建築、都市計畫、土地使用相關法規；國土管理署（原營建署）函釋彙編。",
    "未收錄：各都市計畫書與土地使用分區管制要點；經濟部、農業部、消防署及各縣市政府的函釋。",
  ].join("\n");
}

export const _internal = { exceptionsOf, normNo, cn2int, rulings, loadLaw, brokenRefs, catalog };
