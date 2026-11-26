// openlawtw 用表格辨識模型重建的表格（pages[].tables：{from,to,rows}，from..to-1 是被這張表取代的文字行，
// 儲存格是 [text] 或 [text, colspan, rowspan]）。展開合併儲存格後輸出成 Markdown 表格，讓 AI 不必猜欄位。
function grid(rows) {
  const g = [];
  rows.forEach((row, r) => {
    g[r] = g[r] || [];
    let c = 0;
    for (const cell of row) {
      while (g[r][c] !== undefined) c++;
      const [text, cs = 1, rs = 1] = cell;
      const t = String(text ?? "").replace(/\s*\n\s*/g, " ").replace(/\|/g, "／").trim();
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) { g[r + i] = g[r + i] || []; g[r + i][c + j] = t; }
      c += cs;
    }
  });
  const w = Math.max(0, ...g.map((r) => r.length));
  return g.filter(Boolean).map((r) => Array.from({ length: w }, (_, i) => r[i] ?? ""));
}
function md(rows) {
  const g = grid(rows);
  if (!g.length) return "";
  const line = (r) => `| ${r.join(" | ")} |`;
  return [line(g[0]), line(g[0].map(() => "---")), ...g.slice(1).map(line)].join("\n");
}
export const TABLE_NOTE = "（下列 Markdown 表格由 openlawtw 用表格辨識模型從掃描頁重建，合併儲存格已展開成重複值；欄位與數字仍可能有誤，引用前請開原檔核對）";
export function pageText(p) {
  const text = String(p?.text || "");
  const tabs = Array.isArray(p?.tables) ? [...p.tables].filter((t) => Number.isInteger(t.from) && Number.isInteger(t.to) && Array.isArray(t.rows)).sort((a, b) => a.from - b.from) : [];
  if (!tabs.length) return { text: text.trim(), rebuilt: false };
  const lines = text.split("\n");
  const out = [];
  let at = 0;
  for (const t of tabs) {
    if (t.from < at) continue;
    out.push(...lines.slice(at, t.from));
    const m = md(t.rows);
    if (m) out.push("", m, ""); else out.push(...lines.slice(t.from, t.to));
    at = t.to;
  }
  out.push(...lines.slice(at));
  return { text: out.join("\n").trim(), rebuilt: true };
}
