# poi 破損動畫遮擋

[English](README.md) | [简体中文](README.zh-CN.md) | [正體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md)

適用於 **poi 12.0.1** 的艦隊收藏外掛。艦船中破／大破立繪動畫播放時，以不透明黑幕覆蓋整個遊戲區域；動畫及結尾的白色淡出消失後，自動恢復畫面。遮擋期間，遊戲動畫和音效會繼續播放。

已通過自動測試及使用實際 PIXI Canvas／WebGL 渲染器進行的像素檢查，使用者也已確認在 **poi 12.0.1 的線上戰鬥中可正常自動觸發**。

## 安裝

### 透過外掛名稱安裝

開啟 poi 的外掛管理頁面，在安裝輸入欄位填入以下套件名稱並安裝：

```text
poi-plugin-damage-shield
```

安裝後啟用外掛。如果沒有立即顯示，請重新啟動 poi，在外掛清單中找到「破損動畫遮擋」。外掛使用 poi 內附的 React 和翻譯函式庫，不需要額外安裝執行階段相依套件或編譯。

### 從原始碼或本機安裝套件安裝

在原始碼目錄執行，安裝到目前 Windows 使用者的 poi 資料目錄：

```powershell
& .\scripts\install-local.ps1
```

安裝指令碼會建立 `%APPDATA%\poi\plugins-extra\node_modules\poi-plugin-damage-shield`，並複製外掛、翻譯及各語言 README。若目標已存在，會停止以避免覆寫現有安裝。完成後請重新啟動 poi。

也可以透過 poi 的本機外掛安裝功能，安裝以 `npm.cmd run pack:local` 產生的 `.tgz` 檔案。請擇一安裝。

## 使用方式

1. 開啟「破損動畫遮擋」外掛頁面。遊戲尚未就緒時會顯示載入狀態，外掛會自動連接遊戲畫面。
2. 出現「自動遮擋已就緒」後，中破／大破動畫會自動受到遮擋，無須額外操作。
3. 點選「測試黑幕（3 秒）」可預覽效果。在連接到第一個遊戲畫面之前，測試按鈕暫時無法使用。
4. 中破／大破立繪動畫及結尾淡出結束後，遊戲畫面會自動恢復。外掛頁面會顯示本次遊戲載入以來偵測到的破損動畫次數。

自動遮擋預設開啟。「暫停自動遮擋」可暫時關閉並儲存設定；點選「啟用自動遮擋」可重新開啟。停用或解除安裝外掛會移除頁面遮罩及外掛自身的渲染監聽。

啟動時會直接連接已就緒的遊戲影格，不必等待整個 DMM 頁面及其他子頁面完成載入。等待期間每 250 毫秒檢查一次，遊戲頁面參照或載入狀態改變時立即重試；就緒後每秒更新一次狀態。遊戲引擎及第一個遊戲畫面仍須完成本身的載入。

## 語言

外掛介面會跟隨 poi 的語言設定，支援簡體中文、正體中文、日本語、English 和 한국어。外掛名稱、說明、按鈕、狀態訊息及黑幕文字均提供翻譯，無須在外掛中另外選擇語言。

切換 poi 語言後，目前狀態及正在顯示的黑幕會立即更新文字。安裝新增翻譯檔案的更新後，請重新載入外掛或重新啟動 poi。介面翻譯位於 `i18n/`，缺少的翻譯會使用英文預設文字。README 語言可透過本文頂端的連結切換。

## 遮擋範圍

- 覆蓋整個遊戲畫面，不覆蓋 poi 的外掛面板或作業系統桌面。
- 依照遊戲 Canvas 的渲染內容判斷動畫起訖，不透過戰鬥 API 估算播放時間。
- 遊戲原本的渲染及音效會繼續執行；僅在輸出畫布加上不透明繪製，並覆蓋遊戲頁面。
- 也會遮擋使用相同演出結構的敵方特殊破損立繪。
- 不遮擋母港中持續顯示的受損立繪，也不處理其他非破損動畫。
- 透過 poi 目前的遊戲 webview 參照，重新連接重新整理後的頁面及遊戲獨立視窗。視窗切換的宿主邏輯已測試，實際 poi 視窗切換仍待實機確認。

## 辨識機制與限制

動畫辨識依據公開的艦 C 用戶端 **6.3.6.0** 分析指令碼中 `TaskDamageCutin`／`TaskEnemyDamageCutin` 的容器結構，以及 `battle_cutin_damage_100` 紋理。監聽安裝於遊戲頁面的主 JavaScript 執行環境中，在渲染前辨識破損演出，並於原始渲染完成後、同一次 JavaScript 呼叫結束前覆蓋畫布，因此原始 Canvas 截圖也會受到遮擋。結尾的白色淡出會依實際場景物件是否存在來追蹤，不使用固定動畫時長。

若遊戲更新改變容器欄位、紋理名稱或渲染引擎，可能需要更新相容性。「自動遮擋已就緒」表示目前遊戲畫面的偵測正在執行。回報問題時，請提供 poi 版本、遊戲版本、外掛頁面狀態，以及當時是否使用遊戲獨立視窗。

外掛不修改 poi 安裝檔案或遊戲指令碼檔案，不傳送遊戲請求、不執行遊戲操作，也不上傳帳號資訊。

## 開發與檢查

開發檢查需要 Node.js 20 或更新版本：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
New-Item -ItemType Directory -Path dist -Force
npm.cmd run pack:local
```

`index.js` 是 poi 外掛入口；`src/controller.js` 管理 webview 與生命週期；`src/game-shield.js` 包含可序列化的遊戲頁面注入邏輯；`src/i18n.js` 連接 poi 翻譯資源並提供預設文字。開發相依套件中的 i18next 僅供測試，不會作為外掛執行階段相依套件安裝。

## 參考資料與授權

- [npm 套件](https://www.npmjs.com/package/poi-plugin-damage-shield)
- [原始碼與問題回報](https://github.com/asparagusThief/poi-plugin-damage-shield)
- [poi 12.0.1](https://github.com/poooi/poi/releases/tag/v12.0.1)
- [poi 遊戲畫面宿主](https://github.com/poooi/poi/blob/master/views/kan-game-wrapper.tsx)
- [公開用戶端分析指令碼](https://github.com/kcwiki/kancolle-main)

採用 [MIT 授權條款](LICENSE)。
