// 桃園市都市計畫土地使用分區管制要點（土管要點）。資料來自 openlawtw（manifest.landuse），每週同步。
import { loadLanduse } from "./openlaw.js";
const data = () => loadLanduse();
import { fold, variants } from "./fold.js";
const strip = (s) => String(s || "").replace(/[\s|]+/g, "");
const sk = (s) => fold(strip(s));
const SITE = (process.env.OPENLAW_BASE || "https://openlawtw.vercel.app").replace(/\/$/, "");
const siteLink = (it, n) => `${SITE}/#landuse=${encodeURIComponent(it.id)}${n ? `&page=${n}` : ""}`;
const NOTE_SHORT = "【只有桃園市】土管要點對計畫區內基地有拘束力，但本庫不判斷哪份是現行版本：要寫明計畫區、公告日期與文號，確認基地屬於哪個主要／細部計畫、之後有沒有較新公告；OCR 頁的建蔽率、容積率、退縮數字引用前一定要開原檔核對。完整說明見 get_landuse。";
const NOTE = "【只有桃園市】土管要點是各都市計畫書的一部分，對該計畫區內的基地有拘束力（可當第 1 級依據），但：(1) 每份是某一次公告的要點，市府網站沒有標示哪一份是現行版本，本庫也不判斷——要確認基地屬於哪個主要／細部計畫，以及之後有沒有較新的公告或個案變更；(2) 細部計畫的要點常寫「未規定事項依主要計畫／原計畫規定」，要一併讀；(3) 部分頁面是掃描影像經 OCR（表格同一列的儲存格以「 | 」分隔，跨列的欄名可能被拆成上下兩行），字、表格與數字仍可能有誤，引用建蔽率、容積率、退縮距離等數字前一定要開原檔核對；(4) 只寫在計畫書內文、沒有獨立土管要點檔的規定沒有收錄。";
// 常用叫法 → 計畫區名稱關鍵字
const ALIAS = { 青埔: "高速鐵路桃園車站特定區", 高鐵: "高速鐵路桃園車站特定區", 高鐵特定區: "高速鐵路桃園車站特定區", 航空城: "桃園國際機場園區", 機場園區: "桃園國際機場園區", 內壢交流道: "中壢及內壢交流道", 中壢交流道: "中壢及內壢交流道", 林口: "林口特定區", 南崁: "南崁地區", 大湳: "八德(大湳地區)", 龍岡: "中壢(龍岡地區)", 草漯: "觀音(草漯地區)", 菓林: "大園(菓林地區)", 埔頂: "大溪鎮(埔頂地區)" };
const norm = (s) => strip(s).replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/台/g, "臺");
function areaMatch(D, q) {
  if (!q) return null;
  const want = norm(ALIAS[strip(q)] || q);
  const names = [...new Set(D.items.map((i) => i.area))];
  return names.filter((n) => norm(n).includes(want) || norm(n).replace(/都市計畫|特定區計畫|計畫$/g, "").includes(want));
}
function snippet(text, kws, width = 130) {
  const t = text.replace(/\s+/g, " ").replace(/(?<=[一-鿿，。、；：（）「」]) (?=[一-鿿，。、；：（）「」])/g, "");
  let pos = -1;
  for (const k of kws) { const p = t.indexOf(k); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
  if (pos < 0) for (const k of kws) { const m = t.match(new RegExp([...k].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s|]*"))); if (m && (pos < 0 || m.index < pos)) pos = m.index; }
  if (pos < 0) pos = 0;
  const a = Math.max(0, pos - 30);
  return (a > 0 ? "…" : "") + t.slice(a, a + width * 2).trim() + (a + width * 2 < t.length ? "…" : "");
}
const later = (D, it) => D.items.filter((x) => x.area === it.area && (x.date || "") > (it.date || ""));
const narrow = (it) => /個案變更/.test(it.type || "") || /配合|修訂.{0,12}用地|（.{0,20}(用地|專用區|街廓)[^）]*）/.test(it.title || "");
function head(it) {
  const lines = [`${it.title}`, `  計畫區：${it.area}　${[it.kind, it.type].filter(Boolean).join("／")}　公告：${it.date || "日期不明"}${it.docNo ? "　" + it.docNo : ""}　[id ${it.id}]`];
  if (narrow(it)) lines.push(`  ⚠ ${/個案變更/.test(it.type || "") ? "市府分類為「個案變更」" : "標題看起來只針對部分用地或個案"}：可能只適用該案範圍或只修訂部分條文，請確認基地是否在本案範圍內，並對照同計畫區的通盤檢討或整體土管要點`);
  return lines.join("\n");
}
function laterLine(D, it) {
  const L = later(D, it);
  return L.length ? `  ⚠ 同計畫區在這之後還有 ${L.length} 份公告（最新 ${L.map((x) => x.date).sort().pop()}），請確認本份是否已被修正或只適用部分地區：search_landuse area="${it.area}"` : "  同計畫區沒有比這份更新的土管要點公告（仍要確認基地屬於這份的範圍）";
}


// 逐點比對：較舊公告某一點（第N點）在同計畫區較新的公告又出現時，提醒以較新的為準
const POINT_RE = /(?:^|\n)[ \t　]*(第[一二三四五六七八九十百零〇]+點)/g;
function pointsOn(p) { const s = new Set(); for (const m of String(p?.text || "").matchAll(POINT_RE)) s.add(m[1]); return s; }
function pointPages(it, pt) { return it.pages.filter((p) => pointsOn(p).has(pt)).map((p) => p.n); }
function pointLines(D, it, pages) {
  const pts = new Set(); for (const p of pages) for (const x of pointsOn(p)) pts.add(x);
  if (!pts.size) return [];
  const same = D.items.filter((x) => x.area === it.area && x.id !== it.id);
  const ref = (x, pg) => `${x.date} ${x.docNo || ""}［get_landuse id="${x.id}" page=${pg}］`;
  const newer = [], older = [];
  for (const x of same) {
    const hit = [...pts].map((pt) => [pt, pointPages(x, pt)]).filter(([, pg]) => pg.length);
    if (!hit.length) continue;
    ((x.date || "") > (it.date || "") ? newer : older).push({ x, hit });
  }
  const out = [];
  newer.sort((a, b) => b.x.date.localeCompare(a.x.date));
  for (const r of newer.slice(0, 5)) out.push(`  ⚠ ${r.hit.map(([pt]) => pt).join("、")}在較新的公告也有條文，可能已修正，這些點要以較新的為準並比對差異（也要確認較新公告的適用範圍）：${ref(r.x, r.hit[0][1][0])}`);
  if (newer.length > 5) out.push(`  （還有 ${newer.length - 5} 份較新的公告也有相同點次）`);
  if (!newer.length && older.length) {
    older.sort((a, b) => b.x.date.localeCompare(a.x.date));
    const r = older[0];
    out.push(`  ${r.hit.map(([pt]) => pt).join("、")}較早的版本：${ref(r.x, r.hit[0][1][0])}（本份較新，可比對修正了什麼）`);
  }
  return out;
}

export async function searchLanduse({ keywords, area, kind, limit = 8, any = false } = {}) {
  const D = await data();
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/)).filter(Boolean);
  const areas = areaMatch(D, area);
  if (area && !areas.length) return `找不到計畫區「${area}」。桃園市收錄的計畫區：${[...new Set(D.items.map((i) => i.area))].join("、")}`;
  let pool = D.items.filter((i) => (!areas || areas.includes(i.area)) && (!kind || strip(i.kind).includes(strip(kind))));
  pool = pool.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!kws.length) {
    if (!areas) {
      const cnt = {};
      for (const i of D.items) cnt[i.area] = (cnt[i.area] || 0) + 1;
      return [`${D.source}：桃園市 ${Object.keys(cnt).length} 個計畫區、${D.items.length} 份土管要點、${D.items.reduce((n, i) => n + i.pages.length, 0)} 頁（取得日 ${D.fetchedAt}）。`, NOTE, `各計畫區份數：${Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join("、")}`, `用 area 列出某計畫區的所有公告（新的在前），或給 keywords 搜尋內文，例如 keywords=["退縮建築"] area="青埔"。`].join("\n");
    }
    const out = [`${areas.join("、")}：${pool.length} 份土管要點公告（新的在前）`, NOTE_SHORT];
    for (const it of pool.slice(0, Math.max(limit, 30))) out.push(`- ${it.date || "日期不明"}　${it.kind || ""}　${it.title}　[id ${it.id}，${it.pages.length} 頁]`);
    if (pool.length > Math.max(limit, 30)) out.push(`（還有 ${pool.length - Math.max(limit, 30)} 份，加 kind 或 keywords 縮小）`);
    out.push(`讀全文：get_landuse id="…"`);
    return out.join("\n");
  }
  const ks = kws.map(sk);
  const hits = [];
  for (const it of pool) {
    let best = null;
    const pageHas = it.pages.map((p) => { const t = sk(p.text); return ks.map((k) => t.includes(k)); });
    it.pages.forEach((p, i) => {
      const f = pageHas[i];
      if (any ? f.some(Boolean) : f.every(Boolean)) { const score = f.filter(Boolean).length; if (!best || score > best.score) best = { p, score }; }
    });
    if (best) hits.push({ it, p: best.p, score: best.score });
    else if (!any && ks.every((k, j) => pageHas.some((f) => f[j]))) hits.push({ it, p: it.pages[pageHas.findIndex((f) => f.some(Boolean))], score: 0, cross: ks.map((k, j) => `${kws[j]}→第${it.pages[pageHas.findIndex((f) => f[j])].n}頁`) });
  }
  hits.sort((a, b) => (b.it.date || "").localeCompare(a.it.date || "") || b.score - a.score);
  const scope = areas ? areas.join("、") : `桃園市 ${D.items.length} 份`;
  if (!hits.length) return `在${scope}的土管要點中沒有找到「${kws.join(" ")}」。可改用同義詞（如「容積率」「樓地板面積」、「退縮」「退縮建築」），或加 any=true。（只收有獨立土管要點檔的公告；寫在計畫書內文的規定未收。）`;
  const out = [`在${scope}的土管要點中搜尋「${kws.join(" ")}」：${hits.length} 份符合（公告日期新的在前）`, NOTE_SHORT];
  for (const h of hits.slice(0, limit)) {
    out.push(`\n■ ${head(h.it)}`);
    if (h.cross) out.push(`  ⚠ 關鍵字分散在不同頁：${h.cross.join("、")}`);
    out.push(`  第 ${h.p.n} 頁${h.p.ocr ? "（OCR，數字可能有誤）" : ""}：${snippet(h.p.text, variants(kws))}`);
    out.push(laterLine(D, h.it));
    out.push(...pointLines(D, h.it, [h.p]));
    out.push(`  原檔：${h.it.url}　openlawtw：${siteLink(h.it, h.p.n)}　讀全頁：get_landuse id="${h.it.id}" page=${h.p.n}`);
  }
  if (hits.length > limit) out.push(`\n（還有 ${hits.length - limit} 份，調大 limit、加 area 或關鍵字縮小）`);
  return out.join("\n");
}

