# Damage Animation Shield for poi

[English](README.md) | [简体中文](README.zh-CN.md) | [正體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md)

A plugin for **poi 12.0.1** that covers the entire KanColle game area with an opaque black overlay during medium and heavy damage cut-in animations. The game screen returns automatically after the animation and its ending white fade have disappeared. Game animations and audio continue while the overlay is visible.

The plugin has passed automated tests and pixel checks with real PIXI Canvas/WebGL renderers. Automatic triggering has also been confirmed in **live battles on poi 12.0.1**.

## Installation

### Install by package name

Open poi's plugin management page, enter the following package name in the installation field, and install it:

```text
poi-plugin-damage-shield
```

Enable the plugin after installation. If it does not appear immediately, restart poi and look for **Damage Animation Shield** in the plugin list. The plugin uses React and translation libraries bundled with poi; no extra runtime dependencies or build step are required.

### Install from source or a local package

From the source directory, install into the current Windows user's poi data directory:

```powershell
& .\scripts\install-local.ps1
```

The script creates `%APPDATA%\poi\plugins-extra\node_modules\poi-plugin-damage-shield` and copies the plugin files, including translations and all README languages. It stops if the destination already exists to avoid overwriting an existing installation. Restart poi afterward.

Alternatively, use poi's local package installation option to install a `.tgz` archive built with `npm.cmd run pack:local`. Choose one installation method.

## Usage

1. Open the **Damage Animation Shield** plugin panel. While the game is loading, the plugin shows a loading status and connects automatically.
2. Once **Automatic shielding is ready** appears, damage cut-in animations are covered automatically.
3. Click **Test blackout (3 seconds)** to preview the overlay. This button stays disabled until the first game frame is available.
4. The screen returns automatically after the damage cut-in and its ending fade. The panel shows the number of damage animations detected since the game last loaded.

Automatic shielding is enabled by default. **Pause automatic shielding** temporarily turns it off and saves that setting; **Enable automatic shielding** turns it back on. Disabling or uninstalling the plugin removes its overlay and rendering hooks.

At startup, the plugin connects to ready game frames without waiting for the entire DMM page and other frames to finish loading. It checks every 250 ms while waiting, retries immediately when the game view or loading state changes, and updates status once per second after becoming ready. The game engine and first game frame still need to load.

## Languages

The interface follows poi's language setting and supports Simplified Chinese, Traditional Chinese, Japanese, English, and Korean. The plugin name, description, buttons, status messages, and overlay text are translated; no separate language selection is needed in the plugin.

Changing poi's language updates the current status and any visible overlay immediately. Reload the plugin or restart poi after installing an update that adds translation files. Interface translations are stored in `i18n/`, with English defaults for missing translations. Use the links at the top of this document to select a README language.

## Coverage

- Covers the entire game area, leaving poi's plugin panels and the operating system desktop visible.
- Detects animation boundaries from the game's Canvas rendering rather than estimating timing from battle API responses.
- Lets the game's rendering and audio continue; adds an opaque layer to the output canvas and covers the game page.
- Also covers enemy damage cut-ins that use the same animation structure.
- Does not cover persistent damaged artwork in the home port or unrelated animations.
- Reconnects through poi's current game webview after a refresh or a switch to the separate game window. Host-side window switching logic is tested; switching windows in a running poi instance still needs user verification.

## Detection and limitations

Detection is based on the `TaskDamageCutin` / `TaskEnemyDamageCutin` container structures and the `battle_cutin_damage_100` texture in public analysis of KanColle client **6.3.6.0**. Hooks run in the game page's main JavaScript context. They identify damage cut-ins before rendering, then cover the output canvas after the original rendering finishes, within the same JavaScript call. Raw Canvas screenshots are therefore covered as well. The ending white fade is tracked through the actual scene objects, without assuming a fixed animation duration.

Game updates that change container fields, texture names, or the rendering engine may require a compatibility update. **Automatic shielding is ready** means detection is running for the current game view. When reporting a problem, include your poi version, game version, plugin status, and whether you were using the separate game window.

The plugin does not modify poi installation files or game script files, send game requests, perform game actions, or upload account information.

## Development and checks

Use Node.js 20 or newer for development checks:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
New-Item -ItemType Directory -Path dist -Force
npm.cmd run pack:local
```

`index.js` is the poi entry point; `src/controller.js` manages the webview and lifecycle; `src/game-shield.js` contains the serializable game-page injection logic; `src/i18n.js` connects to poi's translation resources and supplies default text. The i18next development dependency is used only for tests and is not installed as a runtime dependency.

## References and license

- [npm package](https://www.npmjs.com/package/poi-plugin-damage-shield)
- [Source code and issue reports](https://github.com/asparagusThief/poi-plugin-damage-shield)
- [poi 12.0.1](https://github.com/poooi/poi/releases/tag/v12.0.1)
- [poi game view host](https://github.com/poooi/poi/blob/master/views/kan-game-wrapper.tsx)
- [Public client analysis](https://github.com/kcwiki/kancolle-main)

Released under the [MIT License](LICENSE).
