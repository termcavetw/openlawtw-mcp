// openlawtw MCP server — Streamable HTTP transport, stateless, JSON responses.
// Deploy on Vercel: this file is served at /api/mcp (vercel.json also maps /mcp here).
import { fold, synNote } from "../lib/fold.js";
import { searchDocuments, getDocument, findLaw, getArticle, listArticles, searchArticles, searchRulings, getRuling, checkConflicts, dataInfo } from "../lib/openlaw.js";
import { searchMinutes, getMinutes, minutesInfo } from "../lib/minutes-tools.js";
import { searchNtpc } from "../lib/ntpc-tools.js";
import { checkBuilding, thresholdRadar } from "../lib/building-tools.js";
import { checkChangeOfUse } from "../lib/change-of-use.js";
import { verifyCitations } from "../lib/verify-tools.js";
import { SCHEMAS, structure } from "../lib/structured.js";
import { landusePoints, searchLanduse, getLanduse } from "../lib/landuse-tools.js";

const SERVER = { name: "openlawtw", title: "openlawtw 臺灣建築法規", version: "1.25.1" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `openlawtw：臺灣建築、都市計畫、土地使用法規與國土署函釋資料庫。
回答臺灣建築法規問題時請遵守：
1. 條號、條文內容、函釋字號一律先用工具查過才寫，不憑記憶。
2. 引用時寫法規全名＋條號，引用關鍵原文，附上工具給的連結；函釋寫字號與日期。條文的修正日期只能照工具印出的「本條最近修正」寫（法規整部的最新修正日不是該條的修正日）；沒有讀到該條的修正日就不要寫日期。
3. 查不到就說查不到，不要補條號或捏造函釋。
4. 工具印出 ⛔「已由 X 停止適用」的函不能當依據（標「部分停止適用」的要讀 X 確認哪些部分仍適用），改引用 X 或更新的函。注意工具印出的 ⚠：條文已修正而函釋較舊、函釋已被停止適用、條文引用已刪除的條文、函告無效、施行日註記。有的話要明白告訴使用者，並優先採用較新的規定與函釋。
5. 問題涉及特定縣市時，也要查該縣市的規定（region 參數）。新北市的案子另用 search_ntpc_manual 查新北市建照業務工作手冊（第 3 級，只適用新北市）。
6. 開挖率、建蔽率、容積率、退縮、停車等常寫在各都市計畫的土地使用分區管制要點（土管要點）。桃園市的土管要點用 search_landuse／get_landuse 查（497 份、33 個計畫區）：土管要點對該計畫區內基地有拘束力，但每份只是某一次公告，本庫不判斷哪份是現行版本——回答時要寫明計畫區、公告日期與文號，提醒使用者確認基地屬於哪個主要／細部計畫、之後有沒有較新的公告；工具標示「之後還有 N 份公告」時要說出來；標示某一點（如第二十七點）在較新的公告也有條文時，該點以較新的公告為準（要比對差異、確認較新公告的適用範圍），不要只讀最早那份完整的要點。要知道某一點最新在哪一份、前一版寫什麼，用 landuse_points（area＋point）。OCR 頁的數字（建蔽率、容積率、退縮距離）可能有誤，引用數字前一定要請使用者開原檔核對。其他縣市的土管要點本庫未收。臺北市解釋令函有收（search_rulings source="臺北市"，第 3 級，只適用臺北市）；消防署函釋有收（內政部消防署「消防法令查詢系統」的法令解釋與執法疑義，search_rulings source="消防署"，第 2 級；消防安全設備、檢修申報、防火管理、公共危險物品等問題一起查，系統標示已廢止的會標 ⚠）。經濟部工廠函釋有收：經濟部中部辦公室《工廠管理輔導法暨相關函釋彙編》（102、106、112 年版，收到 112 年 5 月；工廠登記、特定工廠、未登記工廠納管、工業用地等）、經濟部主管法規查詢系統的部分解釋令（出流管制、工廠管理輔導法、產業創新條例等），以及臺北市法規查詢系統轉載在工廠管理輔導法、消防法等條文下的部會函（search_rulings source="部會"，第 2 級）；112 年 5 月以後的經濟部函多半未收，查不到不代表沒有函釋。經濟部的行政規則（特種建築物審議、毗鄰工業區擴廠、丁種建築用地變更編定審查、未登記工廠處理原則等）用 find_law／get_article 查。農業部（農地農舍）函釋有收：農舍、農業設施、農業用地、非都市土地農牧用地的問題，用 search_rulings（source="農業部" 或預設全部）一起查。農地、農舍案子常同時涉及建管與地政：解除套繪、變更使用執照是建管程序（農業用地興建農舍辦法第 12 條、國土署與農業部函釋）；土地分割是地政程序，耕地（非都市土地特定農業區、一般農業區、山坡地保育區、森林區的農牧用地）分割後每宗原則上要 0.25 公頃以上（農業發展條例第 16 條，有分割合併、89 年前共有、繼承等例外），耕地以外的農業用地（如都市計畫農業區）不受此限。建管同意解除套繪不代表地政會准分割，兩邊都要檢討並明白告訴使用者。耕地分割執行要點（find_law query="耕地分割執行要點"）與內政部地政司「地政法令彙編」函釋（search_rulings source="地政司"）本庫有收，涉及分割、登記、非都市土地使用編定等地政問題時一起查；地政司函釋彙編以法條分類，查不到不代表沒有函釋。查不到時要說明是收錄範圍的限制。
7. 網路資料的用法：條文與函釋以本工具查到的為準。網路文章、新聞、論壇只能當線索；與條文或函釋不一致時，以條文為準，並明白告訴使用者網路說法哪裡錯、錯在哪（例如漏了但書、混用了地方規定）。
8. 上網補查：若你有上網工具，每一題在查完本庫之後、回答之前，至少上網查一次政府官方網站（.gov.tw），目的是確認有沒有本庫還沒收的較新函釋、修法動態或該縣市的規定；同一段對話裡同一主題查過一次即可。本庫未收錄的內容（其他縣市的土管要點、其他機關或縣市政府函釋、桃園、新北以外縣市的建照工作手冊與法規執行疑義／複核會議紀錄、建築師公會法規研討紀錄、法院判決）更要上網查。優先找政府官方網站，其次是該縣市建築師公會網站轉載的機關公文與會議紀錄；引用時註明來源網站與日期，並說明這部分不是來自 openlawtw。回答裡要寫明上網查了什麼、有沒有查到不同的內容；沒有上網工具時，說明未能上網核對。網路資料的效力仍依第 7、9 條：不能取代條文與函釋。
9. 來源順位：效力由高到低為 (1) 法律、法規命令與技術規範的條文；(2) 中央主管機關函釋：內政部國土管理署（原營建署）函釋，含正式發文的研商會議紀錄；農業部（原農委會）就農業用地、農舍、農業設施的解釋函／令；內政部（地政司）就土地法、土地登記、耕地分割、非都市土地使用管制等地政事項的解釋函；(3) 縣市主管建築機關的函釋、建照工作手冊、審查或複核決議，含機關主持或與公會聯席、由機關作成決議並發文的法規研討／疑義會議紀錄（只適用該縣市）；(4) 建築師公會、學會的講座簡報與實務整理，以及公會自行召開、決議不是由機關作成的會議紀錄（即使由機關轉送）；(5) 一般網路文章、新聞、論壇。回答時每個依據都標明屬於哪一級；較低級的說法和較高級的不一致時，以較高級為準並說明差在哪。第 3 級只能用在該縣市的案子；第 4、5 級只能當實務參考或線索，不能當法源，也不能寫成「依規定」。網路上找到的函釋、會議紀錄、簡報，要找到原文件（發文機關、字號、日期）才能引用；找不到原文就說明「未見原文，僅供參考」。
10. 官方核對：遇到下列情況，要開工具附的「官方來源」連結（全國法規資料庫、縣市法規網、國土署函釋頁面）核對關鍵條文的內容與最新修正日是否一致——(a) 答案會用在擬函、送審、回覆業主等正式用途；(b) 使用者問到最近有沒有修正；(c) data_info 顯示最近同步已超過 7 天。只拿官方網站核對，不拿一般網路文章核對。對不上時以官方網站為準，告訴使用者 openlawtw 可能尚未同步，並建議回報給 openlawtw。無法連到官方網站時，說明未能核對。
11. 桃園市的案子或問到桃園市怎麼認定時，查完條文與國土署函釋後，即使已有答案，也要再用 search_minutes 查桃園市有沒有相關或不同的決議（關鍵字換幾種寫法，如「緊急昇降機」「緊急用昇降機」）；有不同的決議要明白指出差異，沒有就說沒查到。search_minutes 的內容是：桃園市政府建管單位法規執行疑義會議紀錄與公文（轉載於桃園市建築師公會網站），只適用桃園市的案子，不是法源。級別看每份紀錄的主持人與決議由誰作成（工具會標出主持人），不看會議名稱：市府人員主持並作成決議者可當第 3 級（「加速建照案審查修正意見暨疑義會議」多由建管處副處長或都發局副局長主持，也屬此類）；公會自行召開、市府只是轉送者只能當第 4 級實務參考。決議多半針對個案，要讀說明與條件、對照同主題的其他紀錄與函釋，不要只憑單一決議下結論。要寫明會議日期、發文機關與字號；有 OCR 誤字風險，引用前請開原檔；引用會議決議前，要先查同一條文的國土署函釋（search_rulings law=… article=…）：決議與條文或國土署函釋牴觸時，不論日期新舊，都以條文與函釋為準，並明白告訴使用者這個決議與上級規定不一致、不能當依據；只有桃園市自己的紀錄之間前後矛盾時，才以較新的為準。
12. 這是法規查詢，不是主管機關的認定；個案適用請以主管建築機關審查為準。
13. 求解器是設計初期的初篩，不是合法判定：check_building／threshold_radar 只依輸入的量體列出要檢討的條文與門檻，不看平面配置。它列出的每一項都要再讀條文與函釋才能下結論；標「需確認」的不能說成「要」或「不要」；工具標 ⚠「條文已修正」的規則先不要採用，以現行條文為準。回答時說明這是初篩。
14. 回答寫好、送出之前，用 verify_citations 把草稿全文核對一次；有 ✗（條號、修正日、字號或日期寫錯）或 ⛔（引用已停止適用的函卻沒註明）要先改正再回答，？（本庫未收）要註明未見原文。
15. 問到舊案（建照掛號、變更、使照當時）適用的法令，或說「當時」的規定時，用 get_article 的 date 參數查那一天有效的條文，不要拿現行條文回答；工具標「起迄日不確定」或沒有涵蓋那天的，要說明並請使用者開全國法規資料庫沿革核對。
建議流程：find_law 確認法規 → get_article 讀條文 → search_rulings 查函釋 → get_ruling 讀全文；不知道在哪一條就 search_articles。無障礙設施設計規範、耐震設計規範、綠建築技術規範等沒有逐條條文的原文文件，用 search_documents → get_document（無障礙規範可直接填節號，如 805）。`;

const str = (description) => ({ type: "string", description });
const RO = { readOnlyHint: true, openWorldHint: false };

// 回答前要上網補查一次：寫在工具輸出結尾，比只寫在總則裡有效
const WEB_TOOLS = new Set(["search_articles", "get_article", "search_rulings", "get_ruling", "search_minutes", "search_landuse", "search_ntpc_manual", "check_building", "check_change_of_use"]);
const WEB_NOTE = "（上網核對：依規則第 8 條，有上網工具時本題至少查一次官方網站；沒有就說明未能核對。）";
const TOOLS = [
  {
    name: "find_law", title: "找法規",
    description: "用名稱、簡稱或關鍵字找法規，回傳法規 ID、地區、類別與最新修正日。多個詞以空白分隔、全部要符合；寫縣市名（如 桃園市）就只找該縣市。簡稱如 建技、設計施工編、變使、室裝、危老、危老獎勵、都更條例、非都管制、無障礙規範。",
    inputSchema: { type: "object", properties: { query: str("法規名稱、簡稱或關鍵字，例如「桃園市 建築管理」"), region: str("限定地區：中央、臺北市、桃園市…（可省略）"), limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } }, required: ["query"] },
    annotations: { ...RO, title: "找法規" }, run: findLaw,
  },
  {
    name: "get_article", title: "讀條文",
    description: "讀取一部法規的指定條文全文（填 date 可查某日當時有效的條文），含章節位置、本條最近修正日、法規制定日與施行日註記、附表附圖官方連結、引用已刪除條文的警告，以及 openlawtw 連結。法規可用全名、ID 或簡稱；條號可寫 107、164-1、164之1、第一百零七條。",
    inputSchema: { type: "object", properties: { law: str("法規名稱、簡稱或 ID，例如「設計施工編」「D0070115」"), articles: { type: "array", items: { type: "string" }, description: "條號清單，例如 [\"107\", \"108\"]" }, date: str("選填：查某一天有效的條文（建照依掛號日適用當時法令），例如 2018-05-01 或 107.05.01；會附上那天的條文、施行區間與出處，只收中央法規、民國 90 年 4 月以後"), region: str("同名法規時限定地區（可省略）") }, required: ["law", "articles"] },
    annotations: { ...RO, title: "讀條文" }, run: getArticle,
  },
  {
    name: "list_articles", title: "章節目錄",
    description: "列出一部法規的章節與每一條的第一行，用來找出相關條文的位置。",
    inputSchema: { type: "object", properties: { law: str("法規名稱、簡稱或 ID"), region: str("限定地區（可省略）") }, required: ["law"] },
    annotations: { ...RO, title: "章節目錄" }, run: listArticles,
  },
  {
    name: "search_articles", title: "搜尋條文",
    description: "在條文全文中搜尋關鍵字（預設全部關鍵字都要出現），預設只搜中央法規。不知道規定在哪一部、哪一條時使用；搜到後再用 get_article 讀全文。沒結果時可改 any=true 或換同義詞（例：昇降機/電梯、容積/樓地板面積）。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字，例如 [\"緊急用昇降機\", \"避難層\"]" }, region: str("中央（預設）、桃園市…，逗號分隔；「全部」= 所有縣市"), law: str("限定法規，逗號分隔（名稱、簡稱或 ID）"), limit: { type: "integer", minimum: 1, maximum: 50, default: 15 }, any: { type: "boolean", default: false, description: "任一關鍵字符合即可" } }, required: ["keywords"] },
    annotations: { ...RO, title: "搜尋條文" }, run: searchArticles,
  },
  {
    name: "search_rulings", title: "搜尋函釋",
    description: "搜尋函釋：內政部國土管理署（原營建署）函釋，以及農業部（原農委會）就農業發展條例、農業用地興建農舍辦法、農業設施容許使用、農業使用證明等的解釋函／令（1,700 多則，來源農村發展及水土保持署農地及農舍法規檢索系統）。可依法規與條號篩選，或用關鍵字搜標題與全文，依日期新到舊。預設兩種都搜；關鍵字或法規涉及農舍、套繪、農地、農業設施等時，農業部函釋列在前面且不截短，其他問題農業部最多列 5 則（結果會提示還有幾則）。另收內政部地政司「地政法令彙編」解釋函（3,800 多則，土地法、土地登記規則、平均地權條例、非都市土地使用管制規則、耕地分割等）：關鍵字涉及分割、登記、地籍、編定等地政事項時列在最前面，其他問題最多列 3 則。另收臺北市解釋令函（source 填「臺北市」，第 3 級，只在關鍵字含臺北市或 source 指定時列出）、內政部消防署函釋（法令解釋與執法疑義 1,500 多則，source 填「消防署」；關鍵字涉及消防設備、檢修申報、防火管理、公共危險物品等時列在最前面），以及經濟部等部會函釋（source 填「部會」：經濟部中部辦公室工廠管理輔導法函釋彙編，收到 112 年 5 月，加上臺北市法規查詢系統轉載的部會函）。source 可限定「國土署」「農業部」「地政司」「消防署」「臺北市」或「部會」。每則會標出 ⛔ 已由哪一則函停止適用（全部或部分），以及 ⚠ 可能被停止適用、或早於所涉條文的修正日。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字（可省略）" }, law: str("限定法規（名稱、簡稱或 ID）"), article: str("限定條號，需搭配 law"), source: str("限定來源：國土署、農業部、地政司、消防署、臺北市、部會（經濟部等）或全部（可省略，預設全部）"), limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } } },
    annotations: { ...RO, title: "搜尋函釋" }, run: searchRulings,
  },
  {
    name: "get_ruling", title: "讀函釋",
    description: "讀取一則函釋全文（用 search_rulings 結果裡的 id），含字號、日期、涉及條文與停止適用／條文已修正警告，並列出本函引用的其他函：本庫有收的給 id，沒收的標「被引用但本庫未收錄」。",
    inputSchema: { type: "object", properties: { id: str("函釋 id，例如 13672；農業部函釋用 agri:6123；地政司函釋用 land:e0906838a9e2；臺北市用 taipei:FE400046；消防署用 nfa:ID；部會用 central:ID") }, required: ["id"] },
    annotations: { ...RO, title: "讀函釋" }, run: getRuling,
  },
  {
    name: "search_documents", title: "搜尋原文文件",
    description: "另會搜 openlawtw 收錄的法規附件全文（約 600 部法規、7,000 多頁官方附件：附表、附圖、書表、流程圖；掃描頁為 OCR，可能有誤字），可用 region 或 document 縮小範圍。搜尋沒有逐條條文的原文文件（官方 PDF／HTML）：建築物無障礙設施設計規範（依節號，如 805 機車停車位）、建築物耐震設計規範及解說、綠化／保水／節能／雨水貯留等綠建築技術規範、綠建材設計技術規範、電信設備技術規範，以及縣市的造價標準表、裁罰基準、審議原則等。無障礙尺寸（坡道、扶手、廁所、停車位、昇降機）一定要用這個查。也可查建築物使用類組及變更使用辦法的附表一（類組定義）、附表二（使用項目舉例，例如餐廳面積 300 ㎡ 分 B-3 或 G-3）、附表四（各類組檢討標準；document=\"變使\" section=\"附表四 B-3\"），另外也抽出文字的官方 PDF 附表：構造編第 17 條（樓地板活載重）、設計施工編 308-2／116-2／167-6／170／188／230／261／262／264 條完整條文、變使附表三（各類組使用強度與防火避難規定矩陣，依類組讀）與附表五、非都市土地使用管制規則附表一（各種使用地容許使用項目及許可使用細目，可依頁讀，或 section=\"附表一 丁種建築用地\" 依使用地類別讀）、附表一之一（海域用地）、附表二之二（變更開發計畫認定原則）、附表三（使用分區內各種使用地變更編定原則表）、原有合法建築物公共安全改善辦法附表一、二（依類組讀，如 section=\"附表一 B-3\"）、農舍辦法附表、毗連擴展計畫附表、公設多目標使用辦法附表（可依用地類別讀，如 section=\"附表 公園\"）、公共安全檢查簽證申報辦法附表、無障礙住宅附表、農業設施容許使用附表一至五、自來水用水設備標準附表（表格已依 PDF 表格線重排成「欄｜欄」，構造編第 17 條活載重表為 section=\"表\"；section 填表格第一欄的類別名稱會列出該類別的所有列；搜尋時關鍵字分散在同附表不同頁也會提示；只填 document 會列出該法規可讀的附表；身障停車位第 9 條等公報掃描附件未收，會給原檔連結）。這些是 PDF 抽出文字，引用前要請使用者開原檔核對。不給 keywords 會列出全部原文文件清單。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字，例如 [\"機車\", \"無障礙\"]" }, document: str("限定文件（名稱、簡稱或 ID，如「無障礙規範」）"), region: str("限定地區，逗號分隔（可省略）"), limit: { type: "integer", minimum: 1, maximum: 50, default: 10 }, any: { type: "boolean", default: false } }, required: [] },
    annotations: { ...RO, title: "搜尋原文文件" }, run: searchDocuments,
  },
  {
    name: "get_document", title: "讀原文文件",
    description: "法規附件（openlawtw 擷取的官方附件文字）也用本工具讀：section 填附表代號或附件標題，可加頁碼或篩選字，例如「附表一 H-2 → D-5」「附表二 第1頁」。讀原文文件的一節或一頁。無障礙設施設計規範可用節號（section：805、805.1、206.2.1）；其他文件用 PDF 頁碼（page）。法規的附表（已抽出文字者）也用本工具讀：document 填法規名稱，section 填附表代號，例如 section=\"附表二 B-3\"（變使附表二的類組）、\"附表一\"、\"第17條 表\"（構造編活載重表）、\"附表一 丁種建築用地\"（非都附表一，填表格第一欄的類別名稱會列出該類所有列），或加 page 指定附表頁碼；只填 document 會列出該法規的附表目錄。兩者都不填會列出目錄。會附官方原檔與 openlawtw 頁面連結。",
    inputSchema: { type: "object", properties: { document: str("文件名稱、簡稱或 ID，例如「無障礙規範」「內政部-GL000734」"), section: str("節號，例如 805 或 805.1（限有章節的文件）"), page: { type: "integer", minimum: 1, description: "PDF 頁碼" }, region: str("限定地區（可省略）") }, required: ["document"] },
    annotations: { ...RO, title: "讀原文文件" }, run: getDocument,
  },
  {
    name: "check_building", title: "建築法規求解器：這個量體要檢討哪些條文",
    description: "設計初期的初篩，不是合法判定。輸入類組、地上／地下層數、標準層面積（與選填的基地面積、高度、戶數等），依 63 條規則列出被觸發、要檢討的條文：是否應為防火構造、是否供公眾使用、防火時效、防火區劃、直通樓梯與安全梯、緊急昇降機、高層建築專章、停車與防空避難、無障礙（含無障礙廁所數量）、工廠類建築物第十四章（只限工業區、丁種建築用地）、容積與建蔽試算（基準容積、法定空地、陽臺梯廳與機電免計上限；非都市土地依使用地類別帶入上限）、綠建築、消防設備（依消防場所分類逐層判斷），以及指定桃園市時的桃園地方規定。每項附條號、本案數值與門檻、要求，以及人工挑選的國土署函釋與桃園決議。可分樓層填混合用途（uses）。標「需確認」的不是定論。條文在規則核對後又修正時會標 ⚠。問「幾層樓要不要 X」「這個規模要檢討什麼」時先用這個找出該查的條文，再用 get_article、search_rulings 查細節。容積與建蔽只做上限試算，不含容積獎勵、移轉；都市計畫內的上限要自己填或用 plan_area 查土管。",
    inputSchema: { type: "object", properties: { group: str("建築物使用類組，如 H-2（住宅）、G-2（辦公）、B-2（商場）、C-2（一般廠庫）"), floors: { type: "integer", minimum: 1, description: "地上層數" }, basements: { type: "integer", minimum: 0, description: "地下層數（預設 0）" }, typical_floor_area: { type: "number", description: "標準層（最大單層）樓地板面積 ㎡；各層不同時改填 floor_areas 或 uses 的 area" }, site_area: { type: "number", description: "基地面積 ㎡（選填；綠化、保水、高層、無障礙例外會用到）" }, height: { type: "number", description: "建築物高度 m（選填；不填以每層 3.3 m 估）" }, units: { type: "integer", description: "戶數（選填；五層以下集合住宅是否屬公共建築物）" }, far_floor_area: { type: "number", description: "容積樓地板面積 ㎡（選填；高層第 228 條、容積試算）" }, far_bonus: { type: "number", description: "容積獎勵＋容積移轉面積 ㎡（選填；填了以基準容積＋此數為允建容積比對）" }, parking_exclude: { type: "number", description: "法定停車計算要扣除的地上面積 ㎡（選填：室內停車空間、機電、屋突以外的不計部分等，依第 59 條說明一）" }, workshop_area: { type: "number", description: "作業廠房樓地板面積 ㎡（選填，工廠第十四章：附屬空間比例、裝卸位；不填以 C 類樓地板估）" }, road_width: { type: "number", description: "面前道路寬度 m（選填；第 164 條高度與陰影）" }, frontage: { type: "number", description: "基地臨接面前道路長度 m（選填；第 164 條陰影面積上限）" }, addition_area: { type: "number", description: "增建時：增建部分的停車計算面積 ㎡（選填；填了法定停車改依增建規則計算）" }, existing_area: { type: "number", description: "增建時：原有建築物的停車計算面積 ㎡（選填；未達免設門檻時與增建合併計算）" }, total_floor_area: { type: "number", description: "地上總樓地板面積 ㎡（選填；不填以標準層×層數估）" }, building_area: { type: "number", description: "建築面積 ㎡（選填；不填以標準層估）" }, basement_floor_area: { type: "number", description: "地下單層面積 ㎡（選填）" }, max_coverage: { type: "number", description: "法定建蔽率 %（選填；高層第 230 條）" }, max_far: { type: "number", description: "容積率上限 %（選填；填了會試算基準容積、免計上限；非都市土地填 land_use 可自動帶入）" }, zone: str("使用分區：住宅區（預設）、商業區、工業區…（選填；高層第 228 條、工廠類第十四章）"), land_use: str("非都市土地使用地類別（選填，如「丁種建築用地」「窯業用地」；工廠類第十四章適用範圍）"), urban_plan: { type: "boolean", description: "是否在都市計畫內（預設 true；影響法定停車）" }, fireproof: { type: "boolean", description: "填 false 表示打算做非防火構造（第 69 條要求防火構造時仍以防火構造檢討）" }, public_use: { type: "boolean", description: "是否供公眾使用（選填；不填依「供公眾使用建築物之範圍」推定）" }, uses: { type: "array", items: { type: "object", properties: { group: { type: "string" }, floors: { type: "string" }, area: { type: "number" } }, required: ["group", "floors"] }, description: "混合用途（選填）：各樓層的類組，可帶 area（該段每層面積），例如 [{\"group\":\"G-3\",\"floors\":\"1\",\"area\":400},{\"group\":\"H-2\",\"floors\":\"2-7\",\"area\":300}]；沒列到的樓層用 group" }, floor_areas: { type: "array", items: { type: "object", properties: { floors: { type: "string" }, area: { type: "number" } }, required: ["floors", "area"] }, description: "逐層面積（選填）：各樓層每層樓地板面積，例如 [{\"floors\":\"1\",\"area\":420},{\"floors\":\"2-9\",\"area\":350},{\"floors\":\"10\",\"area\":200}]；填了就逐層判斷（二座直通樓梯、消防栓、撒水、火警等看「任一層」的門檻），typical_floor_area 可省略" }, power_kw: { type: "number", description: "工廠用電（含電熱）千瓦（選填；判斷工廠是否供公眾使用）" }, industrial: str("C 類是「工廠」（預設）還是「倉庫」") , city: str("縣市（選填）：填「桃園市」才列桃園地方規定（綠化自治條例、特殊結構審查、都市設計審議）；填了 plan_area 也視為桃園市"), plan_area: str("桃園市都市計畫區（選填，如「青埔」「航空城」），會附上土管要點摘錄；搭配 zone_name 且沒填建蔽率、容積率時，會從土管自動帶入（標出處，要核對原檔）"), zone_name: str("使用分區名稱（選填，搭配 plan_area，如「第二種住宅區」）"), category: str("只詳列某一類（選填）：構造與防火、防火區劃與內裝、避難逃生、昇降設備、高層建築專章、一般設計、容積與建蔽試算、工廠類建築物、停車與防空、無障礙、綠建築與能源、消防設備、桃園地方規定") }, required: ["floors"] },
    annotations: { ...RO, title: "建築法規求解器" }, run: checkBuilding,
  },
  {
    name: "threshold_radar", title: "門檻雷達：加減一層或改面積會多出什麼要求",
    description: "和 check_building 同樣的輸入，回傳下一個門檻在哪：地上或地下加減樓層、標準層放大或縮小到下一個門檻時，哪些要求會多出、少掉或改變等級（例如 5 層加到 6 層會多出昇降機、安全梯、防空避難等）。用在量體還沒定、想知道「差一層差多少」的時候。同樣是初篩，不是合法判定。",
    inputSchema: { type: "object", properties: { group: str("建築物使用類組，如 H-2（住宅）、G-2（辦公）、B-2（商場）、C-2（一般廠庫）"), floors: { type: "integer", minimum: 1, description: "地上層數" }, basements: { type: "integer", minimum: 0, description: "地下層數（預設 0）" }, typical_floor_area: { type: "number", description: "標準層（最大單層）樓地板面積 ㎡；各層不同時改填 floor_areas 或 uses 的 area" }, site_area: { type: "number", description: "基地面積 ㎡（選填；綠化、保水、高層、無障礙例外會用到）" }, height: { type: "number", description: "建築物高度 m（選填；不填以每層 3.3 m 估）" }, units: { type: "integer", description: "戶數（選填；五層以下集合住宅是否屬公共建築物）" }, far_floor_area: { type: "number", description: "容積樓地板面積 ㎡（選填；高層第 228 條）" }, total_floor_area: { type: "number", description: "地上總樓地板面積 ㎡（選填；不填以標準層×層數估）" }, building_area: { type: "number", description: "建築面積 ㎡（選填；不填以標準層估）" }, basement_floor_area: { type: "number", description: "地下單層面積 ㎡（選填）" }, max_coverage: { type: "number", description: "法定建蔽率 %（選填；高層第 230 條）" }, max_far: { type: "number", description: "容積率上限 %（選填；填了會試算基準容積、免計上限；非都市土地填 land_use 可自動帶入）" }, zone: str("使用分區：住宅區（預設）、商業區、工業區…（選填；高層第 228 條、工廠類第十四章）"), land_use: str("非都市土地使用地類別（選填，如「丁種建築用地」「窯業用地」；工廠類第十四章適用範圍）"), urban_plan: { type: "boolean", description: "是否在都市計畫內（預設 true；影響法定停車）" }, fireproof: { type: "boolean", description: "填 false 表示打算做非防火構造（第 69 條要求防火構造時仍以防火構造檢討）" }, public_use: { type: "boolean", description: "是否供公眾使用（選填；不填依「供公眾使用建築物之範圍」推定）" }, uses: { type: "array", items: { type: "object", properties: { group: { type: "string" }, floors: { type: "string" }, area: { type: "number" } }, required: ["group", "floors"] }, description: "混合用途（選填）：各樓層的類組，可帶 area（該段每層面積），例如 [{\"group\":\"G-3\",\"floors\":\"1\",\"area\":400},{\"group\":\"H-2\",\"floors\":\"2-7\",\"area\":300}]；沒列到的樓層用 group" }, floor_areas: { type: "array", items: { type: "object", properties: { floors: { type: "string" }, area: { type: "number" } }, required: ["floors", "area"] }, description: "逐層面積（選填）：各樓層每層樓地板面積，例如 [{\"floors\":\"1\",\"area\":420},{\"floors\":\"2-9\",\"area\":350},{\"floors\":\"10\",\"area\":200}]；填了就逐層判斷（二座直通樓梯、消防栓、撒水、火警等看「任一層」的門檻），typical_floor_area 可省略" }, power_kw: { type: "number", description: "工廠用電（含電熱）千瓦（選填；判斷工廠是否供公眾使用）" }, industrial: str("C 類是「工廠」（預設）還是「倉庫」") , city: str("縣市（選填）：填「桃園市」才列桃園地方規定（綠化自治條例、特殊結構審查、都市設計審議）；填了 plan_area 也視為桃園市"), plan_area: str("桃園市都市計畫區（選填，如「青埔」「航空城」），會附上土管要點摘錄；搭配 zone_name 且沒填建蔽率、容積率時，會從土管自動帶入（標出處，要核對原檔）"), zone_name: str("使用分區名稱（選填，搭配 plan_area，如「第二種住宅區」）") }, required: ["floors"] },
    annotations: { ...RO, title: "門檻雷達" }, run: thresholdRadar,
  },
  {
    name: "check_change_of_use", title: "變更使用類組：要檢討哪些項目",
    description: "建築物變更使用類組的初篩：依「建築物使用類組及變更使用辦法」附表三（變更使用原則表）判斷原類組→新類組的符號（☆／△／※／○／◎），列出附表四該類組各檢討項目的標準；停車空間自動判斷是否免檢討，無障礙依原建照申請日判斷；另列第 5 條局部變更、第 6 條主從用途（附表五）、第 7 條、第 8 條。填 area（變更範圍面積）與 floors 時，附上求解器對變更後類組的門檻。city 填桃園市時，另列「桃園市一定規模以下建築物免辦理變更使用執照管理辦法」。填 zone 會檢核使用分區能否作此用途：桃園市都市計畫區依都市計畫法桃園市施行細則（住宅區第 14、15 條、商業區第 16 條、乙種工業區第 17 條等；禁止者判「不能變更」），非都市土地填使用地類別會列非都市土地使用管制規則附表一的對應細目。另判斷變更後是否為公共建築物（設計施工編第 170 條，決定無障礙怎麼檢討），並比較變更前後的消防場所分類與新增要設的消防設備。類組以原領使用執照登載的為準；這是初篩，不是主管機關認定。",
    inputSchema: { type: "object", properties: { from_group: str("原領使用執照的使用類組，如 H-2"), to_group: str("變更後的使用類組，如 G-3"), area: { type: "number", description: "變更範圍樓地板面積 ㎡（選填；停車試算、求解器門檻）" }, floors: { type: "integer", minimum: 1, description: "建築物地上層數（選填）" }, floor: str("變更範圍所在樓層（選填，如 2F、B1）：填了會以「該層改新類組、其他層維持原類組」跑求解器"), floor_area: { type: "number", description: "變更所在樓層的樓地板面積 ㎡（選填；預設等於 area，局部變更時填整層面積較準）" }, whole_floor: { type: "boolean", description: "是否整層變更（預設 true；false 會列第 5 條局部變更的區劃條件）" }, permit_date: str("原建造執照申請日期（選填，如 2010-05-01 或 99.05.01；判斷無障礙）"), zone: str("使用分區或使用地（選填）：如 住宅區、商業區、乙種工業區、農業區，或非都市土地的 甲種建築用地、丁種建築用地；檢核容許使用與第 7 條區劃"), main_group: str("同一使用單元的主用途類組（選填；以附表五判斷 to_group 是否為其從屬用途）"), urban_plan: { type: "boolean", description: "是否在都市計畫內（預設 true；停車標準）" }, site_area: { type: "number", description: "基地面積 ㎡（選填）" }, city: str("縣市（選填）：填「桃園市」會依「一定規模以下免辦理變更使用執照管理辦法」附表一判斷能否免辦變使"), apply_date: str("申請日（選填，桃園：115.11.11 以前的案件適用修正前的免辦變使辦法）"), road_width: { type: "number", description: "面前道路寬度 m（選填；住宅區旅館、修車、金融、大型飲食店等的道路寬度但書）" }, units: { type: "integer", minimum: 1, description: "戶數（選填；H-2 五層以下 50 戶以上屬公共建築物）" }, use_item: str("變更後的使用項目（選填，如 餐廳、補習班、健身房；附表一 △、⑤ 的項目限制）"), standalone: { type: "boolean", description: "是否為獨棟或他棟建築物（選填；附表一 ④）" } }, required: ["from_group", "to_group"] },
    annotations: { ...RO, title: "變更使用檢討" }, run: checkChangeOfUse,
  },
  {
    name: "verify_citations", title: "核對回答裡的條號、修正日與函釋字號",
    description: "回答寫好、送出前用：把回答草稿全文放進 text，逐一核對裡面引用的條號是否存在、寫的條文修正日是否等於該條的最近修正日、函釋字號是否本庫有收、寫的發文日期對不對、函是否已被停止適用。回傳 ✗（寫錯）、⛔（引用了已停止適用的函卻沒註明）、？（本庫未收，無法核對）、✓（正確）。有 ✗ 或 ⛔ 要改正後再回答。只核對引用資訊，不判斷結論對不對。",
    inputSchema: { type: "object", properties: { text: str("回答草稿全文") }, required: ["text"] },
    annotations: { ...RO, title: "引用核對" }, run: verifyCitations,
  },
  {
    name: "search_ntpc_manual", title: "搜尋新北市建照業務工作手冊",
    description: "搜尋新北市政府工務局「建照業務工作手冊」（114年版，173 個案例：都市計畫、非都市土地、畸零地與法定空地、道路與現有巷道、容積、開放空間、停車、變更使用、室內裝修、山坡地、建管行政、農舍等）。新北市的案子、或問新北市實務怎麼認定時用。屬第 3 級（縣市主管建築機關的執行原則），只適用新北市；與條文或國土署函釋不一致時以條文與函釋為準。no 可直接讀單一案例全文（含附註）；不給參數列出章節。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字，例如 [\"陽臺\", \"容積\"]" }, no: str("案例編號，例如 05-03（讀全文）"), chapter: str("限定章節，例如「變更使用類」"), any: { type: "boolean", default: false }, limit: { type: "integer", minimum: 1, maximum: 30, default: 8 } } },
    annotations: { ...RO, title: "搜尋新北市建照業務工作手冊" }, run: searchNtpc,
  },
  {
    name: "search_minutes", title: "搜尋桃園市法規疑義會議紀錄",
    description: "搜尋桃園市政府建管單位（建築管理處、都市發展局、原工務局）「法規執行疑義研討會」「加速建照案審查修正意見暨疑義會議」等會議紀錄與公文，160 多份（民國 102 年起，轉載於桃園市建築師公會網站）。條文與國土署函釋沒有明確答案、要看桃園市實務怎麼認定時用（例如室內裝修、變更設計、預審、無障礙審查的執行細節）。屬只適用桃園市，不是法源；市府人員主持並作成決議者屬第 3 級（含多數「加速建照案審查修正意見暨疑義會議」），公會自行召開、市府只轉送者屬第 4 級；工具會標出主持人。部分是掃描頁經 OCR，引用前請開原檔核對。不給 keywords 會列出收錄範圍。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字，例如 [\"室內裝修\", \"現況測量圖\"]" }, year: { type: "integer", description: "只看某民國年（可省略）" }, limit: { type: "integer", minimum: 1, maximum: 30, default: 8 }, any: { type: "boolean", default: false } }, required: [] },
    annotations: { ...RO, title: "搜尋桃園市法規疑義會議紀錄" }, run: searchMinutes,
  },
  {
    name: "get_minutes", title: "讀桃園市會議紀錄",
    description: "讀一份桃園市法規疑義會議紀錄（id 來自 search_minutes）。不填 page 讀第 1 頁（公文封面，含發文機關、日期、字號）；填 page 讀指定頁全文。只適用桃園市；市府人員主持並作成決議者屬第 3 級（含多數「加速建照案審查修正意見暨疑義會議」），公會自行召開、市府只轉送者屬第 4 級；工具會標出主持人（見第 9、11 條）。",
    inputSchema: { type: "object", properties: { id: str("search_minutes 結果裡的 id（也可填標題關鍵字）"), page: { type: "integer", minimum: 1 } }, required: ["id"] },
    annotations: { ...RO, title: "讀桃園市會議紀錄" }, run: getMinutes,
  },
  {
    name: "landuse_points", title: "桃園市土管要點逐點彙整",
    description: "把一個桃園市都市計畫區所有土管要點公告，依「第N點」整理出每一點最新出現在哪一份公告，並標出個案變更。給 point（如「二十七」或 27）讀該點的最新條文與前一版，方便比對修正了什麼。用來避免只讀最早那份完整要點、漏掉後來的修正。這是自動整理的對照，不是官方的現行版本：同一計畫區有多個主要／細部計畫時，用 plan（公告標題關鍵字，如「高速公路北側」）或 kind（主要計畫／細部計畫）限定。",
    inputSchema: { type: "object", properties: { area: str("計畫區名稱或常用叫法，如「青埔」「航空城」「南崁」"), plan: str("公告標題關鍵字，用來限定某一個細部計畫（可省略）"), kind: str("主要計畫或細部計畫（可省略）"), point: str("點次，如「二十七」「27」「第二十七點」（可省略；省略時列出全部點次）") }, required: ["area"] },
    annotations: { ...RO, title: "桃園市土管要點逐點彙整" }, run: landusePoints,
  },
  {
    name: "search_landuse", title: "搜尋桃園市土管要點",
    description: "搜尋桃園市各都市計畫的土地使用分區管制要點（土管要點）全文：497 份、33 個計畫區（主要計畫與細部計畫，來源桃園市政府都市計畫書圖查詢）。建蔽率、容積率、退縮建築、開挖率、停車、建築高度、獎勵容積等都市計畫區的規定用這個查。area 可填計畫區名稱或常用叫法（如「青埔」「高鐵」「航空城」「南崁」「中壢平鎮」）；只給 area 不給 keywords 會列出該計畫區所有公告（新的在前），用來確認最新一次公告。結果附公告日期與文號，並標示同計畫區之後還有幾份公告。本庫不判斷哪份是現行版本；OCR 頁的數字可能有誤，引用前要開原檔核對。不給參數會列出收錄範圍。",
    inputSchema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, description: "關鍵字，例如 [\"退縮建築\"]、[\"住宅區\", \"容積率\"]" }, area: str("計畫區名稱或常用叫法（可省略），例如「高速鐵路桃園車站特定區計畫」「青埔」「林口」"), kind: str("主要計畫或細部計畫（可省略）"), limit: { type: "integer", minimum: 1, maximum: 30, default: 8 }, any: { type: "boolean", default: false } }, required: [] },
    annotations: { ...RO, title: "搜尋桃園市土管要點" }, run: searchLanduse,
  },
  {
    name: "get_landuse", title: "讀桃園市土管要點",
    description: "讀一份桃園市都市計畫土管要點（id 來自 search_landuse）。不填 page 讀全文（太長會分段），填 page 讀指定頁。附公告日期、文號、計畫書與公告原檔連結，並提示同計畫區之後是否還有較新的公告。",
    inputSchema: { type: "object", properties: { id: str("search_landuse 結果裡的 id（也可填標題關鍵字）"), page: { type: "integer", minimum: 1 } }, required: ["id"] },
    annotations: { ...RO, title: "讀桃園市土管要點" }, run: getLanduse,
  },
  {
    name: "check_conflicts", title: "法規衝突檢查",
    description: "檢查一部法規（或其中一條）的衝突與失效風險：條文引用了已刪除或不存在的條文、函告無效註記、相關函釋已被停止適用、函釋早於條文修正。結果為自動比對，引用前請開原文確認。",
    inputSchema: { type: "object", properties: { law: str("法規名稱、簡稱或 ID"), article: str("只檢查這一條（可省略）"), region: str("限定地區（可省略）") }, required: ["law"] },
    annotations: { ...RO, title: "法規衝突檢查" }, run: checkConflicts,
  },
  {
    name: "data_info", title: "資料版本",
    description: "openlawtw 資料版本、最近同步時間與收錄範圍。回答時可引用同步日期。",
    inputSchema: { type: "object", properties: {} },
    annotations: { ...RO, title: "資料版本" }, run: dataInfo,
  },
];

