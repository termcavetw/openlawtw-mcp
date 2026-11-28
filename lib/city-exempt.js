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

// 中文數字（二百、一千五百、十二）→ 數字
function cnum(t) {
  t = String(t).replace(/[,，\s]/g, ""); if (/^\d+(\.\d+)?$/.test(t)) return +t;
  const D = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }, U = { 十: 10, 百: 100, 千: 1000 };
  let n = 0, cur = 0; for (const ch of t) { if (ch in D) cur = D[ch]; else if (ch in U) { n += (cur || 1) * U[ch]; cur = 0; } else return null; }
  return n + cur;
}
const NUM = "[\\d,.零〇一二兩三四五六七八九十百千]+";
// 規模條件裡能機械判斷的三種：面臨 N 公尺以上道路、面積未達／小於 N 平方公尺、樓層（第一層、二層以下…）
function checks(text, a) {
  const t = String(text || ""), A = Number(a.area) > 0 ? Number(a.area) : null, rw = Number(a.road_width) > 0 ? Number(a.road_width) : null;
  const fm = String(a.floor || "").toUpperCase().match(/^(\d+)\s*(F|樓|層)?$/), fb = String(a.floor || "").toUpperCase().match(/^B(\d+)/);
  const up = fm ? +fm[1] : null, bs = fb ? +fb[1] : null, out = [];
  const road = t.match(new RegExp(`面臨\\s*(${NUM})\\s*公尺以上(?:之)?(?:計畫)?道路`));
  if (road) { const n = cnum(road[1]); out.push(rw == null ? { k: `路寬 ≥${n}m`, v: null } : { k: `路寬 ${rw}m ${rw >= n ? "≥" : "<"} ${n}m`, v: rw >= n }); }
  const ar = t.match(new RegExp(`(?:未達|小於|未滿)\\s*(${NUM})\\s*平方公尺`));
  if (ar) { const n = cnum(ar[1]); out.push(A == null ? { k: `面積 <${n}㎡`, v: null } : { k: `面積 ${A}㎡ ${A < n ? "<" : "≥"} ${n}㎡`, v: A < n }); }
  const lv = up == null && bs == null ? null : up ? up + "F" : "B" + bs;
  if (/避難層直上層/.test(t)) out.push(lv == null ? { k: "限避難層直上層（以 2F 計）", v: null } : { k: `限避難層直上層（以 2F 計；本案 ${lv}）`, v: up === 2 });
  else if (/避難層/.test(t) && !/第二層|二層|地下/.test(t)) out.push(lv == null ? { k: "限避難層（以 1F 計）", v: null } : { k: `限避難層（以 1F 計；本案 ${lv}）`, v: up === 1 });
  else if (/地面第一層|建築物之?第一層|限(?:於)?第一層|地面一層/.test(t) && !/第二層|二層|地下/.test(t)) out.push(up == null && bs == null ? { k: "限第一層", v: null } : { k: `限第一層（本案 ${up ? up + "F" : "B" + bs}）`, v: up === 1 });
  else { const m = t.match(/地面第?二層以下至地下第?一層以上|地面一層、地面二層或地下一層/); if (m) out.push(up == null && bs == null ? { k: "限 1F、2F、B1", v: null } : { k: `限 1F、2F、B1（本案 ${up ? up + "F" : "B" + bs}）`, v: up === 1 || up === 2 || bs === 1 }); }
  return out;
}
const tag = (cs) => (cs.length ? `　［${cs.map((c) => (c.v === true ? "✓ " : c.v === false ? "✗ " : "？ ") + c.k).join("；")}］` : "");
export function cityOf(city) {
  const c = String(city || "");
  if (/桃園/.test(c)) return null;
  const hit = CITIES.find(([re]) => re.test(c)); if (hit) return { name: hit[1], law: hit[2] };
  const t = IN_TEXT.find(([re]) => re.test(c)); if (t) return { name: t[1], inText: true };
  if (/花蓮/.test(c)) return { name: "花蓮縣", missing: true };
  return c ? { name: c, unknown: true } : null;
}

