# Modern Playful UI — progress (branch `feature/modern-playful-ui`)

UI-only redesign. `main` (live GitHub Pages) is untouched; Neobrutalism theme stays recoverable from `main` / `ac55dea`.

## Done
- New theme in `assets/style.css`: Noto Sans Thai everywhere (400/500/600/700/800), tokens `--ui-*`, white cards, 2px #171717 borders, rounded 24/16/12, hard 5px shadow; yellow primary / cyan secondary / orange important / red destructive buttons; inline-SVG icons (no emoji icons).
- App shell in `index.html`: sidebar (logo, Workstation ABBTG-A · บางบัวทอง, existing `#views` nav, ⚙ ตั้งค่า for admins, account e-mail + role, logout) + topbar (current view title, date, user). Below 1024px the sidebar is a drawer (menu button, Esc / backdrop close).
- Login + set-password restyled (brand, error box, loading spinner on the button).
- Fleet Over View: welcome card (สวัสดีครับ บัง …) with cyan accent; KPI cards show only the 6 values the app already computes; driver table in a rounded container (table ≥900px, scrolls inside its container; stacked rows on phones).
- กะ Fleet / กะ Ops / การลา / ตั้งค่าการลา / จัดการสิทธิ์ / invite-link box restyled using existing DOM/classes.
- `assets/shell.js` (new, presentation only): drawer toggle, header date, account label (from data leave.js/auth already loaded).
- JS edits limited to presentation strings: removed emoji prefixes from display text (driver.js, roster.js, leave.js) and theme-color hex (roster.js, auth.js). No logic/API/auth changes.
- `sw.js` cache VERSION and all `?v=` bumped to `20261004ui2`; manifest colours updated.

## Remaining
- Finish full regression run (5 viewports) + fix anything it finds; cleanup of temp test users/rows; draft PR.
- Native `window.confirm` dialogs (logout / delete) cannot be styled without JS logic changes — left as is.

## How to test
```
cd /workspace/ws-ui2 && python3 -m http.server 8091 --bind 127.0.0.1
# main snapshot for parity: git -C /workspace/ws-repo archive main | tar -x -C /tmp/ws-main && (cd /tmp/ws-main && python3 -m http.server 8093)
node /workspace/workstation/test/ui2_test.js   # needs .test-ui2-admin / .test-ui2-user temp accounts
```
Screenshots: `/workspace/workstation/test/ui2/`.