export async function getLanduse({ id, page } = {}) {
  const D = await data();
  const q = String(id || "").trim();
  let it = D.items.find((x) => String(x.id) === q);
  if (!it && q) { const m = D.items.filter((x) => strip(x.title).includes(strip(q))); if (m.length === 1) it = m[0]; else if (m.length > 1) return `「${q}」符合多份，請用 id：\n${m.slice(0, 15).map((x) => `  ${x.id}　${x.date}　${x.title}`).join("\n")}`; }
  if (!it) return `找不到土管要點「${q}」。先用 search_landuse 搜尋，取得 id。`;
  const files = (it.files || []).map((f) => `${f.name} ${f.url}`).join("　");
  const shown = page ? it.pages.filter((x) => x.n === Number(page)) : it.pages;
  const lines = [head(it), laterLine(D, it), ...pointLines(D, it, shown), `共 ${it.pages.length} 頁　原檔：${it.url}${files ? "　同案：" + files : ""}　openlawtw：${siteLink(it, Number(page) || 0)}`, NOTE];
  if (!page) {
    let len = 0;
    for (const p of it.pages) {
      const blk = `\n── 第 ${p.n} 頁${p.ocr ? "（OCR，表格與數字可能有誤）" : ""} ──\n${p.text.trim()}`;
      if (len + blk.length > 20000) { lines.push(`\n（內容太長，到第 ${p.n - 1} 頁為止；其餘用 get_landuse id="${it.id}" page=${p.n}…${it.pages.length}）`); break; }
      lines.push(blk); len += blk.length;
    }
    return lines.join("\n");
  }
  const p = it.pages.find((x) => x.n === Number(page));
  if (!p) return `${it.title} 沒有第 ${page} 頁（共 ${it.pages.length} 頁）。`;
  lines.push(`\n── 第 ${p.n} 頁${p.ocr ? "（OCR，表格與數字可能有誤）" : ""} ──`, p.text.trim());
  return lines.join("\n");
}
