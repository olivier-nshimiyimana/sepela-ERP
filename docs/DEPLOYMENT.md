# Sepela ERP — deployment (Windows desktop)

This guide covers building the installable desktop app with a **license / EULA** step during setup and on first launch.

## What end users see

1. **Installer (NSIS `.exe` or MSI)** — A standard Windows wizard includes a **License Agreement** page. The user must accept to continue (text from `legal/EULA.txt`).
2. **First app launch** — If the EULA was not recorded in local settings (e.g. dev build), the app shows the same terms in-app before login.

Edit the legal text in **`legal/EULA.txt`** (English) and **`legal/EULA.fr.txt`** (French). Then run:

```bash
npm run legal:sync
```

That copies the text to `public/legal/`, `src-tauri/installer/`, and regenerates **`EULA.rtf`** (bilingual EN+FR) for the license page.

### Installer languages (French)

The NSIS setup (`-setup.exe`) includes **English** and **French**:

- At the start, users can pick a language (`displayLanguageSelector`).
- Wizard buttons and messages use the selected language (see `src-tauri/windows/languages/French.nsh`).
- The license page shows **both** English and French EULA text in one scrollable document.

MSI builds are produced for **en-US** and **fr-FR** when you run a full `build:installer`.

If `light.exe` fails with **LGHT0311** (characters not in code page 1252), run `npm run legal:sync` — the EULA RTF is sanitized for WiX. Avoid Unicode box-drawing or “smart” punctuation in `legal/EULA*.txt` unless you add a custom WiX UTF-8 locale.

When you change the legal text in a meaningful way, bump **`src/legal/license.js`** → `EULA_VERSION` so existing installs are prompted again.

## Prerequisites (Windows build machine)

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/)
- Visual Studio Build Tools with **Desktop development with C++**
- For **MSI** bundles: Windows **VBSCRIPT** optional feature enabled

## Build commands

```bash
npm install
npm run build:installer
```

Outputs (after a successful build):

| Artifact | Path |
|----------|------|
| NSIS setup | `src-tauri/target/release/bundle/nsis/Sepela ERP_*_x64-setup.exe` |
| MSI (optional) | `src-tauri/target/release/bundle/msi/` |

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run legal:sync` | Sync EULA → installer + web public |
| `npm run build:installer` | Sync legal, build frontend, run `tauri build` |
| `npm run build:win` | NSIS-only bundle (faster iteration) |

## Installer customization (`tauri.conf.json`)

Configured under `bundle`:

- **`licenseFile`** — `installer/EULA.rtf` (generated from `legal/EULA.txt`)
- **`copyright`**, **`shortDescription`**, **`longDescription`**
- **`windows.nsis.installMode`: `"both"`** — User can install for current user or all users (all-users needs Administrator)
- **`windows.nsis.startMenuFolder`** — Start menu group name
- **`windows.nsis.installerHooks`** — `src-tauri/windows/hooks.nsh` (registry markers after install)
- **`windows.webviewInstallMode`** — `embedBootstrapper` (~1.8 MB larger, better offline/WebView2 on older Windows)

See [Tauri — Windows installer](https://v2.tauri.app/distribute/windows-installer/) for signing, WebView2 offline mode, and code signing.

## Code signing (recommended for production)

Unsigned installers trigger SmartScreen warnings. For production:

1. Obtain a code-signing certificate.
2. Configure `bundle.windows.certificateThumbprint` or `signCommand` in `tauri.conf.json`.
3. See [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/).

## App identifier

The bundle identifier is **`com.sepela.erp`**. Changing it later registers as a **different** Windows app (separate install/uninstall entry). Keep it stable once you ship to customers.

## Portal + desktop together

Production (Render):

| Service | URL |
|---------|-----|
| Portal API | [https://sepela-erp-api.onrender.com](https://sepela-erp-api.onrender.com) |
| Portal admin | [https://sepela-erp-portal-admin.onrender.com/](https://sepela-erp-portal-admin.onrender.com/) |

The desktop app defaults to the production API URL when `VITE_PORTAL_API_URL` is not set (`src/config/portalDefaults.js`). Release builds load **`.env.production`**, which points at the Render API.

### Build desktop for production

1. Set the bearer token (same as `PORTAL_BEARER_TOKEN` on portal-api) in **`.env`** or your CI secret:
   ```
   VITE_PORTAL_API_TOKEN=your-portal-bearer-token
   ```
2. Sync legal text and build the installer:
   ```bash
   npm run legal:sync
   npm run build:installer
   ```

Operators can still override API URL/token in **Settings → Cloud sync** after install.

### Login error: « Impossible de joindre le portail… »

This usually means the **desktop app could not complete `/auth/login`** (often CORS), then fell back to offline cache which is **empty on first install**.

1. **Redeploy portal-api** on Render after pulling the latest code (desktop origins `http(s)://tauri.localhost` are allowed in `portal-api/src/server.ts`).
2. On Render, set `CORS_ORIGINS` to include at least:
   `https://sepela-erp-portal-admin.onrender.com,http://tauri.localhost,https://tauri.localhost,tauri://localhost`
3. Create the operator in **portal-admin** and use that username/password on first **online** login.
4. Confirm the installer was built with `VITE_PORTAL_API_TOKEN` matching Render `PORTAL_BEARER_TOKEN`.

### First launch — license language

On first launch, users pick **Français** (default) or **English** on the license screen. The **full EULA body** switches with that choice (`legal/EULA.fr.txt` vs `legal/EULA.txt`). UI labels (title, checkbox, Continue) use the same language. The choice is saved as the app language when they click **Continue**.

## Production security (webview hardening)

Release builds (`cargo build --release` / `npm run build:installer`) automatically:

- Keep **developer tools disabled** in release builds (Tauri default when the `devtools` Cargo feature is not enabled).
- Inject `src-tauri/scripts/production-harden.js` to block **right-click context menus** and shortcuts such as **F12**, **Ctrl+Shift+I/J/C**, and **Ctrl+U**.
- Apply the same rules in the frontend via `src/security/hardenUi.js` when `import.meta.env.PROD` is true.

Do **not** add the `devtools` feature to `src-tauri/Cargo.toml` unless you intentionally need the inspector API in release builds.

`npm run tauri dev` (debug) keeps devtools available for development.

## Checklist before shipping

- [ ] Update `legal/EULA.txt` and run `npm run legal:sync`
- [ ] Bump app `version` in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
- [ ] `npm run build:installer` on a clean Windows CI or build PC
- [ ] Test installer: license page → install → first launch → login
- [ ] Sign the installer (production)
- [ ] Distribute portal activation codes per merchant/device
