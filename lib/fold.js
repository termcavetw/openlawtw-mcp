// 異體字摺疊：搜尋時把常見通用寫法視為同一字（台／臺、升／昇、着／著、峯／峰、綫／線、裡／裏）。
const MAP = { 台: "臺", 升: "昇", 陞: "昇", 着: "著", 峯: "峰", 綫: "線", 裏: "裡", 汙: "污", 菸: "煙" };
const RE = new RegExp(`[${Object.keys(MAP).join("")}]`, "g");
// PDF 文字層常把字存成 CJK 相容字（如 U+F9D1「六」），先轉回一般字，搜尋與點次辨識才對得上
export const compat = (s) => String(s ?? "").replace(/[\u2E80-\u2FDF\uF900-\uFAFF]/g, (c) => c.normalize("NFKC"));
export const fold = (s) => compat(s || "").replace(RE, (c) => MAP[c]);
// 給 snippet 定位用：關鍵字的各種寫法
export const variants = (kws) => [...new Set(kws.flatMap((k) => { const f = fold(k); const back = Object.entries(MAP).reduce((t, [a, b]) => t.split(b).join(a), f); return [k, f, back]; }))];
