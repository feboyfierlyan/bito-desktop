# Bito Design System v1.0

Bito uses a custom, zero-lock-in UI component and token system (`src/ui/`) tailored for a calm desktop companion across macOS and Windows. Third-party StyleX/Astryx runtime dependencies have been removed so Bito owns its exact DOM semantics, WCAG 2.2 AA contrast ratios, keyboard navigation, and compositor-safe motion.

## Visual Tokens & Dual Theme (`src/ui/design-tokens.css`)

- **Warm Paper Light Mode (`:root`, `:root[data-theme="light"]`):** Warm canvas (`#F9F8F6`), crisp elevated task/chat sheets (`#FFFFFF`), ink primary (`#16181A`), WCAG AA secondary/tertiary text (`#525860` / `#687078`), companion sage (`#2F7D4A`), and Bito focus blue (`#0066DC`).
- **Cozy Obsidian Dark Mode (`:root[data-theme="dark"]`):** Deep obsidian canvas (`#121316`), elevated surfaces (`#181A1F` / `#20232A`), soft off-white ink (`#F2F3F5`), muted hairline borders (`rgba(255, 255, 255, 0.08)`), and calibrated dark-mode sage/blue accents.
- **Typography & Tabular Numerals:** Scalable `rem` type scale (`--bito-text-2xs` through `--bito-text-2xl`), weights `400`, `500`, and `600`, plus `--bito-font-mono` with `font-variant-numeric: tabular-nums` on focus timers and counters to prevent horizontal layout jitter.
- **Appearance Sync (`src/ui/BitoTheme.tsx`):** Synchronizes `system | light | dark` preference with `document.documentElement.dataset.theme`, `color-scheme`, and Electron `nativeTheme.themeSource`.

## Custom Primitives & Controls (`src/ui/primitives.tsx`, `src/ui/controls.tsx`)

- **Form Controls (`controls.tsx`):** `BitoButton`, `BitoTextInput`, `BitoTextArea`, `BitoDateInput`, and `BitoSelector` preserve native form submission, IME composition events, refs, required validation, length limits, and keyboard arrow/Escape handling.
- **Interactive Primitives (`primitives.tsx`):**
  - `BitoCard`, `BitoBadge`, `BitoProgressBar` (GPU `scaleX` transform fill).
  - `BitoCheckbox` (accessible native checkbox with `aria-readonly` pending guard and animated check stroke) and `BitoSwitch`.
  - `BitoSegmentedControl` & `BitoSegmentedItem` (radiogroup arrow-key navigation with spring-animated sliding pill indicator).
  - `BitoPopover` (viewport-clamped, origin-aware floating surface with synchronous focus handoff and Escape return).
  - `BitoCalendar` (Bahasa Indonesia month grid with min/max ISO date guards).
  - `BitoAppShell` (warm paper navigation rail paired with an elevated workspace sheet) and `BitoChatComposer` (contained hairline prompt box with an active-only `bito-border-beam` shimmer while Bito is thinking or streaming, consuming 0% GPU when idle).
- **Accessible Disclosure & Dialogs:** `BitoDisclosure.tsx` provides CSS `grid-template-rows` height disclosure without layout jumps, and `WorkspaceDialog.tsx` wraps native `<dialog>` with Escape, backdrop click, back navigation, and unsaved-draft guards.

## Screen Composition & Motion Discipline

- **Desktop Pet Overlay (`src/App.tsx`, `src/style.css`):** High-contrast floating quick-action bar (Chat, Pilih Area, Fokus, Ruang Kerja) with status badges for Fokus and Jangan Ganggu.
- **Desktop Chat (`src/DesktopChat.tsx`, `src/ResponseCards.tsx`):** Contained bottom composer, inline message copy/save actions on hover and `:focus-within`, 1-click screen-capture confirmation pill before sending desktop pixels, undoable memory cards, and dedicated crisis helpline cards.
- **Workspace (`src/ProjectWindow.tsx`, `src/WorkspaceTasks.tsx`, `src/ProjectBoard.tsx`):** Unified workspace for quick tasks, multi-step projects (with 1-step checklist quick-start or AI draft review), `.ics` calendar export, and dedicated Focus Timer view (`FocusSessionView`) with companion presence and tabular countdown.
- **Settings (`src/SettingsWindow.tsx`):** Grouped preference cards with explicit `Tampilan` (`Mengikuti sistem / Terang / Gelap`), companion hours, memory management, local data controls, and 2-step account deletion.
- **Onboarding (`src/Onboarding.tsx`):** Three-step introduction with step indicator dots and a keyboard-accessible `"Lanjut ke desktop"` primary button alongside the optional drag-to-desktop gesture.
- **Motion & Accessibility:** Every interactive element exposes a clear `:focus-visible` ring (`2px solid var(--bito-focus-ring)`), minimum hit targets, and immediate `0ms` collapse when `prefers-reduced-motion: reduce` or `settings.reducedMotion` is active.

## Verification

- `npm run check` runs strict TypeScript validation across renderer, Electron main, and shared Edge Function schemas.
- `npm test` runs `tests/astryx-ui.test.ts`, `tests/composer-style.test.ts`, `tests/sprint1-remediation.test.ts`, and domain suites covering controls, keyboard navigation, workspace flows, security boundaries, and persistence.
