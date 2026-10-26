# Paisa Diary (formerly "Your Ledger") — Phone version (project notes)
Owner: Sundram (Sundram Corp.). Phone-only, fully offline. No laptop copy.

## What it is
Vanilla JS app (no bundler) wrapped by Capacitor for Android. Derived from the Windows "Your Ledger" (Tauri) app.
- www/app.js       — whole app (UI, encryption, accounts, transactions, reminders). Global `state`, `render()`.
- www/shim.js      — replaces the Tauri backend: vault in IndexedDB, share-sheet saving for backups, daily 9 PM notification, locks after 60s in background.
- www/mobile.js    — starter accounts (Union Bank-Dadi, Axis-Daddy, Hdfc-Mummy, Yes-Neetu, Cash) + import of the user's "Expenses Sheet" Excel layout (month sheets, income C-F, expenses I-L from row 11, year from K2).
- www/wipe.js      — emergency wipe password: second password checked on the lock screen before the real one; match = erase vault+wipe config and reload to first-time setup. Stored as PBKDF2 hash in IndexedDB key 'wipe' (separate from the vault). Set/change/off in Settings. Cleared on restore.
- www/biometric.js — fingerprint/face unlock via @capgo/capacitor-native-biometric (v6). The vault DEK (not the password) is stored in Android secure storage after a biometric check; flag 'bio' in IndexedDB. Auto-prompts on the lock screen; password always works; reset on restore/wipe. Needs USE_BIOMETRIC (added by the workflow). Untested on a real phone.
- www/autobackup.js — weekly auto-backup (kept 4) to Documents/PaisaDiary via @capacitor/filesystem; runs once per unlock if >7 days since last; Settings has toggle + Back up now + share. Config in IndexedDB key 'autobackup'. If Android blocks Documents writes it shows a notice and the share-sheet Backup still works. Untested on a real phone.
- www/xlsx.js      — SheetJS mini (Excel reading), inlined, no network.
- www/style.css    — the whole phone design system (indigo, rounded, system font). Tokens at the top (:root / dark).
- www/ui.js        — phone UI: top bar + left drawer menu, Home, Transactions (grouped by day), Accounts (grouped by family member), tap-row action sheet, Add button. Overrides buildAppHtml/renderOverview/renderTransactions/renderAccounts from app.js (loaded last).

## Security
Password -> PBKDF2 100k -> wraps a random AES-256-GCM key; recovery key wraps it too. Backups are encrypted and restore asks for the recovery key.

## Build the APK without a laptop toolchain
GitHub repo -> Actions -> Build Android APK -> run -> download artifact -> install on phone (allow "install unknown apps").
IMPORTANT: debug builds are signed with a changing debug key; to UPDATE the app later keep the same signing key, or back up first (Accounts -> Backup), install, then Restore.

## Gotchas
- Never use window.confirm/alert (blocked) — use showConfirmDialog/showNotice.
- Use localDateStr(), not toISOString(), for dates (India is UTC+5:30).
- Excel dates: read as serial numbers (no cellDates) to avoid a 1-day shift.
- Android WebView can't download via <a download>; shim uses Filesystem+Share plugins.
- Not tested on a real phone by the assistant: verify notifications + backup sharing after first install.

## Continuing in a new chat
Upload this folder (or at least PROJECT_NOTES.md and www/) and say "continue my Your Ledger phone app".

## App name / icon
- App name: capacitor.config.json -> appName.
- Icon sources: assets/ (icon-only.png, icon-foreground.png, icon-background.png); the workflow turns them into Android icons.
