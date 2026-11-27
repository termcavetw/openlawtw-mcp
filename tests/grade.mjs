// 題庫評分：不帶參數 → 印出題目（拿去問接了 MCP 的 AI）；帶 answers.json（{ id: 回答文字 }）→
//   1. 依每題 must（必要事實，「|」分隔的寫法任一個出現就算有）計分
//   2. 依 must_not（不能出現的錯誤說法）扣分
//   3. 用 verify_citations 核對每題引用的條號、修正日、函釋字號與日期（✗、⛔ 算錯）
import fs from "node:fs";
import { verifyCitations } from "../lib/verify-tools.js";
const { items } = JSON.parse(fs.readFileSync(new URL("./eval.json", import.meta.url), "utf8"));
const file = process.argv[2];
if (!file) { for (const it of items) console.log(`[${it.id}] ${it.q}`); console.log(`\n共 ${items.length} 題。把回答存成 JSON：{ "題目 id": "AI 的回答" }，再執行 node tests/grade.mjs answers.json`); process.exit(0); }
const ans = JSON.parse(fs.readFileSync(file, "utf8"));
const norm = (s) => String(s || "").replace(/[\s,，]/g, "");
let got = 0, total = 0, full = 0, answered = 0, wrongSaid = 0, citeBad = 0;
for (const it of items) {
  const raw = ans[it.id], a = norm(raw); if (!a) continue; answered++;
  const miss = it.must.filter((m) => !String(m).split("|").some((alt) => a.includes(norm(alt))));
  const said = (it.must_not || []).filter((m) => a.includes(norm(m)));
  const v = await verifyCitations({ text: raw });
  const issues = v.split("\n").filter((l) => /^[✗⛔]/.test(l));
  got += it.must.length - miss.length; total += it.must.length; wrongSaid += said.length; citeBad += issues.length;
  const okAll = !miss.length && !said.length;
  if (okAll) full++;
  const notes = [];
  if (miss.length) notes.push(`缺「${miss.join("」「")}」`);
  if (said.length) notes.push(`寫了錯誤說法「${said.join("」「")}」`);
  console.log(`${okAll ? "✓" : "✗"} ${it.id}${notes.length ? "：" + notes.join("；") : ""}${issues.length ? `｜引用問題 ${issues.length} 個` : ""}`);
  for (const l of issues) console.log(`    ${l}`);
  if (!okAll) console.log(`    正解：${it.answer}`);
}
console.log(`\n作答 ${answered}／${items.length} 題：${full} 題全對；必要事實 ${got}／${total}；錯誤說法 ${wrongSaid} 處；引用錯誤（條號、修正日、字號、日期、已停用）${citeBad} 個`);
