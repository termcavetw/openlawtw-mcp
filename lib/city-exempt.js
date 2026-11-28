// 各縣市「一定規模以下免辦理變更使用執照」附表（openlawtw 逐格整理 transcription，PR #73）
// 只查表、照原表符號與條件全文列出，不替原表推定：原表沒說明的符號、空白格照實說明。
import { attachmentData } from "./openlaw.js";

const CITIES = [
  [/臺北|台北/, "臺北市", "臺北市-FL038035"], [/基隆/, "基隆市", "基隆市-FL054775"], [/新竹市/, "新竹市", "新竹市-FL047278"],
  [/連江|馬祖/, "連江縣", "連江縣-GL000333"], [/金門/, "金門縣", "金門縣-GL000439"], [/臺中|台中/, "臺中市", "臺中市-GL001001"],
  [/嘉義縣/, "嘉義縣", "嘉義縣-FL035595"], [/澎湖/, "澎湖縣", "澎湖縣-FL050474"], [/新竹縣/, "新竹縣", "新竹縣-FL046114"],
  [/新北/, "新北市", "新北市-C0170033"], [/高雄/, "高雄市", "高雄市-GL000003"],
];
const IN_TEXT = [[/臺南|台南/, "臺南市"], [/宜蘭/, "宜蘭縣"], [/南投/, "南投縣"], [/嘉義市/, "嘉義市"], [/臺東|台東/, "臺東縣"], [/彰化/, "彰化縣"]];
const gk = (g) => String(g || "").toUpperCase().replace(/[－–—_ ]/g, "-").replace(/^([A-I])-?(\d)$/, "$1$2");
const toList = (t) => (Array.isArray(t) ? t : String(t || "").split(/[、,，／/]/)).map(gk).filter(Boolean);

export function cityOf(city) {
  const c = String(city || "");
  if (/桃園/.test(c)) return null;
  const hit = CITIES.find(([re]) => re.test(c)); if (hit) return { name: hit[1], law: hit[2] };
  const t = IN_TEXT.find(([re]) => re.test(c)); if (t) return { name: t[1], inText: true };
  if (/花蓮/.test(c)) return { name: "花蓮縣", missing: true };
  return c ? { name: c, unknown: true } : null;
}

