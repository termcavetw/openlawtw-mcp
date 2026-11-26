// Landing page: tells people what this endpoint is and how to connect.
export default function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "mcp.termcavetw.com";
  const url = `https://${host}/mcp`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>openlawtw MCP｜臺灣建築法規</title>
<style>body{margin:0;font-family:system-ui,"Noto Sans TC",sans-serif;background:#F4F1E8;color:#14213D}
main{max-width:720px;margin:0 auto;padding:48px 24px}h1{font-size:32px;margin:0 0 12px}
code{display:block;background:#14213D;color:#fff;padding:14px 16px;font-size:18px;word-break:break-all;margin:12px 0 24px}
li{margin:6px 0;line-height:1.6}a{color:#1F3A5F}small{color:#5C6577}</style></head>
<body><main>
<h1>openlawtw MCP</h1>
<p>讓 AI 回答臺灣建築法規問題前，先查現行條文與國土署函釋，並附上條號、原文和連結。</p>
<p><strong>在 AI 的 MCP／連接器設定貼上這個網址：</strong></p>
<code>${url}</code>
<ul>
<li>工具：找法規、讀條文、章節目錄、搜尋條文、搜尋函釋、讀函釋、法規衝突檢查、資料版本</li>
<li>資料：<a href="https://law.termcavetw.com">openlawtw</a>（中央與 22 縣市法規、國土署函釋，每週同步）</li>
<li>個案適用以主管建築機關審查為準。</li>
</ul>
<p><small>termcave · Threads <a href="https://www.threads.net/@termcavetw">@termcavetw</a></small></p>
</main></body></html>`);
}
