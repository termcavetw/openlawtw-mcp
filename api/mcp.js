// openlawtw MCP server — Streamable HTTP transport, stateless, JSON responses.
// Deploy on Vercel: this file is served at /api/mcp (vercel.json also maps /mcp here).
import { searchDocuments, getDocument, findLaw, getArticle, listArticles, searchArticles, searchRulings, getRuling, checkConflicts, dataInfo } from "../lib/openlaw.js";
import { searchMinutes, getMinutes, minutesInfo } from "../lib/minutes-tools.js";

const SERVER = { name: "openlawtw", title: "openlawtw 臺灣建築法規", version: "1.6.0" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `openlawtw：臺灣建築、都市計畫、土地使用法規與國土署函釋資料庫。
回答臺灣建築法規問題時請遵守：
1. 條號、條文內容、函釋字號一律先用工具查過才寫，不憑記憶。
2. 引用時寫法規全名＋條號，引用關鍵原文，附上工具給的連結；函釋寫字號與日期。
3. 查不到就說查不到，不要補條號或捏造函釋。
4. 注意工具印出的 ⚠：條文已修正而函釋較舊、函釋已被停止適用、條文引用已刪除的條文、函告無效、施行日註記。有的話要明白告訴使用者，並優先採用較新的規定與函釋。
5. 問題涉及特定縣市時，也要查該縣市的規定（region 參數）。
6. 開挖率、建蔽率、容積率等常寫在各都市計畫的土管要點，本庫未收；經濟部、農業部、消防署及縣市政府函釋也未收。查不到時要說明是收錄範圍的限制。
7. 網路資料的用法：條文與函釋以本工具查到的為準。網路文章、新聞、論壇只能當線索；與條文或函釋不一致時，以條文為準，並明白告訴使用者網路說法哪裡錯、錯在哪（例如漏了但書、混用了地方規定）。
8. 本庫未收錄的內容（土管要點、其他機關或縣市政府函釋、法院判決、最新修法動態）可以上網查，但優先找政府官方網站（.gov.tw）；引用時註明來源網站與日期，並說明這部分不是來自 openlawtw。
9. 來源順位：效力由高到低為 (1) 法律、法規命令與技術規範的條文；(2) 內政部國土管理署（原營建署）函釋，含正式發文的研商會議紀錄；(3) 縣市主管建築機關的函釋、建照工作手冊、審查或複核決議（只適用該縣市）；(4) 建築師公會、學會的講座簡報與實務整理；(5) 一般網路文章、新聞、論壇。回答時每個依據都標明屬於哪一級；較低級的說法和較高級的不一致時，以較高級為準並說明差在哪。第 3 級只能用在該縣市的案子；第 4、5 級只能當實務參考或線索，不能當法源，也不能寫成「依規定」。網路上找到的函釋、會議紀錄、簡報，要找到原文件（發文機關、字號、日期）才能引用；找不到原文就說明「未見原文，僅供參考」。
10. 官方核對：遇到下列情況，要開工具附的「官方來源」連結（全國法規資料庫、縣市法規網、國土署函釋頁面）核對關鍵條文的內容與最新修正日是否一致——(a) 答案會用在擬函、送審、回覆業主等正式用途；(b) 使用者問到最近有沒有修正；(c) data_info 顯示最近同步已超過 7 天。只拿官方網站核對，不拿一般網路文章核對。對不上時以官方網站為準，告訴使用者 openlawtw 可能尚未同步，並建議回報給 openlawtw。無法連到官方網站時，說明未能核對。
11. 桃園市的實務問題（條文與中央函釋沒有明確答案、要看市府怎麼認定時），再查 search_minutes：桃園市政府建管單位法規執行疑義會議紀錄與公文（轉載於桃園市建築師公會網站），只適用桃園市的案子，不是法源。市府自己召開並有決議者可當第 3 級；公會召開、市府只是轉送者只能當第 4 級實務參考。要寫明會議日期、發文機關與字號；有 OCR 誤字風險，引用前請開原檔；紀錄之間前後矛盾時以較新的為準。
12. 這是法規查詢，不是主管機關的認定；個案適用請以主管建築機關審查為準。
建議流程：find_law 確認法規 → get_article 讀條文 → search_rulings 查函釋 → get_ruling 讀全文；不知道在哪一條就 search_articles。無障礙設施設計規範、耐震設計規範、綠建築技術規範等沒有逐條條文的原文文件，用 search_documents → get_document（無障礙規範可直接填節號，如 805）。`;

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
    name: "search_documents", title: "搜尋原文文件",
    description: "搜尋沒有逐條條文的原文文件（官方 PDF／HTML）：建築物無障礙設施設計規範（依節號，如 805 機車停車位）、建築物耐震設計規範及解說、綠化／保水／節能／雨水貯留等綠建築技術規範、綠建材設計技術規範、電信設備技術規範，以及縣市的造價標準表、裁罰基準、審議原則等。無障礙尺寸（坡道、扶手、廁所、停車位、昇降機）一定要用這個查。也可查建築物使用類組及變更使用辦法的附表一（類組定義）、附表二（使用項目舉例，例如餐廳面積 300 ㎡ 分 B-3 或 G-3）、附表四（各類組檢討標準；document=\"變使\" section=\"附表四 B-3\"），另外也抽出文字的官方 PDF 附表：構造編第 17 條（樓地板活載重）、設計施工編 308-2／116-2／167-6／170／188／230／261／262／264 條完整條文、非都市土地使用管制規則附表一（容許使用細目，依頁讀）、農舍辦法附表、毗連擴展計畫附表、公設多目標使用辦法附表、公共安全檢查簽證申報辦法附表、無障礙住宅附表、農業設施容許使用附表一至五、自來水用水設備標準附表（表格已依 PDF 表格線重排成「欄｜欄」，構造編第 17 條活載重表為 section=\"表\"；搜尋時關鍵字分散在同附表不同頁也會提示；只填 document 會列出該法規可讀的附表；矩陣符號表如變使附表三、公安改善辦法附表一二未收，會給原檔連結）。這些是 PDF 抽出文字，引用前要請使用者開原檔核對。不給 keywords 會列出全部原文文件清單。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字，例如 [\"機車\", \"無障礙\"]" }, document: str("限定文件（名稱、簡稱或 ID，如「無障礙規範」）"), region: str("限定地區，逗號分隔（可省略）"), limit: { type: "integer", minimum: 1, maximum: 50, default: 10 }, any: { type: "boolean", default: false } }, required: [] },
    annotations: { ...RO, title: "搜尋原文文件" }, run: searchDocuments,
  },
  {
    name: "get_document", title: "讀原文文件",
    description: "讀原文文件的一節或一頁。無障礙設施設計規範可用節號（section：805、805.1、206.2.1）；其他文件用 PDF 頁碼（page）。法規的附表（已抽出文字者）也用本工具讀：document 填法規名稱，section 填附表代號，例如 section=\"附表二 B-3\"（變使附表二的類組）、\"附表一\"、\"第17條 表\"（構造編活載重表），或加 page 指定附表頁碼；只填 document 會列出該法規的附表目錄。兩者都不填會列出目錄。會附官方原檔與 openlawtw 頁面連結。",
    inputSchema: { type: "object", properties: { document: str("文件名稱、簡稱或 ID，例如「無障礙規範」「內政部-GL000734」"), section: str("節號，例如 805 或 805.1（限有章節的文件）"), page: { type: "integer", minimum: 1, description: "PDF 頁碼" }, region: str("限定地區（可省略）") }, required: ["document"] },
    annotations: { ...RO, title: "讀原文文件" }, run: getDocument,
  },
  {
    name: "search_minutes", title: "搜尋桃園市法規疑義會議紀錄",
    description: "搜尋桃園市政府建管單位（建築管理處、都市發展局、原工務局）「法規執行疑義研討會」「加速建照案審查修正意見暨疑義會議」等會議紀錄與公文，約 160 份（民國 102 年起，轉載於桃園市建築師公會網站）。條文與國土署函釋沒有明確答案、要看桃園市實務怎麼認定時用（例如室內裝修、變更設計、預審、無障礙審查的執行細節）。屬第 3 級來源：只適用桃園市，不是法源。部分是掃描頁經 OCR，引用前請開原檔核對。不給 keywords 會列出收錄範圍。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字，例如 [\"室內裝修\", \"現況測量圖\"]" }, year: { type: "integer", description: "只看某民國年（可省略）" }, limit: { type: "integer", minimum: 1, maximum: 30, default: 8 }, any: { type: "boolean", default: false } }, required: [] },
    annotations: { ...RO, title: "搜尋桃園市法規疑義會議紀錄" }, run: searchMinutes,
  },
  {
    name: "get_minutes", title: "讀桃園市會議紀錄",
    description: "讀一份桃園市法規疑義會議紀錄（id 來自 search_minutes）。不填 page 讀第 1 頁（公文封面，含發文機關、日期、字號）；填 page 讀指定頁全文。屬第 3 級來源，只適用桃園市。",
    inputSchema: { type: "object", properties: { id: str("search_minutes 結果裡的 id（也可填標題關鍵字）"), page: { type: "integer", minimum: 1 } }, required: ["id"] },
    annotations: { ...RO, title: "讀桃園市會議紀錄" }, run: getMinutes,
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