export async function cityExempt(city, from, to, a = {}) {
  const C = cityOf(city); if (!C) return null;
  const head = `════ ${C.name}一定規模以下建築物免辦理變更使用執照 ════`;
  if (C.unknown) return { head, ok: null, sum: null, lines: [`■ ${C.name}：本庫沒有整理這個縣市的免辦變更使用規定，請用 find_law query="${C.name} 免辦理變更使用執照" 查`] };
  if (C.inText) return { head, ok: null, sum: `${C.name}：免辦變使的規模寫在辦法條文裡，要讀條文判斷`, lines: [`■ ${C.name}的免辦理變更使用執照規模直接寫在條文裡（沒有另外的附表）：find_law query="${C.name} 免辦理變更使用執照"，再用 get_article 讀條文`] };
  if (C.missing) return { head, ok: null, sum: `${C.name}：附表本庫沒有，無法判斷`, lines: ["■ 花蓮縣的辦法寫「如附表」，但官方附件只有申請書表，這張附表本庫沒有：查不到，請向花蓮縣政府確認"] };
  let R; try { R = await attachmentData(C.law); } catch { R = null; }
  const att = R && R.attachments.find((x) => x.transcription);
  if (!att) return { head, ok: null, sum: null, lines: [`■ ${C.name}的附表讀不到，請用 get_document document="${C.law}" 查`] };
  const T = att.transcription, F = gk(from), G = gk(to), law = R.name || C.law, src = att.url || "";
  const L = [`■ ${law}［${C.law}］附表「${String(att.title || "").replace(/\.\w+$/, "")}」（openlawtw 逐格整理，照原表引用；原檔 ${src}）`];
  let ok = null, sum = null;
  if (T.kind === "use-group matrix") {
    const r = (T.rows || []).find((x) => gk(x.from) === F && gk(x.to) === G);
    if (!r) { L.push(`  ${from} → ${to}：表未列`); sum = `${C.name}：附表未列 ${from} → ${to}，要辦理變更使用執照或向主管機關確認`; }
    else {
      const v = String(r.value || "").trim();
      L.push(`  ${from} → ${to}：「${v}」`);
      if (/空白/.test(v)) { L.push("  ⚠ 原表這一格是空白，原表沒有說明，不要自行推定，請向主管機關確認"); sum = `${C.name}：附表這一格空白（原表沒有說明），要向主管機關確認`; }
      else if (/^[×╳xX]$/.test(v)) { ok = false; L.push(`  ${(T.legend || {})[v] || "不適用免辦理變更使用執照"}`); sum = `${C.name}：附表「${v}」，不符免辦變使，要辦理變更使用執照`; }
      else {
        const parts = v.split("／"), miss = [];
        for (const p of parts) { const k = p.trim(); const d = (T.legend || {})[k]; if (d) L.push(`  ${k}：${d}`); else miss.push(k); }
        if (miss.length) L.push(`  ⚠ 原表沒有說明符號「${miss.join("、")}」的意思，不要自行推定，請向主管機關確認`);
        if (parts.length > 1) L.push("  （這一格有兩個條件，符合其中之一）");
        sum = `${C.name}：附表「${v}」，符合符號所列條件者得免辦變使（條件要自行核對，見文末${C.name}一節）`;
      }
    }
  } else if (T.kind === "use-group list") {
    const rows = (T.rows || []).filter((x) => toList(x.to).includes(G) && (!x.from || toList(x.from).includes(F) || !F));
    const byFrom = rows.filter((x) => x.from), anyFrom = rows.filter((x) => !x.from);
    const use = byFrom.length ? byFrom : anyFrom;
    if (!use.length) { L.push(`  變更為 ${to}${byFrom.length || !rows.length ? "" : ""}：附表沒有列${(T.rows || []).some((x) => x.from) ? `（原類組 ${from}）` : ""}`); sum = `${C.name}：附表沒有列變更為 ${to}，要辦理變更使用執照或向主管機關確認`; ok = false; }
    else {
      for (const x of use.slice(0, 8)) L.push(`  ${x.item ? x.item + "｜" : ""}${x.from ? `${x.from}${x.fromItems ? `（${x.fromItems.slice(0, 40)}${x.fromItems.length > 40 ? "…" : ""}）` : ""} → ` : ""}${toList(x.to).join("、")}：${x.condition}${x.procedure ? `（申請程序 ${x.procedure}${(T.legend || {})[x.procedure] ? "：" + T.legend[x.procedure] : ""}）` : ""}`);
      if (use.length > 8) L.push(`  （還有 ${use.length - 8} 列）`);
      sum = `${C.name}：附表有變更為 ${to} 的規模條件，符合者得免辦變使（條件見文末${C.name}一節）`;
    }
  } else if (T.kind === "zone-use list") {
    const z = String(a.zone || ""), zk = z.replace(/區.*$/, "").slice(0, 2);
    let rows = (T.rows || []).filter((x) => toList(x.to || x.group).includes(G) && (!x.from || toList(x.from).includes(F)));
    const zr = zk ? rows.filter((x) => String(x.zone || "").includes(zk)) : rows;
    if (zk && rows.length && !zr.length) L.push(`  ⚠ 分區「${z}」沒有對到附表的分區列，以下列出所有分區`);
    if (zk && zr.length) rows = zr;
    if (!rows.length) { L.push(`  ${from ? from + " → " : ""}${to}：附表沒有列`); sum = `${C.name}：附表沒有列 ${to}（依分區列使用項目），要辦理變更使用執照或向主管機關確認`; ok = false; }
    else {
      for (const x of rows.slice(0, 10)) L.push(`  【${x.zone}】${x.from ? x.from + " → " : ""}${toList(x.to || x.group).join("、")}${x.items ? `：${x.items}` : ""}${x.scale ? `｜規模：${x.scale}` : ""}${x.condition ? `｜${x.condition}` : ""}`);
      if (rows.length > 10) L.push(`  （還有 ${rows.length - 10} 列；填 zone 可縮小）`);
      sum = `${C.name}：附表有 ${to} 的使用項目與規模（依分區列），符合者得免辦變使（見文末${C.name}一節）`;
    }
  }
  for (const n of (T.notes || []).filter((x) => !/^(說明|備註)[：:]?$/.test(String(x).trim())).slice(0, 4)) L.push(`  說明：${String(n).slice(0, 200)}`);
  L.push(`  全表：get_document document="${law}"${att.title ? ` section="${String(att.title).replace(/\.\w+$/, "").slice(0, 30)}"` : ""}；照原表符號引用，以原檔為準。仍要符合使用分區的容許使用與消防法規`);
  return { head, ok, sum, lines: L };
}
