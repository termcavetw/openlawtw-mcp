// openlawtw MCP server — Streamable HTTP transport, stateless, JSON responses.
// Deploy on Vercel: this file is served at /api/mcp (vercel.json also maps /mcp here).
import { findLaw, getArticle, listArticles, searchArticles, searchRulings, getRuling, checkConflicts, dataInfo } from "../lib/openlaw.js";

const SERVER = { name: "openlawtw", title: "openlawtw 臺灣建築法規", version: "1.0.0" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `openlawtw：臺灣建築、都市計畫、土地使用法規與國土署函釋資料庫。
回答臺灣建築法規問題時請遵守：
1. 條號、條文內容、函釋字號一律先用工具查過才寫，不憑記憶。
2. 引用時寫法規全名＋條號，引用關鍵原文，附上工具給的連結；函釋寫字號與日期。
3. 查不到就說查不到，不要補條號或捏造函釋。
4. 注意工具印出的 ⚠：條文已修正而函釋較舊、函釋已被停止適用、條文引用已刪除的條文、函告無效、施行日註記。有的話要明白告訴使用者，並優先採用較新的規定與函釋。
5. 問題涉及特定縣市時，也要查該縣市的規定（region 參數）。
6. 開挖率、建蔽率、容積率等常寫在各都市計畫的土管要點，本庫未收；經濟部、農業部、消防署及縣市政府函釋也未收。查不到時要說明是收錄範圍的限制。
7. 這是法規查詢，不是主管機關的認定；個案適用請以主管建築機關審查為準。
建議流程：find_law 確認法規 → get_article 讀條文 → search_rulings 查函釋 → get_ruling 讀全文；不知道在哪一條就 search_articles。`;

const str = (description) => ({ type: "string", description });
const RO = { readOnlyHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: "find_law", title: "找法規",
    description: "用名稱、簡稱或關鍵字找法規，回傳法規 ID、地區、類別與最新修正日。多個詞以空白分隔、全部要符合；寫縣市名（如 桃園市）就只找該縣市。簡稱如 建技、設計施工編、變使、室裝、危老、危老獎勵、都更條例、非都管制、無障礙規範。",
    inputSchema: { type: "object", properties: { query: str("法規名稱、簡稱或關鍵字，例如「桃園市 建築管理」"), region: str("限定地區：中央、臺北市、桃園市…（可省略）"), limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } }, required: ["query"] },
    annotations: { ...RO, title: "找法規" }, run: findLaw,
  },
  {
    name: "get_article", title: "讀條文",
    description: "讀取一部法規的指定條文全文，含章節位置、本條最近修正日、法規制定日與施行日註記、附表附圖官方連結、引用已刪除條文的警告，以及 openlawtw 連結。法規可用全名、ID 或簡稱；條號可寫 107、164-1、164之1、第一百零七條。",
    inputSchema: { type: "object", properties: { law: str("法規名稱、簡稱或 ID，例如「設計施工編」「D0070115」"), articles: { type: "array", items: { type: "string" }, description: "條號清單，例如 [\"107\", \"108\"]" }, region: str("同名法規時限定地區（可省略）") }, required: ["law", "articles"] },
    annotations: { ...RO, title: "讀條文" }, run: getArticle,
  },
  {
    name: "list_articles", title: "章節目錄",
    description: "列出一部法規的章節與每一條的第一行，用來找出相關條文的位置。",
    inputSchema: { type: "object", properties: { law: str("法規名稱、簡稱或 ID"), region: str("限定地區（可省略）") }, required: ["law"] },
    annotations: { ...RO, title: "章節目錄" }, run: listArticles,
  },
  {
    name: "search_articles", title: "搜尋條文",
    description: "在條文全文中搜尋關鍵字（預設全部關鍵字都要出現），預設只搜中央法規。不知道規定在哪一部、哪一條時使用；搜到後再用 get_article 讀全文。沒結果時可改 any=true 或換同義詞（例：昇降機/電梯、容積/樓地板面積）。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字，例如 [\"緊急用昇降機\", \"避難層\"]" }, region: str("中央（預設）、桃園市…，逗號分隔；「全部」= 所有縣市"), law: str("限定法規，逗號分隔（名稱、簡稱或 ID）"), limit: { type: "integer", minimum: 1, maximum: 50, default: 15 }, any: { type: "boolean", default: false, description: "任一關鍵字符合即可" } }, required: ["keywords"] },
    annotations: { ...RO, title: "搜尋條文" }, run: searchArticles,
  },
  {
    name: "search_rulings", title: "搜尋函釋",
    description: "搜尋內政部國土管理署（原營建署）函釋，可依法規與條號篩選，或用關鍵字搜標題與全文，依日期新到舊。每則會標出 ⚠：已被後來的函釋停止適用、或早於所涉條文的修正日。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字（可省略）" }, law: str("限定法規（名稱、簡稱或 ID）"), article: str("限定條號，需搭配 law"), limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } } },
    annotations: { ...RO, title: "搜尋函釋" }, run: searchRulings,
  },
  {
    name: "get_ruling", title: "讀函釋",
    description: "讀取一則函釋全文（用 search_rulings 結果裡的 id），含字號、日期、涉及條文與停止適用／條文已修正警告。",
    inputSchema: { type: "object", properties: { id: str("函釋 id，例如 13672") }, required: ["id"] },
    annotations: { ...RO, title: "讀函釋" }, run: getRuling,
  },
  {
    name: "check_conflicts", title: "法規衝突檢查",
    description: "檢查一部法規（或其中一條）的衝突與失效風險：條文引用了已刪除或不存在的條文、函告無效註記、相關函釋已被停止適用、函釋早於條文修正。結果為自動比對，引用前請開原文確認。",
    inputSchema: { type: "object", properties: { law: str("法規名稱、簡稱或 ID"), article: str("只檢查這一條（可省略）"), region: str("限定地區（可省略）") }, required: ["law"] },
    annotations: { ...RO, title: "法規衝突檢查" }, run: checkConflicts,
  },
  {
    name: "data_info", title: "資料版本",
    description: "openlawtw 資料版本、最近同步時間與收錄範圍。回答時可引用同步日期。",
    inputSchema: { type: "object", properties: {} },
    annotations: { ...RO, title: "資料版本" }, run: dataInfo,
  },
];

