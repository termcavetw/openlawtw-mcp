// MCP 結構化輸出（structuredContent）：文字輸出照舊，另外附上機器可讀的欄位，讓 AI 抄字號、日期、修正日時不必從文字裡找。
import { articleInfo, resolveLawId, rulingMeta } from "./openlaw.js";

const S = (props, req = []) => ({ type: "object", properties: props, required: req });
const str = { type: ["string", "null"] }, int = { type: ["integer", "null"] };
const RULING = S({ id: { type: "string" }, source: str, level: int, date: str, doc_no: str, revoked: str, revoked_by: str, url: str }, ["id"]);
const warnLines = (text) => String(text).split("\n").map((l) => l.trim()).filter((l) => /^[⚠⛔]/.test(l));

export const SCHEMAS = {
  get_article: S({ law_id: str, law_name: str, articles: { type: "array", items: S({ article: { type: "string" }, exists: { type: "boolean" }, amended: str, url: str }, ["article"]) }, warnings: { type: "array", items: { type: "string" } } }),
  search_articles: S({ results: { type: "array", items: S({ law_id: { type: "string" }, law_name: { type: "string" }, article: { type: "string" }, amended: str }, ["law_id", "article"]) } }),
  get_ruling: S({ ruling: { anyOf: [RULING, { type: "null" }] }, warnings: { type: "array", items: { type: "string" } } }),
  search_rulings: S({ results: { type: "array", items: RULING } }),
  verify_citations: S({ issues: { type: "array", items: { type: "string" } }, verified: { type: "array", items: { type: "string" } }, unverifiable: { type: "array", items: { type: "string" } } }),
};

export async function structure(tool, args, text) {
  try {
    if (tool === "get_article") {
      const L = await resolveLawId(args.law);
      const nos = (Array.isArray(args.articles) ? args.articles : [args.articles]).filter(Boolean).map(String);
      const articles = L ? await Promise.all(nos.map(async (no) => { const i = await articleInfo(L.id, no.replace(/[第條\s]/g, "").replace("之", "-")).catch(() => null); return { article: no, exists: !!(i && i.exists), amended: i?.amended || null, url: i?.url || null }; })) : [];
      return { law_id: L?.id || null, law_name: L?.name || null, articles, warnings: warnLines(text) };
    }
    if (tool === "search_articles") {
      const results = [];
      for (const m of String(text).matchAll(/^■ (.+?) (第 [^（　]+ 條)(?:（本條最近修正 (\d{4}-\d{2}-\d{2})）)?　\[([^\]]+)\]/gm)) results.push({ law_id: m[4], law_name: m[1], article: m[2], amended: m[3] || null });
      return { results };
    }
    if (tool === "get_ruling") return { ruling: await rulingMeta(args.id), warnings: warnLines(text) };
    if (tool === "search_rulings") {
      const ids = [...new Set([...String(text).matchAll(/^■ \[((?:agri|land|nfa|central|taipei):[^\]\s]+|\d+)\]/gm)].map((m) => m[1]))].slice(0, 30);
      return { results: (await Promise.all(ids.map(rulingMeta))).filter(Boolean) };
    }
    if (tool === "verify_citations") {
      const L = String(text).split("\n");
      return { issues: L.filter((l) => /^[✗⛔]/.test(l)), verified: L.filter((l) => /^✓/.test(l)), unverifiable: L.filter((l) => /^？/.test(l)) };
    }
  } catch {}
  return null;
}
