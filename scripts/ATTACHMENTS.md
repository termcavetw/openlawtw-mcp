# lib/attachments.js

Text of official PDF attachments that openlawtw does not carry as text (currently 建築物使用類組及變更使用辦法 附表一、二、四).
Built with `pdftotext -layout` (poppler) from law.moj.gov.tw `LawGetFile.ashx?FileId=…`, NFC-normalised, split per 類組.
Each doc records fileId and sha256 of the PDF; `lawModified` is the law's 修正日 when extracted. The server warns when the live
law's modified date differs. To refresh: re-download the PDFs, re-extract, regenerate the file, update `lawModified`/`extractedAt`.
附表三（變更使用原則表）和附表五（主從用途關係表）是符號矩陣，抽出後欄位容易錯位，刻意不收。