// 規模條件判斷結果彙總：有一列能判斷的條件全部符合 → 可能免辦；每列都有不符 → 不符
function verdict(name, to, cs, noItem) {
  const full = cs.filter((c) => c.length && c.every((x) => x.v === true)), allBad = cs.length && cs.every((c) => c.some((x) => x.v === false));
  if (allBad) return `${name}：附表所列 ${to} 的各列，本案的面積、樓層或路寬都不符，要辦理變更使用執照`;
  if (full.length) return `${name}：附表有 ${full.length} 列的面積、樓層、路寬本案都符合，使用項目也符合者得免辦變使${noItem ? "（附表沒有寫到你填的使用項目，要自行對照）" : ""}（見文末${name}一節）`;
  return `${name}：附表有變更為 ${to} 的規模條件，符合者得免辦變使（${cs.some((c) => c.some((x) => x.v === null)) ? "填 area、floor、road_width 可判斷面積、樓層、路寬；" : ""}條件見文末${name}一節）`;
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
        const parts = v.split("／"), miss = [], ev = [];
        const A = Number(a.area) > 0 ? Number(a.area) : null, fl = String(a.floor || "").toUpperCase().match(/^(\d+)\s*(F|樓|層)?$/), f1 = fl ? +fl[1] === 1 : /^B/i.test(String(a.floor || "")) ? false : null;
        for (const p of parts) {
          const k = p.trim(); const d = (T.legend || {})[k]; if (!d) { miss.push(k); ev.push(null); continue; }
          // 只判斷「面積未達 N㎡」與「建築物之第一層」兩種條件；其他文字（使用項目、樓梯寬度等）要自己核對
          const m = d.match(/未達\s*([\d,]+)\s*平方公尺/), n = m ? +m[1].replace(/,/g, "") : null;
          const rest = d.replace(/建築物之?第一層[，,、]?/, "").replace(/使用(總)?樓地板面積未達\s*[\d,]+\s*平方公尺者?/, "").replace(/[，,。、且]/g, "").trim();
          let r = null;
          if (n != null && A != null && A >= n) r = false;
          else if (/第一層/.test(d) && f1 === false) r = false;
          else if (n != null && A != null && !rest && (!/第一層/.test(d) || f1 === true)) r = true;
          ev.push(r);
          L.push(`  ${k}：${d}${r === false ? `　→ 本案不符（${A != null && n != null && A >= n ? `${A}㎡ ≥ ${n}㎡` : "不在第一層"}）` : r === true ? `　→ 本案符合（${A}㎡ < ${n}㎡${/第一層/.test(d) ? "、第一層" : ""}）` : ""}`);
        }
        if (miss.length) L.push(`  ⚠ 原表沒有說明符號「${miss.join("、")}」的意思，不要自行推定，請向主管機關確認`);
        if (parts.length > 1) L.push("  （這一格有兩個條件，符合其中之一）");
        if (ev.some((x) => x === true)) { ok = true; sum = `${C.name}：附表「${v}」，依面積${f1 === true ? "與樓層" : ""}符合，得免辦變使（仍要符合說明所列其他條件）`; }
        else if (ev.length && ev.every((x) => x === false)) { ok = false; sum = `${C.name}：附表「${v}」，本案面積或樓層不符，要辦理變更使用執照`; }
        else sum = `${C.name}：附表「${v}」，符合符號所列條件者得免辦變使（${A == null ? "填 area、floor 可判斷面積與樓層；" : ""}其他條件要自行核對，見文末${C.name}一節）`;
      }
    }
  } else if (T.kind === "use-group list") {
    const rows = (T.rows || []).filter((x) => toList(x.to).includes(G) && (!x.from || toList(x.from).includes(F) || !F));
    const byFrom = rows.filter((x) => x.from), anyFrom = rows.filter((x) => !x.from);
    const use = byFrom.length ? byFrom : anyFrom;
    if (!use.length) { L.push(`  變更為 ${to}${byFrom.length || !rows.length ? "" : ""}：附表沒有列${(T.rows || []).some((x) => x.from) ? `（原類組 ${from}）` : ""}`); sum = `${C.name}：附表沒有列變更為 ${to}，要辦理變更使用執照或向主管機關確認`; ok = false; }
    else {
      const ui = String(a.use_item || ""), pick = ui ? use.filter((x) => String(x.condition || "").includes(ui)) : [];
      const show = pick.length ? pick : use, cs = show.map((x) => checks(x.condition, a));
      show.slice(0, 8).forEach((x, i) => L.push(`  ${x.item ? x.item + "｜" : ""}${x.from ? `${x.from}${x.fromItems ? `（${x.fromItems.slice(0, 40)}${x.fromItems.length > 40 ? "…" : ""}）` : ""} → ` : ""}${toList(x.to).join("、")}：${x.condition}${x.procedure ? `（申請程序 ${x.procedure}${(T.legend || {})[x.procedure] ? "：" + T.legend[x.procedure] : ""}）` : ""}${tag(cs[i])}`));
      if (show.length > 8) L.push(`  （還有 ${show.length - 8} 列）`);
      if (pick.length && pick.length < use.length) L.push(`  （只列條件寫到「${ui}」的 ${pick.length} 列；附表共 ${use.length} 列）`);
      sum = verdict(C.name, to, cs, ui && !pick.length);
    }
  } else if (T.kind === "zone-use list") {
    const z = String(a.zone || ""), zk = z.replace(/區.*$/, "").slice(0, 2);
    let rows = (T.rows || []).filter((x) => toList(x.to || x.group).includes(G) && (!x.from || toList(x.from).includes(F)));
    const zr = zk ? rows.filter((x) => String(x.zone || "").includes(zk)) : rows;
    if (zk && rows.length && !zr.length) L.push(`  ⚠ 分區「${z}」沒有對到附表的分區列，以下列出所有分區`);
    if (zk && zr.length) rows = zr;
    if (!rows.length) { L.push(`  ${from ? from + " → " : ""}${to}：附表沒有列`); sum = `${C.name}：附表沒有列 ${to}（依分區列使用項目），要辦理變更使用執照或向主管機關確認`; ok = false; }
    else {
      const ui = String(a.use_item || ""), pick = ui ? rows.filter((x) => `${x.items || ""}${x.condition || ""}`.includes(ui)) : [];
      const show = pick.length ? pick : rows, cs = show.map((x) => checks(`${x.scale || ""}${x.condition || ""}`, a));
      show.slice(0, 10).forEach((x, i) => L.push(`  【${x.zone}】${x.from ? x.from + " → " : ""}${toList(x.to || x.group).join("、")}${x.items ? `：${x.items}` : ""}${x.scale ? `｜規模：${x.scale}` : ""}${x.condition ? `｜${x.condition}` : ""}${tag(cs[i])}`));
      if (show.length > 10) L.push(`  （還有 ${show.length - 10} 列；填 zone 可縮小）`);
      if (pick.length && pick.length < rows.length) L.push(`  （只列使用項目寫到「${ui}」的 ${pick.length} 列；共 ${rows.length} 列）`);
      sum = verdict(C.name, to, cs, ui && !pick.length);
    }
  }
  for (const n of (T.notes || []).filter((x) => !/^(說明|備註)[：:]?$/.test(String(x).trim())).slice(0, 4)) L.push(`  說明：${String(n).slice(0, 200)}`);
  L.push(`  全表：get_document document="${law}"${att.title ? ` section="${String(att.title).replace(/\.\w+$/, "").slice(0, 30)}"` : ""}；照原表符號引用，以原檔為準。仍要符合使用分區的容許使用與消防法規`);
  return { head, ok, sum, lines: L };
}
