# 扶輪公益網 AI 助手 —— Windows 專屬桌面正式版 v2.0

本目錄為專為 Windows 桌面環境打造的 **輕量化獨立應用程式（基於 Python 3.11 + pywebview + Microsoft Edge WebView2 引擎）**。
整合 Google Apps Script (GAS) 雲端流水線、Google Drive 相片庫與 17rcn.org 扶輪公益網官方平台，提供高效率、全自動跨視窗刊登體驗。

---

## 🌟 核心架構與功能亮點

1. **雙視窗智慧並排架構 (Dual Window Architecture)**：
   * **視窗 A：【控制工作台】**（左側）—— 採集外勤物資、即時同步雲端佇列、審核待刊物資、空間維護與偏好設定。
   * **視窗 B：【扶輪公益網 (17rcn.org)】**（右側）—— 原生微軟 Edge WebView2 瀏覽器視窗，預設載入 `https://17rcn.org/member/` 會員中心，檢測登入狀態且不迷航。
   * **螢幕解析度自適應**：自動偵測 Windows 桌面解析度與 DPI 縮放，計算零重疊並排座標，避開工作列。

2. **四大核心分頁 (比照手機 App 與置底導航列)**：
   * 📸 **拍照採集**：支援相片拖曳放置 (Drag & Drop)、剪貼簿直接貼上 (`Ctrl+V`)、瀏覽器前端 Canvas 極速壓圖 (1280px / 85% JPEG)、備援地址與現況備註，一鍵直傳 GAS 並寫入 Google Drive。
   * 📋 **物資佇列**：即時讀取試算表待刊物資，縮圖點擊燈箱大圖、多同仁協同防搶登「刊登中」琥珀金互鎖、一秒解除鎖定、10 秒冷卻重新辨識、略過與刪除。
   * ⏳ **待處理**：展示「AI 辨識中」（Gemini 視覺模型分析中）與「已略過」暫存卡片，支援一鍵復原回待刊佇列。
   * ⚙️ **偏好設定**：配置 GAS 部署網址、預設備援取件地址、志工暱稱、**相片背景提早預載開關（秒級加速）**，並提供「雲端硬碟防爆空間清理工具」（一鍵清理已刊登/已略過圖檔與試算表列）。

3. **⚠️ 智慧動態「🔄 刷新」按鈕**：
   * **只在切換到「物資佇列」分頁時才於頂部 Header 出現**；
   * 切換到「拍照採集」、「待處理」、「偏好設定」時會自動隱藏，避免誤觸或多餘請求；
   * 切換到佇列時若無資料或距離上次整理超過 30 秒，自動背景靜默同步。

4. **⚡ 智慧滑動視窗背景預載 (Smart Pre-fetching)**：
   * 佇列載入後，Python 單線程背景守護工作將在閒置時自動將**前 2 筆物資照片**預先下載並儲存至 `./data/img_cache/` 本機磁碟；
   * 志工點擊「🚀 一鍵帶入」時達到 **0.2 秒瞬間填表與掛載相片**，告別等待感；
   * 內建磁碟排重與頻寬保護機制，並可在「偏好設定」中**自由開啟或關閉**（適合行動熱點省流量）。

5. **一鍵跨視窗智慧注入流水線 (One-Click Injection Pipeline)**：
   * 點擊「🚀 一鍵帶入此筆 (含照片)」：
     1. 自動釋放先前鎖定的其他列；
     2. 向後端搶鎖當前列，避免同仁重複刊登；
     3. 視窗 B 若不在刊登頁，自動切換至 `goods_add.php` 並等待載入；
     4. 背景預載 1~3 張相片 Base64（本機 MD5 快取 + GAS 代理下載，避開 Google Drive 權限阻擋）；
     5. DOM 欄位填寫：品名、數量、單價、新舊（全新/二手）、媒合期限（90天）、索取方式（自取）；
     6. 地址 twzipcode 縣市/鄉鎮市區自動拆解與連動穿透；
     7. 一二級分類 AJAX 異步輪詢匹配；
     8. KindEditor 富文本內容三重注入（實例同步 + iframe DOM + textarea）；
     9. 相片利用 `DataTransfer` 模擬原生 File API 注入 `#photo1~3`；
     10. 顯示浮動橫幅提醒輸入驗證碼，游標自動聚焦至驗證碼輸入框；
     11. 監聽 iframe 提交結果與錯誤警示（排除驗證碼錯誤等偽成功），確認刊登後自動通知工作台淡出卡片並回寫試算表！

5. **專屬獨立 Profile 隔離 (Data Isolation)**：
   * 17rcn.org 登入 Session 與 Cookie 永久保存在 `./data/profile/`。
   * 完全不接觸、不污染使用者個人日常的 Chrome / Edge 瀏覽器設定檔。

---

## 🚀 執行方式

在 Windows 檔案總管進入本目錄：

1. **直接執行（免打包）**：
   * 雙擊 **`run.bat`** 即可自動檢測環境並啟動應用程式。
   * 若需透過終端機執行：
     ```cmd
     python main.py
     ```

2. **打包為獨立 EXE 執行檔（可攜式）**：
   * 雙擊 **`build_exe.bat`**
   * 自動透過 PyInstaller 將程式打包為獨立資料夾版本，產生的執行檔位於：
     `dist\RCNAssistant\RCNAssistant.exe`
   * 可將此資料夾複製到任何 Windows 電腦直接執行，免安裝 Python！

---

## 📁 檔案結構說明

```
02_Windows專屬桌面App/
├── run.bat                     # Windows 一鍵啟動腳本 (純 ASCII 編碼，防止 CP950 閃退)
├── build_exe.bat               # Windows 一鍵打包 PyInstaller EXE 腳本
├── main.py                     # 主程式控制器 (螢幕檢測排版、雙視窗建立、ApiBridge)
├── requirements.txt            # Python 依賴清單 (pywebview, requests)
├── config.json                 # 本機偏好設定 (首次啟動自動建立)
├── core/
│   ├── config_manager.py       # 設定檔管理器
│   ├── gas_client.py           # Google Apps Script 雲端通訊用戶端 (含相片快取)
│   └── injector.py             # 17rcn 網頁智慧填表、相片注入與提交監聽腳本產生器
├── data/
│   ├── profile/                # WebView2 獨立使用者設定檔 (保存 17rcn 登入狀態)
│   └── img_cache/              # 物資相片 MD5 本機磁碟快取
└── ui/
    ├── index.html              # 工作台 HTML (4 大分頁、底部導航列、燈箱、Modal)
    ├── style.css               # 視覺設計樣式 (扶輪海軍藍/綠寶石/琥珀金主題)
    ├── app.js                  # 前端控制核心 (pywebview API 連線、Canvas 壓圖、狀態管理)
    └── mock_data.js            # 離線獨立瀏覽器預覽備援資料庫
```
