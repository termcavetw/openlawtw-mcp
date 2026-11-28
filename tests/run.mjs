// openlawtw-mcp 回歸測試：在本機啟動 api/mcp.js，用 JSON-RPC 呼叫全部工具並檢查輸出。
// 讀 openlawtw 線上資料（OPENLAW_BASE 可改），不需要任何套件。用法：npm test
import http from "node:http";
// 測試會連續打幾百次，放寬每分鐘上限（線上仍是預設 120）
process.env.RATE_LIMIT_PER_MIN ||= "100000";
const { default: handler } = await import("../api/mcp.js");

const server = http.createServer((req, res) => handler(req, res));
await new Promise((r) => server.listen(0, r));
const URL_ = `http://127.0.0.1:${server.address().port}/mcp`;
let seq = 0;
async function rpc(method, params) {
  const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method, params }) });
  const raw = await r.text();
  const line = raw.startsWith("{") ? raw : raw.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
  return JSON.parse(line);
}
async function call(name, args = {}) {
  const j = await rpc("tools/call", { name, arguments: args });
  if (j.error) return { isError: true, text: JSON.stringify(j.error) };
  return { isError: !!j.result.isError, text: j.result.content.map((c) => c.text).join("\n") };
}

let fail = 0, pass = 0;
function check(label, cond, detail = "") {
  if (cond) { pass++; return; }
  fail++; console.log(`✗ ${label}${detail ? "\n    " + String(detail).slice(0, 300).replace(/\n/g, "⏎") : ""}`);
}
// name, args, [必須出現的字串…], {error: 預期 isError, not: [不可出現的字串]}
const CASES = [
  ["data_info", {}, ["openlawtw 資料版本", "最近同步", "桃園市法規疑義會議紀錄", "農業部（農地農舍）函釋"], { not: ["經濟部、農業部"] }],
  ["find_law", { query: "危老" }, ["都市危險及老舊建築物"]],
  ["find_law", { query: "桃園市 建築管理" }, ["桃園市"]],
  ["get_article", { law: "設計施工編", articles: ["107"] }, ["第 107 條", "緊急用昇降機"]],
  ["get_article", { law: "設計施工編", articles: ["第一百十條"] }, ["第 110 條"]],
  ["get_article", { law: "變使", articles: ["2"] }, ["建築物使用類組及變更使用辦法"]],
  ["get_article", { law: "不存在的法", articles: ["1"] }, ["找不到法規「不存在的法」"]],
  ["list_articles", { law: "建築法" }, ["第 1 條"]],
  ["search_articles", { keywords: ["緊急用昇降機", "避難層"], limit: 2 }, ["設計施工編"]],
  ["search_articles", { keywords: ["停車"], region: "桃園市", limit: 2 }, ["桃園市"]],
  ["search_rulings", { law: "設計施工編", article: "107", limit: 2 }, ["號"]],
  ["search_rulings", { keywords: ["機車停車", "容積"], limit: 2 }, ["號"]],
  ["get_ruling", { id: "13878" }, ["營署建管字第1100008822號", "2021-03-18"]],
  ["get_ruling", { id: "16041" }, ["日期不明"]],
  ["get_ruling", { id: "5404" }, ["重複登錄", "ruling 5393"]],
  ["check_conflicts", { law: "設計施工編" }, ["設計施工編"]],
  ["check_conflicts", { law: "建築法", region: "臺北市" }, ["建築法"], { not: ["法定空地"] }],
  ["search_documents", { keywords: ["機車", "無障礙"], limit: 2 }, ["無障礙"]],
  ["get_document", { document: "無障礙規範", section: "805" }, ["805"]],
  ["get_document", { document: "構造編", section: "第17條 表" }, ["活載重"]],
  ["get_document", { document: "變使", section: "附表二 B-3" }, ["B-3"]],
  ["get_document", { document: "變使", section: "附表三 B-3" }, ["變更為 B-3", "☆"]],
  ["get_document", { document: "原有合法建築物公共安全改善辦法", section: "附表一 B-3" }, ["B-3", "內部裝修材料"]],
  ["get_document", { document: "非都管制規則", section: "附表一 丁種建築用地" }, ["第一欄含「丁種建築用地」", "廠房或相關生產設施"]],
  ["get_document", { document: "非都管制規則", section: "附表三 表" }, ["窯業用地｜", "特定專用區", "人工"]],
  ["get_document", { document: "非都管制規則", section: "附表一 28" }, ["丁種建築用地"]],
  ["get_document", { document: "非都管制規則", section: "附表九" }, ["沒有「附表九」"]],
  ["get_document", { document: "多目標", section: "附表 兒童遊樂場" }, ["地下作停車場及電信設施使用。｜1.應面臨寬度八公尺"]],
  ["search_minutes", {}, ["共 ", "份", "102年"]],
  ["search_minutes", { keywords: ["涼亭", "天幕"], limit: 1 }, ["桃建照字第1050037445號"]],
  ["search_minutes", { keywords: ["二階段", "報備"], limit: 3 }, ["只適用桃園市", "get_minutes"]],
  ["get_minutes", { id: "710" }, ["桃建使字第1050033127號", "93 頁"]],
  ["get_minutes", { id: "710", page: 3 }, ["第 3 頁", "#minutes=710&page=3"]],
  ["get_minutes", { id: "683" }, ["封面經 OCR 辨識"]],
  ["get_minutes", { id: "1056" }, ["發文機關：桃園市政府　", "陳副處長育時"], { not: ["民政局　發文日期"] }],
  ["get_minutes", { id: "959" }, ["公文主旨寫明由市府召開"]],
  ["check_building", { group: "H-2", floors: 12, basements: 3, typical_floor_area: 620, site_area: 1800 }, ["初篩，不是合法判定", "緊急用昇降機｜建築技術規則建築設計施工編 第 106 條", "營署建管字第1081051682號", "桃園決議（第 3 級，只適用桃園市）", "不能以本決議為依據", "需確認（資訊不足", "未觸發"], { not: ["⚠ 條文已於", "現行法規找不到這一條"] }],
  ["check_building", { group: "h2", floors: 5, typical_floor_area: 230 }, ["【需確認，不是定論】", "3～5 層住宅免改設安全梯"]],
  ["check_building", { group: "H-2", floors: 12, basements: 3, typical_floor_area: 620, category: "避難逃生" }, ["只詳列：避難逃生", "昇降設備（2 項，未展開）", "■ 安全梯／特別安全梯"], { not: ["■ 緊急用昇降機"] }],
  ["check_building", { group: "C-2", floors: 4, typical_floor_area: 120, category: "無障礙" }, ["供公眾使用：是", "第 170 條公共建築物（無障礙）：否", "■ 無障礙廁所盥洗室數量", "合計：1 處（每幢）", "營署建管字第1030044357號", "get_minutes id=\"1165\" page=8"]],
  ["check_building", { uses: [{ group: "G-3", floors: "1" }, { group: "H-2", floors: "2-7" }], floors: 7, typical_floor_area: 300, plan_area: "青埔", zone_name: "住宅區", category: "桃園" }, ["混合用途 G-3（1F）、H-2（2F～7F）", "桃園市土管要點（線索，不是判定）", "PF000005000457"]],
  ["threshold_radar", { group: "H-2", floors: 5, typical_floor_area: 230, site_area: 420, height: 16 }, ["高度提高到超過 20 m", "戶數增加到 50 戶"]],
  ["check_building", { group: "Z-9", floors: 5, typical_floor_area: 230 }, ["不認得類組"], { error: true }],
  ["check_change_of_use", { from_group: "H-2", to_group: "G-3", area: 300 }, ["附表三", "停車空間", "無障礙設施"]],
  ["check_change_of_use", { from_group: "X", to_group: "G-3" }, ["不認得原使用類組"], { error: true }],
  ["check_change_of_use", { from_group: "C-2", to_group: "C-1", area: 180, floors: 2, floor: "1F", zone: "丁種建築用地", use_item: "汽車修理", urban_plan: false }, ["非都市土地 丁種建築用地", "13.汽車修理業"]],
  ["check_change_of_use", { from_group: "G-3", to_group: "B-1", area: 200, floors: 5, floor: "1F", zone: "住宅區", city: "桃園市" }, ["⛔", "不能變更使用", "第 14 條第 1 項第 10 至 12 款"]],
  ["get_document", { document: "桃園市一定規模以下建築物免辦理變更使用執照管理辦法", section: "附表一 H-2 → D-5" }, ["H-2 → D-5：④", "說明"]],
  ["search_documents", { keywords: ["室內裝修", "抽複查"], region: "新竹縣" }, ["新竹縣建築物室內裝修審核及查驗作業規範", "附件「附表二」"]],
  ["get_document", { document: "新竹縣建築物室內裝修審核及查驗作業規範", section: "附表二 第1頁" }, ["第 1 頁", "抽複查紀錄表"]],
  ["check_building", { group: "H-2", floors: 5 }, ["輸入不完整", "typical_floor_area", "floor_areas"], { error: true }],
  ["threshold_radar", { group: "H-2", floors: 5, basements: 1, typical_floor_area: 230, site_area: 420 }, ["地上加到 6 層", "＋多出　昇降機（建築技術規則建築設計施工編 第 55 條）", "－少掉　3～5 層住宅免改設安全梯"]],
  ["search_rulings", { keywords: ["共用月租套房", "消防安全設備"], limit: 2 }, ["消防問題：消防署函釋列在最前面", "nfa:bb23dbab0b71"]],
  ["search_rulings", { law: "各類場所消防安全設備設置標準", article: "12", source: "消防署", limit: 1 }, ["各類場所消防安全設備設置標準 第 12 條", "source=\"消防署\""]],
  ["get_ruling", { id: "nfa:f30da5981b27" }, ["已停止適用／廢止，不能當依據"]],
  ["check_building", { group: "C-2", floors: 4, typical_floor_area: 120, urban_plan: false, land_use: "窯業用地", category: "工廠類建築物" }, ["窯業用地：第 269 條只規定非都市土地丁種建築用地內的工廠適用第十四章"]],
  ["check_building", { group: "C-2", floors: 4, typical_floor_area: 120, zone: "乙種工業區", category: "工廠類建築物" }, ["120 ㎡ < 150㎡，不符"]],
  ["search_rulings", { keywords: ["納管", "共用"], source: "部會", limit: 2 }, ["central:M11131337060", "出處：經濟部中部辦公室《工廠管理輔導法暨相關函釋彙編》"]],
  ["get_ruling", { id: "central:M11131337060" }, ["主題：納管特登", "（PDF 彙編，無個別網頁）"]],
  ["get_ruling", { id: "nfa:f30da5981b27" }, ["⛔ 已由 內政部 內授消字第1120825476號（2023-08-24）停止適用"]],
  ["get_ruling", { id: "land:8c0194bffe16" }, ["部分停止適用［get_ruling id=\"land:6e87c9c240bb\"］"]],
  ["get_ruling", { id: "taipei:FE353389" }, ["⛔ 已由 臺北市政府都市發展局 北市都設字第1133082427號函"]],
  ["data_info", {}, ["收到 112 年 5 月"]],
  ["find_law", { query: "特種建築物" }, ["經濟部審議特種建築物申請案處理原則"]],
  ["search_rulings", { keywords: ["出流管制"], source: "部會", limit: 2 }, ["central:RGL001869", "出處：經濟部主管法規查詢系統"]],
  ["get_article", { law: "設計施工編", articles: ["95"] }, ["（上網核對：依規則第 8 條"]],
  ["search_rulings", { keywords: ["樓中樓"], source: "國土署", limit: 2 }, ["同義詞已一併搜尋：樓中樓＝夾層"]],
  ["search_articles", { keywords: ["機械車位"], limit: 2 }, ["機械停車"]],
  ["check_building", { group: "C-2", floors: 2, typical_floor_area: 400, zone: "乙種工業區", category: "工廠類建築物" }, ["（本條最近修正 2021-01-19）"]],
  ["get_article", { law: "農舍辦法", articles: ["12"] }, ["【關聯檢討】解除套繪是建管程序", "農業發展條例第 16 條"]],
  ["get_article", { law: "設計施工編", articles: ["162"] }, ["【關聯檢討】工廠類建築物", "第 273 條"]],
  ["verify_citations", { text: "依建築技術規則建築設計施工編第 269 條（2019-11-04 修正）、第 162 條（2011-06-30 修正），以及內政部營建署 108.03.20 營署建管字第1081051682號函。" }, ["✗ 建築技術規則建築設計施工編第 269 條：寫「2019-11-04 修正」，本條最近修正是 2021-01-19", "✓ 建築技術規則建築設計施工編第 162 條（修正日 2011-06-30 正確）", "✓ 營署建管字第1081051682號［國土署 13672，2019-03-20］"]],
  ["verify_citations", { text: "依國署建管字第 1141143393 號函、設計施工編第 162 條（2026-02-23 修正）。" }, ["⛔ 國署建管字第1141143393號"], { not: ["回答寫的日期 2026-02-23"] }],
  ["verify_citations", { text: "PVC 地磚依內政部 109.05.06 內授消字第1090822257號函屬防焰物品。" }, ["⛔ 內授消字第1090822257號", "回答沒有註明，不能當依據"]],
  ["verify_citations", { text: "依建築技術規則建築設計施工編第 999 條。" }, ["✗ 建築技術規則建築設計施工編第 999 條：本庫查無此條"]],
  ["check_building", { group: "H-2", floors: 5, typical_floor_area: 200, site_area: 400, plan_area: "青埔", zone_name: "住宅區", category: "容積與建蔽試算" }, ["建蔽率 50%、容積率 200% 由土管要點自動帶入", "基準容積（可建容積樓地板）：800 ㎡"]],
  ["check_building", { group: "H-2", floors: 5, typical_floor_area: 200, site_area: 400, plan_area: "中壢", zone_name: "住宅區", category: "容積與建蔽試算" }, ["無法自動擷取"]],
  ["verify_citations", { text: "依《建築技術規則建築設計施工編》第171條規定辦理。" }, ["⛔ 建築技術規則建築設計施工編第 171 條：本條已刪除"]],
  ["verify_citations", { text: "第 171 條已刪除，改依無障礙規範。依建築技術規則建築設計施工編第 171 條。" }, ["沒有發現錯誤"]],
  ["verify_citations", { text: "桃園市政府建築管理處 108.07.30 桃建照字第1080048431號函" }, ["✓ 桃建照字第1080048431號［桃園會議紀錄"]],
  ["search_rulings", { query: "緊急昇降機" }, ["search_rulings 沒有參數：query"], { error: true }],
  ["search_rulings", {}, ["要給 keywords"], { error: true }],
  ["get_article", { law: "設計施工編", articles: ["162"], date: "2008-05-01" }, ["【2008-05-01 時點的第 162 條】施行區間 2005-07-01 ～ 2011-09-30", "⚠ 這一天的條文與現行條文不同", "至無共同使用梯廳之住宅"]],
  ["get_article", { law: "設計施工編", articles: ["140"], date: "115.01.01" }, ["【2026-01-01 時點的第 140 條】施行區間 2007-01-13 ～ 2026-06-30"]],
  ["get_article", { law: "設計施工編", articles: ["162"], date: "2015-01-01" }, ["這一天的條文與現行條文相同"]],
  ["get_article", { law: "建築法", articles: ["77-2"], date: "1990-01-01" }, ["沒有涵蓋這一天的版本"]],
  ["get_article", { law: "桃園市建築管理自治條例", articles: ["1"], date: "2020-01-01" }, ["本庫沒有這部法規的歷次版本"]],
  ["verify_citations", { text: "依府都計1130019090號公告之土管要點" }, ["✓ 府都計1130019090號［桃園土管公告"]],
  ["verify_citations", { text: "新北市 北城都字第1031427728號函" }, ["✓ 北城都字第1031427728號［新北建照手冊的依據函"]],
  ["get_article", { law: "桃園市-GL001285", articles: ["3"], date: "2025-03-01" }, ["早於本法最近一次修正（2026-11-11）", "桃園市法規網的歷史法規"]],
  ["search_ntpc_manual", { no: "05-12" }, ["■ 案例 05-12（容積檢討類）"]],
  ["get_ruling", { id: "nfa:72f040b55ff6" }, ["第 146 條、第 175 條"]],
  ["get_ruling", { id: "14039" }, ["・內授營建管字第1070813543號", "・內授營建管字第1070814157號"]],
  ["threshold_radar", { group: "H-2", floors: 5, typical_floor_area: 230, site_area: 420 }, ["基地面積"]],
  ["check_building", { group: "H-2", floors: 8, basements: 4, typical_floor_area: 500, city: "桃園市" }, ["特殊結構委託審查"]],
  ["get_ruling", { id: "nfa:b3da56b6baef" }, ["消防法第42-3條於 2024-11-29 修正，晚於本函"]],
  ["get_ruling", { id: "agri:36" }, ["農業發展條例第16條於 2016-11-30 修正，晚於本函"]],
  ["get_ruling", { id: "central:FE355465" }, ["第33條於 2025-12-31 修正，晚於本函"]],
  ["search_rulings", { keywords: ["儲能"], source: "部會", limit: 3 }, ["central:FE400072"]],
  ["data_info", {}, ["內政部消防署函釋（法令解釋、執法疑義）"]],
  ["search_rulings", { keywords: ["臺北市", "山坡地"], limit: 2 }, ["臺北市政府解釋令函符合", "taipei:FE400046"]],
  ["search_rulings", { keywords: ["山坡地"], source: "台北市", limit: 1 }, ["只適用臺北市"]],
  ["search_rulings", { keywords: ["陽臺"], limit: 2 }, ["國土署函釋符合"], { not: ["臺北市政府解釋令函符合"] }],
  ["get_ruling", { id: "taipei:FE400046" }, ["府授都設字第1153061485號函", "第 3 級"]],
  ["data_info", {}, ["臺北市解釋令函：search_rulings source=\"臺北市\""]],
  ["landuse_points", { area: "航空城", point: "27" }, ["第二十七點：共 2 個版本", "PF000005000450", "臨接 30m 以上計畫道路"]],
  ["landuse_points", { area: "青埔", point: "24" }, ["PF000005000457", "應退縮三‧五公尺以上建築"]],
  ["landuse_points", { area: "青埔" }, ["第六點（12 版）最新 2024-02-01", "第二十六點（9 版）最新 2024-02-01"]],
  ["search_landuse", { area: "青埔", keywords: ["六、商二"] }, ["PF000005000457"]],
  ["search_ntpc_manual", { keywords: ["夾層", "陽台"] }, ["案例 05-03", "只適用新北市"]],
  ["search_ntpc_manual", { no: "01-01" }, ["附註：一、依據臺北縣政府", "#page=19"]],
  ["search_ntpc_manual", {}, ["變更使用類（25 案）"]],
  ["get_article", { law: "耕地分割執行要點", articles: ["4"] }, ["第四點", "零點二五公頃以上"]],
  ["search_rulings", { keywords: ["耕地", "分割"], limit: 2 }, ["地政相關問題：內政部地政司函釋列在前面", "land:"]],
  ["search_rulings", { law: "土地法", article: "73-1", source: "地政司", limit: 1 }, ["土地法 第 73-1 條"]],
  ["get_ruling", { id: "land:cb830b920c0e" }, ["台內地字第0960023008號函", "第 2 級"]],
  ["data_info", {}, ["地政司函釋（地政法令彙編）"], { not: ["內政部地政司及各縣市政府的函釋；耕地分割執行要點"] }],
  ["get_landuse", { id: "PF000005000454", page: 1 }, ["住宅區                 60       200", "零星          70       210"], { not: ["表格辨識對照"] }],
  ["get_landuse", { id: "PF000005000405", page: 28 }, ["第二十七點在較新的公告也有條文", "PF000005000450"]],
  ["search_landuse", { area: "航空城", keywords: ["公共開放空間", "退縮建築"] }, ["第二十七點在較新的公告也有條文", "第二十七點較早的版本"]],
  ["find_law", { query: "建築管理自治條例", region: "台北市" }, ["臺北市建築管理自治條例"]],
  ["find_law", { query: "台北市建築管理" }, ["臺北市建築管理自治條例"]],
  ["find_law", { query: "建技規" }, ["建築技術規則建築設計施工編"]],
  ["search_articles", { keywords: ["畸零地"], region: "台北市", limit: 1 }, ["條符合"], { not: ["範圍：0 部法規"] }],
  ["search_articles", { keywords: ["開挖率", "不存在字串zz"] }, ["search_landuse"], { not: ["土地使用管制要點，本庫未收錄"] }],
  ["get_article", { law: "建築法" }, ["缺少必填參數：articles"], { error: true }],
  ["get_minutes", { id: "985", page: 7 }, ["陽台二公尺免計容積深度基準線"], { not: ["掃描頁的表格"] }],
  ["search_landuse", { keywords: ["法定空地"], limit: 1 }, ["份符合"]],
  ["search_landuse", {}, ["33 個計畫區", "高速鐵路桃園車站特定區計畫"]],
  ["search_landuse", { area: "青埔" }, ["高速鐵路桃園車站特定區計畫", "新的在前"]],
  ["search_landuse", { keywords: ["退縮建築"], area: "高鐵", limit: 2 }, ["高速鐵路桃園車站特定區計畫", "get_landuse", "不判斷"]],
  ["search_landuse", { keywords: ["容積率"], limit: 3 }, ["公告："]],
  ["search_landuse", { keywords: ["住宅區", "建蔽率"], area: "中壢平鎮", limit: 1 }, ["可能只適用該案範圍"]],
  ["search_articles", { keywords: ["陽台", "容積"], limit: 1 }, ["2 條符合", "陽臺"], { not: ["：0 條符合"] }],
  ["search_minutes", { keywords: ["陽台", "露臺"], limit: 1 }, ["份符合"]],
  ["search_minutes", { keywords: ["緊急升降機"], limit: 1 }, ["不論新舊都以條文與函釋為準"]],
  ["search_articles", { keywords: ["緊急用升降機", "避難層"], limit: 1 }, ["第 107 條"]],
  ["search_rulings", { keywords: ["資材室"], source: "農業部", limit: 2 }, ["農業部（農地農舍）函釋符合", "agri:"]],
  ["search_rulings", { keywords: ["農舍", "套繪"], limit: 2 }, ["國土署函釋符合", "農業部（農地農舍）函釋符合"]],
  ["search_rulings", { law: "農業用地興建農舍辦法", limit: 2 }, ["農業部（農地農舍）函釋符合"]],
  ["get_ruling", { id: "agri:6123" }, ["農保規字第1152611951號", "第 2 級"]],
  ["get_ruling", { id: "agri:4689" }, ["本函引用的其他函", "農水保字第1020229253號 → 本庫有"]],
  ["get_ruling", { id: "16049" }, ["本函引用的其他函", "1120508044號 → 本庫有"]],
  ["search_rulings", { keywords: ["解除套繪"], limit: 8 }, ["農地農舍相關問題：農業部函釋列在前面"]],
  ["get_ruling", { id: "agri:6095" }, ["農牧字第1090723521號 → 被引用但本庫未收錄"], { not: ["新北農牧字第1142371081號 → 被引用"] }],
  ["get_ruling", { id: "agri:99999999" }, ["找不到農業部函釋"]],
  ["search_landuse", { area: "火星" }, ["找不到計畫區"]],
  ["get_landuse", { id: "PF000005000528" }, ["林口特定區計畫", "府都計1150321956號", "#landuse=PF000005000528"]],
  ["get_landuse", { id: "PF000005000528", page: 2 }, ["第 2 頁"]],
  ["get_landuse", { id: "不存在的土管" }, ["找不到土管要點"]],
  ["get_minutes", { id: "不存在" }, ["找不到會議紀錄「不存在」"]],
];

