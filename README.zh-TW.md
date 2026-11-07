# poi 破損動畫遮擋

[English](README.md) | [简体中文](README.zh-CN.md) | [正體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md)

適用於 **poi 12.0.1** 的艦隊收藏外掛。中破／大破立繪動畫播放時，以不透明遮罩覆蓋整個遊戲畫面，動畫結束後自動恢復。遮擋期間，遊戲動畫和音效會繼續播放。

## 安裝

開啟 poi 的外掛管理頁面，輸入以下套件名稱並安裝：

```text
poi-plugin-damage-shield
```

安裝後啟用外掛。如果外掛清單中沒有顯示，請重新啟動 poi。

## 使用方式

1. 開啟「破損動畫遮擋」，等待顯示「自動遮擋已就緒」，之後會自動遮擋破損動畫。
2. 點選「測試遮擋（3 秒）」預覽效果。遊戲畫面載入期間，測試按鈕暫時無法使用。
3. 使用「暫停自動遮擋」或「啟用自動遮擋」控制自動遮擋，設定會儲存。
4. 在「遮擋顏色」中選擇顏色，立即生效並自動儲存；點選「恢復預設顏色」可還原預設深色。

## 語言

跟隨 poi 的語言設定，支援簡體中文、正體中文、日本語、English 和 한국어。

## 注意事項

- 僅遮擋遊戲區域，poi 面板及桌面仍可正常查看。
- 不遮擋母港中持續顯示的受損立繪或其他非破損動畫。
- 遊戲更新後可能需要更新外掛。如遇問題，請在 [Issues](https://github.com/asparagusThief/poi-plugin-damage-shield/issues) 中提供 poi 版本、外掛版本及外掛頁面顯示的狀態。

[npm](https://www.npmjs.com/package/poi-plugin-damage-shield) · [MIT 授權條款](LICENSE)
