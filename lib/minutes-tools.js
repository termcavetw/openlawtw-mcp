// 縣市建管單位法規執行疑義會議紀錄（只適用該縣市；第 3 或第 4 級，看主持人與決議由誰作成）。資料來自 openlawtw（manifest.minutes），每週同步。
import { loadMinutes } from "./openlaw.js";
const data = () => loadMinutes();
import { fold, variants } from "./fold.js";
const strip = (s) => String(s || "").replace(/[\s|]+/g, "");
const sk = (s) => fold(strip(s));
const link = (it) => it.url;
const SITE = (process.env.OPENLAW_BASE || "https://law.termcavetw.com").replace(/\/$/, "");
const siteLink = (it, n) => `${SITE}/#minutes=${encodeURIComponent(it.id)}${n ? `&page=${n}` : ""}`;
const NOTE = "【只適用桃園市・不是法源】桃園市政府建管單位（建築管理處／都市發展局／原工務局）發給桃園市建築師公會的法規執行疑義會議紀錄與公文，轉載於公會網站。級別看每份紀錄由誰主持、決議由誰作成，不看會議名稱：市府人員（處長、副處長、局長、副局長、總工程司、科長、工程司等）主持並作成「決議」者，可當第 3 級（縣市主管機關的認定，包括「加速建照案審查修正意見暨疑義會議」）；公會自行召開、市府只是轉送者，只能當第 4 級實務參考。工具會標出抓到的主持人，抓不到時要開原檔確認。決議常只針對個案，要讀說明與附帶條件，並對照同主題的其他紀錄與函釋，不要只憑單一決議下結論。部分頁面是掃描影像經 OCR，字可能有誤，引用前請開原檔核對。";
const NOTE_SHORT = "【只適用桃園市・不是法源】市府人員主持並作成決議者可當第 3 級，公會自行召開者只能當第 4 級（看每份的「主持」）；決議多針對個案，要對照同主題紀錄與國土署函釋；OCR 頁引用前請開原檔核對。完整說明見 get_minutes。";
const GOV = /處長|總工|工程司|科長|局長|主任秘書|技正|股長|專門委員|秘書|市長/;
function chairOf(it) {
  if (it._chair !== undefined) return it._chair;
  const txt = (it.pages || []).slice(0, 4).map((p) => p.text).join("\n");
  const m = txt.match(/(?:會議)?主\s*[席持]\s*(?:人)?\s*(?:[\/／、]\s*主持人)?\s*[:：]\s*([^\n]{1,30})/);
  let c = m ? m[1].replace(/[\s|]+/g, "").replace(/(代)?記錄[:：].*$/, "").replace(/代$/, "").slice(0, 16) : "";
  // 抓不到主持人時，看公文主旨是不是「檢送本府／本處…召開…會議紀錄」（市府自己召開）
  const byCity = /檢送本[府處局][^。]{0,40}召開/.test(strip((it.pages || []).slice(0, 2).map((p) => p.text).join("")));
  it._chair = c && !/^出席/.test(c) ? { name: c, gov: GOV.test(c) } : byCity ? { name: "", gov: true, inferred: true } : null;
  return it._chair;
}

