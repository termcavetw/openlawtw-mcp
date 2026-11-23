// 縣市建管單位法規執行疑義會議紀錄（只適用該縣市；第 3 或第 4 級，視決議由誰作成）。資料來自 openlawtw（manifest.minutes），每週同步。
import { loadMinutes } from "./openlaw.js";
const data = () => loadMinutes();
const strip = (s) => String(s || "").replace(/\s+/g, "");
const link = (it) => it.url;
const NOTE = "【只適用桃園市・不是法源】桃園市政府建管單位（建築管理處／都市發展局／原工務局）發給桃園市建築師公會的法規執行疑義會議紀錄與公文，轉載於公會網站。市府自己召開並有「決議」者，可當第 3 級（縣市主管機關的認定）；由公會召開、市府只是轉送的會議（如「加速建照案審查修正意見暨疑義會議」），只能當第 4 級實務參考。部分頁面是掃描影像經 OCR，字可能有誤，引用前請開原檔核對。";

function snippet(text, kws, width = 130) {
  const t = text.replace(/\s+/g, " ").replace(/(?<=[\u4e00-\u9fff，。、；：（）「」]) (?=[\u4e00-\u9fff，。、；：（）「」])/g, "");
  const s = strip(t);
  let pos = -1;
  for (const k of kws) { const p = t.indexOf(k); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
  if (pos < 0) pos = 0;
  const a = Math.max(0, pos - 30);
  return (a > 0 ? "…" : "") + t.slice(a, a + width * 2).trim() + (a + width * 2 < t.length ? "…" : "");
}

function head(it) {
  const bits = [it.title];
  const meta = [it.issuer && `發文機關：${it.issuer}`, it.docDate && `發文日期：${it.docDate}`, it.docNo && `字號：${it.docNo}`].filter(Boolean);
  return bits.concat(meta.length ? [`  ${meta.join("　")}`] : []).join("\n");
}

export async function searchMinutes({ keywords, limit = 8, any = false, year } = {}) {
  const D = await data();
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/)).filter(Boolean);
  if (!kws.length) {
    const yrs = {};
    for (const it of D.items) { const y = String(it.year || "?"); yrs[y] = (yrs[y] || 0) + 1; }
    return [`${D.source}：共 ${D.items.length} 份、${D.items.reduce((n, i) => n + i.pages.length, 0)} 頁（取得日 ${D.fetchedAt}）。`, `各年（民國）份數：${Object.entries(yrs).sort().map(([y, n]) => `${y}年 ${n}`).join("、")}`, NOTE, `給 keywords 就會搜尋內文，例如 keywords=["室內裝修","現況測量圖"]。`].join("\n");
  }
  const ks = kws.map(strip);
  const hits = [];
  for (const it of D.items) {
    if (year && String(it.year) !== String(year)) continue;
    let best = null;
    const pageHas = it.pages.map((p) => { const t = strip(p.text); return ks.map((k) => t.includes(k)); });
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
  const out = [`在桃園市法規執行疑義會議紀錄 ${D.items.length} 份中搜尋「${kws.join(" ")}」：${hits.length} 份符合（新的在前，函釋或決議有前後矛盾時以較新的為準）`, NOTE];
  for (const h of hits.slice(0, limit)) {
    out.push(`\n■ ${head(h.it)}`);
    if (h.cross) out.push(`  ⚠ 關鍵字分散在不同頁：${h.cross.join("、")}，請分別讀這幾頁一起判斷`);
    out.push(`  第 ${h.p.n} 頁${h.p.ocr ? "（OCR）" : ""}：${snippet(h.p.text, kws)}`);
    out.push(`  原檔：${link(h.it)}　讀全頁：get_minutes id="${h.it.id}" page=${h.p.n}`);
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
  const lines = [head(it), `共 ${it.pages.length} 頁　原檔：${link(it)}`, NOTE];
  if (!page) {
    const p1 = it.pages[0];
    lines.push(`\n── 第 1 頁${p1.ocr ? "（OCR）" : ""} ──`, p1.text.trim(), `\n要讀其他頁：get_minutes id="${it.id}" page=2…${it.pages.length}`);
    return lines.join("\n");
  }
  const p = it.pages.find((x) => x.n === Number(page));
  if (!p) return `${it.title} 沒有第 ${page} 頁（共 ${it.pages.length} 頁）。`;
  lines.push(`\n── 第 ${p.n} 頁${p.ocr ? "（OCR，字可能有誤）" : ""} ──`, p.text.trim());
  return lines.join("\n");
}

export async function minutesInfo() {
  const D = await data();
  return `桃園市法規執行疑義會議紀錄：${D.items.length} 份（取得日 ${D.fetchedAt}，來源 ${D.sourceUrl}）`;
}
