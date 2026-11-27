// 題庫評分：不帶參數 → 印出題目（拿去問接了 MCP 的 AI）；帶 answers.json（{ id: 回答文字 }）→ 依每題的 must 計分。
import fs from "node:fs";
const { items } = JSON.parse(fs.readFileSync(new URL("./eval.json", import.meta.url), "utf8"));
const file = process.argv[2];
if (!file) { for (const it of items) console.log(`[${it.id}] ${it.q}`); console.log(`\n共 ${items.length} 題。把回答存成 JSON：{ "題目 id": "AI 的回答" }，再執行 node tests/grade.mjs answers.json`); process.exit(0); }
const ans = JSON.parse(fs.readFileSync(file, "utf8"));
const norm = (s) => String(s || "").replace(/[\s,，]/g, "");
let got = 0, total = 0, full = 0, answered = 0;
for (const it of items) {
  const a = norm(ans[it.id]); if (!a) continue; answered++;
  const miss = it.must.filter((m) => !a.includes(norm(m)));
  got += it.must.length - miss.length; total += it.must.length; if (!miss.length) full++;
  console.log(`${miss.length ? "✗" : "✓"} ${it.id}${miss.length ? `：缺「${miss.join("」「")}」｜正解：${it.answer}` : ""}`);
}
console.log(`\n作答 ${answered}／${items.length} 題：${full} 題全對；必要事實 ${got}／${total}`);
