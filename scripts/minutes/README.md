# 桃園市法規執行疑義會議紀錄：產生 lib/minutes.js 的腳本（交接用）

這些是 2026-11-23 第一次建立 `lib/minutes.js` 時用的一次性腳本，原本在暫存環境（/tmp/tyaa）執行，路徑寫死，**不能直接跑**，只供 openlawtw 主 repo 改寫成每週同步時參考。

## 來源
- 列表頁：https://www.tyaa.org.tw/listFiles.php?Id=665f644e43731ff9db3d341da5c827e1
- 清單：POST https://www.tyaa.org.tw/ajax/listFiles.php（Id=上面那串、keyword=空白）→ JSON 的 `html` 欄位
- 下載：https://old.tyaa.org.tw/dl_file.php?id=<數字>

## 流程
1. 下載全部 PDF 到 `pdf/<id>.pdf`；`pdftotext` 存 `txt/<id>.txt`（頁間以 \f 分隔）。
2. `ocr_run.py <worker> <總worker數>`：逐頁處理，原生文字 ≥120 字直接用，否則 pdftoppm 200 dpi → tesseract chi_tra --psm 6。結果存 `pages/<id>_<頁>.txt`。
3. `build_min.py <輸出路徑>`：組成 `lib/minutes.js`。解析封面的發文機關／日期／字號（抓不到留空）、sortDate、刪中文字間空白；並合併下面的手動資料。

## 手動資料（rar 檔，程式抓不到）
公會網站 id 790、703、710 是 rar。使用者另外上傳了掃描 PDF，用 `ocr_manual.py`（同樣參數）OCR 後，在 `build_min.py` 的 `EXTRA` 清單裡以固定 metadata 併入：
- `790`：106年第2次建築法規執行疑義研討會（106.5.31）
- `703`：105年第4次建築法規執行疑義研討會
- `703x`：同次臨時提案第2案決議修正函（105.8.1）
- `703y`：保護區原有合法建築物認定原則函（105.8.10）
- `710`：105年度第1、2次使用管理研討會（105.7.14 函送）
- `710a`：同次會議附件（掃描品質差，無發文機關）

這幾份的 OCR 文字**只存在 `lib/minutes.js` 裡**（原掃描檔不在 repo），改寫同步時請從 `lib/minutes.js` 取出這 6 個 item 另存成手動資料，不要被自動同步覆蓋。

## 已 OCR 的文字可以直接沿用
`lib/minutes.js` 裡 2,404 頁的文字都已處理好（`pages[].ocr` 標示是否 OCR）。第一次建庫可以直接沿用，不必全部重新 OCR（全部重跑在 2 核心機器上要好幾個小時）；之後只對新檔做 OCR。