function snippet(text, kws, width = 130) {
  const t = text.replace(/\s+/g, " ").replace(/(?<=[\u4e00-\u9fff，。、；：（）「」]) (?=[\u4e00-\u9fff，。、；：（）「」])/g, "");
  const s = strip(t);
  let pos = -1;
  for (const k of kws) { const p = t.indexOf(k); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
  if (pos < 0) for (const k of kws) { const m = t.match(new RegExp([...k].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s|]*"))); if (m && (pos < 0 || m.index < pos)) pos = m.index; }
  if (pos < 0) pos = 0;
  const a = Math.max(0, pos - 30);
  return (a > 0 ? "…" : "") + t.slice(a, a + width * 2).trim() + (a + width * 2 < t.length ? "…" : "");
}

// 函頭（如「桃園市政府函」）比 openlawtw 抽出的 issuer 可靠：府字號公文的 issuer 有時抓到副本的局處
function issuerOf(it) {
  const m = String(it.pages?.[0]?.text || "").match(/^[^\n]{0,8}?(桃園[市縣]政府[^\n|函]{0,10})函\s*$/m);
  return m ? m[1].replace(/\s+/g, "") : it.issuer;
}
const TABLE = "掃描頁的表格：同一列的儲存格以「 | 」分隔，跨列的欄名或格子內換行可能被拆成上下兩行，讀表要對照原檔。";

function head(it) {
  const bits = [it.title];
  const iss = issuerOf(it);
  const meta = [iss && `發文機關：${iss}`, it.docDate && `發文日期：${it.docDate}`, it.docNo && `字號：${it.docNo}`].filter(Boolean);
  const ocrCover = meta.length && it.pages?.[0]?.ocr ? "（封面經 OCR 辨識，機關、日期、字號可能有誤字，引用前請開原檔核對）" : "";
  const ch = chairOf(it);
  const lvl = ch?.inferred ? "  主持：抓不到主持人；公文主旨寫明由市府召開，決議原則上可當第 3 級，請開原檔確認" : ch ? `  主持：${ch.name}${ch.gov ? "（市府人員主持，作成的決議可當第 3 級）" : "（不像市府人員，決議可能只能當第 4 級，請開原檔確認）"}` : "  主持：紀錄中抓不到主持人，級別請開原檔確認（市府主持作成決議＝第 3 級；公會召開市府轉送＝第 4 級）";
  return bits.concat(meta.length ? [`  ${meta.join("　")}${ocrCover}`] : [], [lvl]).join("\n");
}

export async function searchMinutes({ keywords, limit = 8, any = false, year } = {}) {
  const D = await data();
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/)).filter(Boolean);
  if (!kws.length) {
    const yrs = {};
    for (const it of D.items) { const y = String(it.year || "?"); yrs[y] = (yrs[y] || 0) + 1; }
    return [`${D.source}：共 ${D.items.length} 份、${D.items.reduce((n, i) => n + i.pages.length, 0)} 頁（取得日 ${D.fetchedAt}）。`, `各年（民國）份數：${Object.entries(yrs).sort().map(([y, n]) => `${y}年 ${n}`).join("、")}`, NOTE, `給 keywords 就會搜尋內文，例如 keywords=["室內裝修","現況測量圖"]。`].join("\n");
  }
  const ks = kws.map(sk);
  const hits = [];
  for (const it of D.items) {
    if (year && String(it.year) !== String(year)) continue;
    let best = null;
    const pageHas = it.pages.map((p) => { const t = sk(p.text); return ks.map((k) => t.includes(k)); });
    it.pages.forEach((p, i) => {
      const f = pageHas[i];
      const ok = any ? f.some(Boolean) : f.every(Boolean);
      if (ok) { const score = f.filter(Boolean).length; if (!best || score > best.score) best = { p, score }; }
    });
    if (best) hits.push({ it, p: best.p, score: best.score });
    else if (!any) {
      const all = ks.every((k, j) => pageHas.some((f) => f[j]));
      if (all) hits.push({ it, p: it.pages[pageHas.findIndex((f) => f.some(Boolean))], score: 0, cross: ks.map((k, j) => `${kws[j]}→第${it.pages[pageHas.findIndex((f) => f[j])].n}頁`) });
    }
  }
  hits.sort((a, b) => b.score - a.score || (b.it.sortDate || "").localeCompare(a.it.sortDate || ""));
  if (!hits.length) return `在 ${D.items.length} 份桃園市法規執行疑義會議紀錄中沒有找到「${kws.join(" ")}」。可改用同義詞，或加 any=true。（這裡只收桃園市公會網站公開的紀錄，沒有不代表桃園沒有相關決議。）`;
  const out = [`在桃園市法規執行疑義會議紀錄 ${D.items.length} 份中搜尋「${kws.join(" ")}」：${hits.length} 份符合（新的在前；桃園市紀錄之間前後矛盾時以較新的為準，但與條文或國土署函釋牴觸時，不論新舊都以條文與函釋為準——引用前先用 search_rulings 查同一條文的函釋）`, NOTE_SHORT];
  for (const h of hits.slice(0, limit)) {
    out.push(`\n■ ${head(h.it)}`);
    if (h.cross) out.push(`  ⚠ 關鍵字分散在不同頁：${h.cross.join("、")}，請分別讀這幾頁一起判斷`);
    out.push(`  第 ${h.p.n} 頁${h.p.ocr ? "（OCR）" : ""}：${snippet(h.p.text, variants(kws))}`);
    out.push(`  原檔：${link(h.it)}　openlawtw：${siteLink(h.it, h.p.n)}　讀全頁：get_minutes id="${h.it.id}" page=${h.p.n}`);
  }
  if (hits.length > limit) out.push(`\n（還有 ${hits.length - limit} 份，調大 limit 或加關鍵字縮小）`);
  return out.join("\n");
}

export async function getMinutes({ id, page } = {}) {
  const D = await data();
  const q = String(id || "").trim();
  let it = D.items.find((x) => String(x.id) === q);
  if (!it && q) { const m = D.items.filter((x) => strip(x.title).includes(strip(q))); if (m.length === 1) it = m[0]; else if (m.length > 1) return `「${q}」符合多份，請用 id：\n${m.slice(0, 15).map((x) => `  ${x.id}　${x.title}`).join("\n")}`; }
  if (!it) return `找不到會議紀錄「${q}」。先用 search_minutes 搜尋，取得 id。`;
  const lines = [head(it), `共 ${it.pages.length} 頁　原檔：${link(it)}　openlawtw：${siteLink(it, Number(page) || 0)}`, NOTE];
  if (!page) {
    const p1 = it.pages[0];
    lines.push(`\n── 第 1 頁${p1.ocr ? "（OCR）" : ""} ──`, p1.text.trim(), `\n要讀其他頁：get_minutes id="${it.id}" page=2…${it.pages.length}`);
    return lines.join("\n");
  }
  const p = it.pages.find((x) => x.n === Number(page));
  if (!p) return `${it.title} 沒有第 ${page} 頁（共 ${it.pages.length} 頁）。`;
  lines.push(`\n── 第 ${p.n} 頁${p.ocr ? "（OCR，字可能有誤）" : ""} ──`, p.text.trim());
  // 只有真的表格（連續兩列都有儲存格分隔）才提示；頁首「桃園 | 桃園市政府建築管理處」不算
  if (p.ocr && p.text.split("\n").some((l, i, a) => l.includes(" | ") && (a[i + 1] || "").includes(" | "))) lines.push(`\n${TABLE}`);
  return lines.join("\n");
}

export async function minutesInfo() {
  const D = await data();
  return `桃園市法規執行疑義會議紀錄：${D.items.length} 份（取得日 ${D.fetchedAt}，來源 ${D.sourceUrl}）`;
}