// ---------------------------------------------------------------- rate limit (best effort, per instance)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 60_000, max = Number(process.env.RATE_LIMIT_PER_MIN || 120);
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

// ---------------------------------------------------------------- JSON-RPC
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return "id" in (msg || {}) ? fail(msg.id, -32600, "Invalid Request") : null;
  }
  const isNotification = !("id" in msg);
  if (isNotification) return null;
  const { id, method, params = {} } = msg;
  switch (method) {
    case "initialize": {
      const v = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
      return ok(id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS.map(({ run, ...t }) => (SCHEMAS[t.name] ? { ...t, outputSchema: SCHEMAS[t.name] } : t)) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const args = { ...(params.arguments || {}) };
        const miss = (tool.inputSchema?.required || []).filter((k) => args[k] === undefined || args[k] === null || args[k] === "" || (Array.isArray(args[k]) && !args[k].length));
        if (miss.length) return ok(id, { content: [{ type: "text", text: `缺少必填參數：${miss.join("、")}。請補上後再呼叫 ${tool.name}。` }], isError: true });
        // 未定義的參數名（例如把 keywords 寫成 query）：不靜默忽略，回錯並列出可用參數
        const known = Object.keys(tool.inputSchema?.properties || {});
        const unknown = Object.keys(args).filter((k) => !known.includes(k));
        if (unknown.length) return ok(id, { content: [{ type: "text", text: `${tool.name} 沒有參數：${unknown.join("、")}。可用參數：${known.join("、")}。請改用正確的參數名再呼叫（關鍵字請放在 keywords，格式是陣列）。` }], isError: true });
        if (tool.name === "search_rulings" && !(args.keywords || []).length && !args.law) return ok(id, { content: [{ type: "text", text: "search_rulings 要給 keywords（關鍵字陣列）或 law（法規），否則會列出全庫最新的函釋、沒有意義。例：keywords=[\"緊急昇降機\", \"避難層\"]，或 law=\"設計施工編\" article=\"107\"。" }], isError: true });
        // 縣市名稱「台／臺」通用（臺北市、臺中市、臺南市、臺東縣）
        if (typeof args.region === "string") args.region = args.region.split(/[,，]/).map((r) => fold(r.trim())).join(",");
        let text = await tool.run(args);
        if (/^輸入不完整，無法檢討/.test(text)) return ok(id, { content: [{ type: "text", text }], isError: true });
        if (/^search_/.test(tool.name) && Array.isArray(args.keywords)) { const n = synNote(args.keywords); if (n) text += "\n" + n; }
        if (WEB_TOOLS.has(tool.name)) text += "\n" + WEB_NOTE;
        const sc = SCHEMAS[tool.name] ? (await structure(tool.name, args, text)) || {} : null; // 宣告了 outputSchema 就一定附 structuredContent
        return ok(id, { content: [{ type: "text", text }], ...(sc ? { structuredContent: sc } : {}), isError: false });
      } catch (e) {
        return ok(id, { content: [{ type: "text", text: `查詢失敗：${e.message}。請告訴使用者目前無法查詢，不要改憑記憶回答。` }], isError: true });
      }
    }
    case "resources/list": return ok(id, { resources: [] });
    case "prompts/list": return ok(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body !== "string" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!raw) { for await (const chunk of req) raw += chunk; }
  return JSON.parse(raw);
}

function send(res, status, body, extra = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE", "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization", "Access-Control-Expose-Headers": "Mcp-Session-Id", ...extra })) res.setHeader(k, v);
  if (body === undefined) return res.end();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204);
  if (req.method === "GET" || req.method === "DELETE") return send(res, 405, fail(null, -32000, "This server is stateless: use POST."), { Allow: "POST" });
  if (req.method !== "POST") return send(res, 405, fail(null, -32000, "Method not allowed"));
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  if (limited(ip)) return send(res, 429, fail(null, -32000, "Too many requests, slow down."), { "Retry-After": "30" });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, fail(null, -32700, "Parse error")); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handleMessage))).filter(Boolean);
    return out.length ? send(res, 200, out) : send(res, 202);
  }
  const out = await handleMessage(body);
  return out ? send(res, 200, out) : send(res, 202);
}

