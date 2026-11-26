// openlawtw 用表格辨識模型重建的表格（pages[].tables：{from,to,rows}，from..to-1 是這張表對應的文字行，
// 儲存格是 [text] 或 [text, colspan, rowspan]）。
// 抽查發現重建表格會錯欄、把相鄰列的數字併進來（例如文字層原本正確的分區表被重建錯），
// 所以原文一律照原樣保留；只有掃描（OCR）頁才在後面附上重建表格當「對照」，文字層頁面不附。
function grid(rows) {
  const g = [];
  rows.forEach((row, r) => {
    g[r] = g[r] || [];
    let c = 0;
    for (const cell of row) {
      while (g[r][c] !== undefined) c++;
      const [text, cs = 1, rs = 1] = cell;
      const t = String(text ?? "").replace(/\s*\n\s*/g, " ").replace(/\|/g, "／").trim();
      // 跨列（rowspan）的列標題往下重複，跨欄（colspan）只放在第一格、其餘留空，避免長文字重複好幾次
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) { g[r + i] = g[r + i] || []; g[r + i][c + j] = j === 0 ? t : ""; }
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
export const TABLE_NOTE = "【表格辨識對照】以下是 openlawtw 用表格辨識模型從掃描頁重建的表格，只供對照：模型可能錯欄或把相鄰列的數字併在一起。數字以上面的原文與原檔為準，兩者不一致時一定要開原檔核對。";
export function pageText(p) {
  const text = String(p?.text || "").trim();
  const tabs = p?.ocr && Array.isArray(p?.tables) ? p.tables.filter((t) => Array.isArray(t.rows)) : [];
  const mds = tabs.map((t) => md(t.rows)).filter(Boolean);
  if (!mds.length) return { text, rebuilt: false };
  return { text: [text, "", TABLE_NOTE, ...mds.flatMap((m) => ["", m])].join("\n"), rebuilt: true };
}
