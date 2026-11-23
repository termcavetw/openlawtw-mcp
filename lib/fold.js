// 異體字摺疊：搜尋時把常見通用寫法視為同一字（台／臺、升／昇、着／著、峯／峰、綫／線、裡／裏）。
const MAP = { 台: "臺", 升: "昇", 陞: "昇", 着: "著", 峯: "峰", 綫: "線", 裏: "裡", 汙: "污", 菸: "煙" };
const RE = new RegExp(`[${Object.keys(MAP).join("")}]`, "g");
export const fold = (s) => String(s || "").replace(RE, (c) => MAP[c]);
// 給 snippet 定位用：關鍵字的各種寫法
export const variants = (kws) => [...new Set(kws.flatMap((k) => { const f = fold(k); const back = Object.entries(MAP).reduce((t, [a, b]) => t.split(b).join(a), f); return [k, f, back]; }))];
