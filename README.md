# openlawtw MCP — Taiwan building law for any AI

An MCP server that lets Claude, Gemini CLI, Cursor and other MCP clients look up **current Taiwanese building, planning and land-use law** and **National Land Management Agency rulings (函釋)** from [openlawtw](https://openlawtw.vercel.app), with article numbers, quotes and links.

## Connect

Endpoint: `https://<your-deployment>.vercel.app/mcp` (Streamable HTTP, no login)

| Client | How |
|---|---|
| Claude (web / desktop / mobile) | Add a custom connector in Claude's connector settings and paste the URL |
| Claude Code | `claude mcp add --transport http openlawtw https://<your-deployment>.vercel.app/mcp` |
| Gemini CLI | in `~/.gemini/settings.json`: `{"mcpServers":{"openlawtw":{"httpUrl":"https://<your-deployment>.vercel.app/mcp"}}}` |
| Cursor | in `~/.cursor/mcp.json`: `{"mcpServers":{"openlawtw":{"url":"https://<your-deployment>.vercel.app/mcp"}}}` |

## Tools

| Tool | What it does |
|---|---|
| `find_law` | Find a law by name, short name (建技, 變使, 危老…) or keywords; a city name filters by region |
| `get_article` | Article text, chapter, last-amended date, enactment date, effective-date notes, official attachment links, warnings when the article cites deleted articles |
| `list_articles` | Chapter outline of a law |
| `search_articles` | Full-text search across articles (central by default, any city, or all) |
| `search_rulings` | Rulings by law/article or keywords, newest first, flagged ⚠ when **revoked** by a later ruling or **older than the article's latest amendment** |
| `get_ruling` | Full text of one ruling with the same warnings |
| `check_conflicts` | Per law or article: references to deleted/missing articles, "declared void" notes, revoked rulings, stale rulings |
| `search_documents`、`get_document`、`data_info` | Data version, last sync, coverage |

The server also sends **instructions** to the client on connect: look things up before answering, cite article numbers and links, never invent rulings, surface every ⚠.

## Coverage and limits

- Central government + 22 cities/counties; NLMA ruling compilation; synced weekly by openlawtw.
- Not included: urban-plan land-use control rules (土管要點, e.g. excavation ratios), and rulings from other ministries or city governments.
- Conflict checks are automatic text matching; open the source before relying on them.
- Lookup tool, not legal advice. The competent building authority decides individual cases.

## Deploy your own

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project → Import** the repo → **Deploy** (no settings, no environment variables, no build step).
3. Your endpoint is `https://<project>.vercel.app/mcp`.

Optional environment variables: `OPENLAW_BASE` (data host, default `https://openlawtw.vercel.app`), `RATE_LIMIT_PER_MIN` (default 120 per IP per instance).

Local: `node scripts/dev-server.js` → `http://localhost:3000/mcp`. Inspect with `npx @modelcontextprotocol/inspector`.

---

## 中文說明

讓任何支援 MCP 的 AI，回答臺灣建築法規問題前先查 openlawtw 的現行條文與國土署函釋，並附上條號、原文和連結。還會自動標出：函釋已被停止適用、函釋早於條文修正、條文引用了已刪除的條文、函告無效。

資料來自 [openlawtw](https://openlawtw.vercel.app)。有問題或建議，歡迎開 issue，或到 Threads 找 [@termcavetw](https://www.threads.net/@termcavetw)。

## 測試

```
npm test
```

在本機啟動 MCP，用 openlawtw 線上資料呼叫全部 14 支工具並檢查輸出（約 180 項）。不需要安裝任何套件。推送到 main、開 PR 時會由 GitHub Actions 自動執行，另外每天跑一次以發現上游資料格式變動。**推送前請先跑過。**