// 實務題庫（tests/eval.json）：每題的工具呼叫輸出必須含 check 字串
import fs from "node:fs";
const EVAL = JSON.parse(fs.readFileSync(new URL("./eval.json", import.meta.url), "utf8"));
for (const it of EVAL.items) for (const c of it.calls) CASES.push([c.tool, c.args, c.check, { label: `題庫 ${it.id}` }]);

const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "tests", version: "1" } });
const ver = init.result?.serverInfo?.version;
check("initialize 有版本號", /^\d+\.\d+\.\d+$/.test(ver || ""), JSON.stringify(init).slice(0, 200));
check("instructions 有來源順位與會議紀錄規則", /來源順位/.test(init.result?.instructions) && /search_minutes/.test(init.result?.instructions) && /search_landuse/.test(init.result?.instructions) && /不論日期新舊/.test(init.result?.instructions) && /農業部（農地農舍）函釋有收/.test(init.result?.instructions) && /建管同意解除套繪不代表地政會准分割/.test(init.result?.instructions));
const tl = await rpc("tools/list", {});
const names = (tl.result?.tools || []).map((t) => t.name);
const WANT = ["find_law", "get_article", "list_articles", "search_articles", "search_rulings", "get_ruling", "search_documents", "get_document", "search_minutes", "get_minutes", "search_landuse", "get_landuse", "check_conflicts", "data_info"];
for (const n of WANT) check(`tools/list 有 ${n}`, names.includes(n));
for (const t of tl.result?.tools || []) check(`${t.name} 有說明與 inputSchema`, t.description && t.inputSchema?.type === "object");
check("工具說明沒有過時的「未收」", !(tl.result?.tools || []).some((t) => /公安改善辦法附表一二未收|變使附表三.{0,6}未收/.test(t.description)));