// ---------------------------------------------------------------- rate limit (best effort, per instance)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 60_000, max = Number(process.env.RATE_LIMIT_PER_MIN || 120);
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

// ---------------------------------------------------------------- JSON-RPC
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return "id" in (msg || {}) ? fail(msg.id, -32600, "Invalid Request") : null;
  }
  const isNotification = !("id" in msg);
  if (isNotification) return null;
  const { id, method, params = {} } = msg;
  switch (method) {
    case "initialize": {
      const v = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
      return ok(id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS.map(({ run, ...t }) => t) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const text = await tool.run(params.arguments || {});
        return ok(id, { content: [{ type: "text", text }], isError: false });
      } catch (e) {
        return ok(id, { content: [{ type: "text", text: `查詢失敗：${e.message}。請告訴使用者目前無法查詢，不要改憑記憶回答。` }], isError: true });
      }
    }
    case "resources/list": return ok(id, { resources: [] });
    case "prompts/list": return ok(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body !== "string" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!raw) { for await (const chunk of req) raw += chunk; }
  return JSON.parse(raw);
}

function send(res, status, body, extra = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE", "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization", "Access-Control-Expose-Headers": "Mcp-Session-Id", ...extra })) res.setHeader(k, v);
  if (body === undefined) return res.end();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204);
  if (req.method === "GET" || req.method === "DELETE") return send(res, 405, fail(null, -32000, "This server is stateless: use POST."), { Allow: "POST" });
  if (req.method !== "POST") return send(res, 405, fail(null, -32000, "Method not allowed"));
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  if (limited(ip)) return send(res, 429, fail(null, -32000, "Too many requests, slow down."), { "Retry-After": "30" });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, fail(null, -32700, "Parse error")); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handleMessage))).filter(Boolean);
    return out.length ? send(res, 200, out) : send(res, 202);
  }
  const out = await handleMessage(body);
  return out ? send(res, 200, out) : send(res, 202);
}

