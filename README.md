# Damage Animation Shield for poi

[English](README.md) | [简体中文](README.zh-CN.md) | [正體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md)

A KanColle plugin for **poi 12.0.1**. Covers the entire game area with a black overlay during medium and heavy damage cut-in animations, then restores the screen automatically. Animations and audio continue while the overlay is visible.

## Installation

Open poi's plugin management page and install:

```text
poi-plugin-damage-shield
```

Enable the plugin after installation. Restart poi if it does not appear in the plugin list.

## Usage

1. Open **Damage Animation Shield** and wait for **Automatic shielding is ready**. Damage cut-ins will then be covered automatically.
2. Click **Test blackout (3 seconds)** to preview the overlay. The button is unavailable while the game screen is loading.
3. Use **Pause automatic shielding** or **Enable automatic shielding** to control automatic coverage. Your setting is saved.

## Languages

Follows poi's language setting: Simplified Chinese, Traditional Chinese, Japanese, English, and Korean.

## Notes

- Covers only the game area; poi panels and the desktop remain visible.
- Persistent damaged artwork in the home port and unrelated animations are not covered.
- Game updates may require a plugin update. For problems, [open an issue](https://github.com/asparagusThief/poi-plugin-damage-shield/issues) with your poi version, plugin version, and the status shown in the plugin panel.

[npm](https://www.npmjs.com/package/poi-plugin-damage-shield) · [MIT License](LICENSE)