for (const [name, args, want, opt = {}] of CASES) {
  const label = `${opt.label ? opt.label + " " : ""}${name} ${JSON.stringify(args)}`;
  let r;
  try { r = await call(name, args); } catch (e) { check(label + " 執行", false, e.stack); continue; }
  check(label + ` isError=${!!opt.error}`, r.isError === !!opt.error, r.text);
  for (const w of want) check(label + ` 含「${w}」`, r.text.includes(w), r.text);
  for (const w of opt.not || []) check(label + ` 不含「${w}」`, !r.text.includes(w), r.text);
  check(label + " 非空", r.text.trim().length > 0);
}
// 結構化輸出（structuredContent）：宣告 outputSchema 的工具一定要附，欄位要對
for (const t of tl.result?.tools || []) if (t.outputSchema) check(`${t.name} outputSchema 是 object`, t.outputSchema.type === "object");
const sc = async (name, args) => (await rpc("tools/call", { name, arguments: args })).result?.structuredContent;
{ const a = await sc("get_article", { law: "設計施工編", articles: ["95", "999"] });
  check("structured get_article：第 95 條修正日 2005-01-21", a?.articles?.[0]?.amended === "2005-01-21" && a?.law_id === "D0070115", JSON.stringify(a));
  check("structured get_article：第 999 條 exists=false", a?.articles?.[1]?.exists === false, JSON.stringify(a)); }
{ const a = await sc("get_ruling", { id: "nfa:f30da5981b27" });
  check("structured get_ruling：字號、日期、停用者", a?.ruling?.doc_no === "內授消字第1090822257號" && a?.ruling?.date === "2020-05-06" && a?.ruling?.revoked_by === "nfa:02e4556d02e9", JSON.stringify(a)); }
{ const a = await sc("search_rulings", { keywords: ["納管", "共用"], source: "部會", limit: 2 });
  check("structured search_rulings：有 central:M11131337060", (a?.results || []).some((r) => r.id === "central:M11131337060" && r.date === "2022-10-28"), JSON.stringify(a)); }
{ const a = await sc("search_articles", { keywords: ["電梯", "六層"], law: "設計施工編", limit: 2 });
  check("structured search_articles：第 55 條附修正日", (a?.results || []).some((r) => r.article === "第 55 條" && r.amended === "2021-07-19"), JSON.stringify(a)); }
{ const a = await sc("verify_citations", { text: "依建築技術規則建築設計施工編第 95 條（2011-02-25 修正）" });
  check("structured verify_citations：issues 1 個", a?.issues?.length === 1, JSON.stringify(a)); }
{ const a = await sc("get_ruling", { id: "不存在的id" }); check("structured get_ruling 查無時仍附物件", a && typeof a === "object", JSON.stringify(a)); }
server.close();
console.log(`\nopenlawtw-mcp v${ver}：${pass} 項通過，${fail} 項失敗`);
process.exit(fail ? 1 : 0);
