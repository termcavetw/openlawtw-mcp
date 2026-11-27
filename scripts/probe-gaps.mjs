// 預先探測資料缺口：拿一批設計實務常問的口語詞去搜條文與函釋，列出查不到或結果很少的詞。
// 用法：node scripts/probe-gaps.mjs（不記錄任何使用者查詢；詞表在下面，自行增減）
import { searchArticles, searchRulings } from "../lib/openlaw.js";
const TERMS = `電梯 緊急昇降機 消防電梯 逃生梯 樓中樓 夾層 屋突 頂樓加蓋 陽台外推 露台 雨遮 花台 裝飾柱 格柵 女兒牆 欄杆高度 鐵窗 採光罩 遮雨棚 鐵皮屋 貨櫃屋 組合屋 樣品屋 工寮
車位 機械車位 機車位 身障車位 充電樁 車道坡度 車道寬度 迴車道 裝卸位 無障礙廁所 無障礙坡道 無障礙電梯 輪椅觀眾席 哺乳室 親子廁所 性別友善廁所
防火巷 防火門 防火窗 防火捲門 防火區劃 管道間 排煙窗 排煙室 灑水 消防栓 滅火器 緊急照明 避難器具 緩降機 防焰 耐燃一級 木構造 鋼構防火被覆
法空 建蔽率 容移 容獎 開挖率 綠覆率 透水鋪面 雨水貯留 滯洪池 屋頂綠化 太陽能 綠建築標章 建築能效 外殼耗能
畸零地 既成道路 私設道路 建築線 退縮 騎樓 無遮簷人行道 鄰棟間隔 日照 高度比 斜屋頂 天井 採光 通風 淨高 樓梯寬度 走廊寬度 梯廳 門廳 管委會空間 垃圾間 機房 水塔 電信室 台電配電室 化糞池 污水處理設施 瓦斯管
建照 使照 雜照 拆照 變使 室裝 都審 都更 危老 套繪 農舍 資材室 溫室 農業設施 露營場 民宿 日租套房 月子中心 長照機構 托嬰中心 幼兒園 補習班 安親班 KTV 網咖 夾娃娃機 健身房 診所 寵物旅館 共享辦公室 社會住宅 宿舍 工廠 倉庫 物流中心 冷凍倉庫 資料中心 儲能設備 加油站 加氣站 宗教建築 納骨塔 殯儀館 游泳池 電競館 密室逃脫 攝影棚 中央廚房 觀光工廠
違建 即報即拆 既存違建 補照 公安申報 消防安檢 結構補強 耐震評估 海砂屋 輻射屋 順向坡 山坡地 地質敏感區 斷層 淹水潛勢 土壤液化 捷運禁限建 航高限制 文資 古蹟 歷史建築 老樹 受保護樹木 招牌 廣告物 圍牆高度 擋土牆 鷹架 工地圍籬 施工噪音 鄰損 開工展期 竣工勘驗`.split(/\s+/).filter(Boolean);
const n = (t, re) => Number((t.match(re) || [0, 0])[1]);
const rows = [];
for (const k of TERMS) {
  const a = n(await searchArticles({ keywords: [k], limit: 1 }), /：(\d+) 條符合/);
  const al = n(await searchArticles({ keywords: [k], limit: 1, region: "全部" }), /：(\d+) 條符合/);
  const r = n(await searchRulings({ keywords: [k], limit: 1, source: "國土署" }), /國土署函釋符合：(\d+) 則/);
  rows.push({ k, a, al, r });
}
const zero = rows.filter((x) => !x.a && !x.al && !x.r), thin = rows.filter((x) => x.a + x.al + x.r > 0 && x.a + x.r <= 1);
console.log(`共 ${rows.length} 個詞`);
console.log(`\n完全查不到（${zero.length}）：${zero.map((x) => x.k).join("、")}`);
console.log(`\n中央條文＋國土署函釋合計 ≤1（${thin.length}）：${thin.map((x) => `${x.k}(${x.a}/${x.al}/${x.r})`).join("、")}`);
