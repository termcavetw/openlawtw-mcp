// 新北市政府工務局「建照業務工作手冊」案例（只適用新北市；第 3 級：縣市主管建築機關的執行原則）。資料來自 openlawtw（manifest.ntpcManual）。
import { loadNtpc } from "./openlaw.js";
import { fold, variants, has } from "./fold.js";

const sk = (s) => fold(String(s || "").replace(/\s+/g, ""));
const NOTE = "【只適用新北市・第 3 級】新北市政府工務局建照業務工作手冊的案例與處理原則（彙整建築法規研討會、建照科簽辦的共通性案例）。只能用在新北市的案子；與條文或國土署函釋不一致時以條文與中央函釋為準。各案例依據的會議或函文年代不同，之後的法規修正可能改變結論：引用前要讀「附註」、對照現行條文與函釋，並寫明手冊版次、案例編號與依據的會議或函文。";
const pdf = (D, c) => `${D.sourceUrl}#page=${c.pdfPage}`;
const blob = (c) => sk([c.no, c.chapter, c.basis, c.question, c.rule, c.note].join("\n"));

function snippet(text, kws, n = 70) {
  const t = String(text || "").replace(/\s+/g, " ");
  let pos = -1;
  for (const v of variants(kws)) { const p = t.indexOf(v); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
  if (pos < 0) return t.slice(0, n * 2) + (t.length > n * 2 ? "…" : "");
  const a = Math.max(0, pos - n), b = Math.min(t.length, pos + n);
  return (a ? "…" : "") + t.slice(a, b) + (b < t.length ? "…" : "");
}

function full(D, c) {
  return [
    `■ 案例 ${c.no}（${c.chapter}）${c.prev && c.prev !== c.no ? `　舊編號 ${c.prev}` : ""}`,
    `  依據：${(c.basis || "（未載）").replace(/\n+/g, "；")}`,
    `  問題：${c.question || ""}`,
    `  處理原則：${c.rule || ""}`,
    c.note ? `  附註：${c.note.replace(/\n/g, "\n        ")}` : "",
    `  手冊第 ${c.page} 頁（PDF 第 ${c.pdfPage} 頁）：${pdf(D, c)}`,
  ].filter(Boolean).join("\n");
}

export async function searchNtpc({ keywords, no, chapter, any = false, limit = 8 } = {}) {
  const D = await loadNtpc();
  const head = `新北市政府工務局建照業務工作手冊（${D.edition}，${D.cases.length} 個案例）`;
  if (no) {
    const want = String(no).replace(/[^\d\-]/g, "");
    const c = D.cases.find((x) => x.no === want) || D.cases.find((x) => x.prev === want); // 現行編號優先，找不到才比對舊編號
    if (!c) return `${head}：找不到案例 ${no}。`;
    return [head, NOTE, "", full(D, c)].join("\n");
  }
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/)).filter(Boolean);
  if (!kws.length && !chapter) {
    return [head, NOTE, "", "章節：", ...D.stats.chapters.map((c) => `- ${c.name}（${c.cases} 案）`), "", '用 keywords 搜尋，或 no="05-03" 讀單一案例。'].join("\n");
  }
  const ks = kws.map(sk);
  const hits = D.cases.filter((c) => {
    if (chapter && !sk(c.chapter).includes(sk(chapter))) return false;
    if (!ks.length) return true;
    const b = blob(c);
    return any ? ks.some((k) => has(b, k)) : ks.every((k) => has(b, k));
  });
  const out = [`${head}中搜尋「${kws.join(" ") || chapter}」：${hits.length} 案符合`, NOTE];
  for (const c of hits.slice(0, limit)) {
    out.push("", `■ 案例 ${c.no}（${c.chapter}）　依據：${(c.basis || "（未載）").replace(/\n+/g, "；")}`, `  問題：${snippet(c.question, kws, 80)}`, `  處理原則：${snippet(c.rule, kws, 80)}`, `  讀全文（含附註）：search_ntpc_manual no="${c.no}"　原手冊 PDF 第 ${c.pdfPage} 頁`);
  }
  if (hits.length > limit) out.push(`\n…還有 ${hits.length - limit} 案，加大 limit 或增加關鍵字。`);
  if (!hits.length) out.push("沒有找到。可以設 any=true、換同義詞，或用 chapter 列出某一類（如「變更使用類」）。");
  return out.join("\n");
}
