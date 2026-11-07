# poi 破损动画遮挡

[English](README.md) | [简体中文](README.zh-CN.md) | [正體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md)

面向 **poi 12.0.1** 的舰队收藏插件。中破／大破立绘动画播放时，用不透明遮罩覆盖整个游戏画面，动画结束后自动恢复。遮挡期间，游戏动画和声音继续播放。

## 安装

打开 poi 的插件管理页面，输入以下包名并安装：

```text
poi-plugin-damage-shield
```

安装后启用插件。如果插件列表中没有显示，请重启 poi。

## 使用

1. 打开「破损动画遮挡」，等待显示「自动遮挡已就绪」，之后会自动遮挡破损动画。
2. 点击「测试遮挡（3 秒）」预览效果。游戏画面加载期间，测试按钮暂时不可用。
3. 使用「暂停自动遮挡」或「启用自动遮挡」控制自动遮挡，设置会保存。
4. 在「遮挡颜色」中选择颜色，立即生效并自动保存；点击「恢复默认颜色」可恢复默认深色。

## 语言

跟随 poi 的语言设置，支持简体中文、正體中文、日本語、English 和 한국어。

## 注意事项

- 仅遮挡游戏区域，poi 面板和桌面仍可正常查看。
- 不遮挡母港中持续显示的受损立绘或其他非破损动画。
- 游戏更新后可能需要更新插件。如遇问题，请在 [Issues](https://github.com/asparagusThief/poi-plugin-damage-shield/issues) 中提供 poi 版本、插件版本及插件页显示的状态。

[npm](https://www.npmjs.com/package/poi-plugin-damage-shield) · [MIT 许可证](LICENSE)
