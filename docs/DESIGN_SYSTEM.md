# Bito interface · Astryx

Bito uses Astryx 0.7.5 for shared controls, surfaces, selection, and modal behaviour. The interface stays light, with Bito blue (`#007AFF`), white surfaces, and the existing green character and artwork.

## References

The implementation follows the official [Astryx documentation](https://astryx.atmeta.com/) and [source](https://github.com/meta/astryx). The template study covered Library/Card Grid, Project Status Dashboard, Settings, Login Card, AI Chat, AI Chat Landing, Form Wizard Dialog, and Detail Page. Templates inform composition; they do not add unrelated features to Bito.

## Shared foundation

- `src/ui/BitoTheme.tsx` provides the compiled neutral theme in light mode to each renderer. Using the published CSS avoids a second runtime styling pipeline.
- `src/ui/astryx-bito.css` sets Bito tokens and the public Astryx component treatments. Overrides use stable `astryx-*` classes and Bito's own classes, never generated StyleX class names.
- `src/ui/controls.tsx` adapts Astryx Button, Text Input, Text Area, Date Input, and Selector to Bito's existing form and event contracts. Composition events, input refs, native required validation, and text length limits remain supported.
- `src/ui/BitoDisclosure.tsx` uses Collapsible and measured layout animation for optional detail.

## Screen composition

- **Projects:** App Shell with labeled navigation, searchable project rows, and grouped task lists. Tasks stay in the main column; Calendar and Progress remain visible in a right-hand rail (stacked below on narrow windows). Bito’s session action remains available above the list.
- **Project editing:** Dialog, Dialog Header, Date Input, Selector, and text fields. Back, Escape, focus return, and unsaved-change guards remain connected to the existing flow.
- **Settings:** grouped Cards, Switch, Segmented Control, Selector, Slider, and shared fields. Existing draft persistence and validation remain in place.
- **Desktop chat:** Chat Composer with Bito's input and send/stop slots, shared buttons, project selector, response Cards, progress bars, and checkboxes. Messages keep their iMessage-style blue/gray bubbles.
- **Login and onboarding:** the same theme, Card and shared controls, with the existing artwork, persistent Rive character, cursor gaze, and drag-to-desktop transition.
- **Saved work and response cards:** Segmented Control, Cards, progress, checkboxes, shared fields, and disclosures.
- **Screen selection and highlighting:** the same theme and action controls, while retaining the native overlay and input behaviour needed for screen coordinates and keyboard shortcuts.

## Motion and desktop boundaries

Text inputs, date inputs and selectors show no coloured focus ring or glow. Buttons retain keyboard focus feedback. Astryx owns selection and dialog behaviour; Bito's existing Motion transitions own the character, shared panel movement, chat reflow, and resize gestures. Reduced motion remains respected.

The entire chat content stays inside its animated, clipped panel. The desktop project picker remains inside that surface instead of moving to a body portal, so Electron's transparent-window hit regions still match what the user sees.

The weekly schedule and progress graph remain data-driven Bito visualisations; Astryx does not supply a replacement chart primitive. Character rendering, screenshot coordinates, and native window geometry remain separate from the design system.

## Verification

`tests/astryx-ui.test.ts` mounts real controls to check form submission, disabled actions, text editing, IME composition, refs, required validation, length limits, selectors, dates, reversible checkboxes, disclosure behaviour, main-region semantics, and dialog navigation. The existing domain tests continue to cover project progress, calendar sync, chat, and screen assistance.

Use `npm run dev` for local revision mode, `npm run check` for TypeScript, and `npm test` for automated tests. Packaging and release publishing are separate from this UI migration.

## Todoist task-flow study · 4 November 2026

The Mobbin references inspected were [Todoist task capture and due date](https://mobbin.com/flows/b6bea42f-cfe5-4774-b28b-43fa0aa57dbb?tab=screens) and [Todoist grouped project work](https://mobbin.com/screens/46dab991-e521-44bc-984a-c936e31610a8). Bito adopts the compact title/description capture, date and priority controls, labeled sidebar, grouped rows and add action within each group. “Tambah kelompok” has one entry in the project toolbar; groups can start empty and their title/date can be edited without rebuilding the AI plan. It retains Astryx controls, Indonesian copy, the blue action color and the green companion.

`TaskComposer` is shared by quick add, grouped project tasks and Tugas singkat. A task can have its own date and P1–P4 priority. Clearing its date explicitly leaves it undated; old tasks without an individual date continue to inherit their group date. Date changes do not count as task completion. AI revisions preserve dates and priorities for retained task IDs. Quick tasks appear in the local schedule; Google Calendar synchronization continues to apply to project entries.

Inline capture remains under its group and pins the destination to that group. Failed submissions retain input, concurrent submissions are guarded, and leaving populated forms requires an explicit discard.

## Whole-app audit · 5 November 2026

The second Mobbin study inspected the Todoist references above, [inline task capture](https://mobbin.com/flows/1a8b1a3a-5b67-49b1-a047-32086af027d5?tab=screens), and [Linear's grouped settings](https://mobbin.com/screens/9ac66835-aa7f-469f-ace3-a915c2cf2dfd). These are composition references, not evidence that copying every control would improve Bito. The implemented decisions are:

- **One action per scope:** the sidebar creates projects, the project toolbar creates groups, and each group creates its own tasks. Remove duplicate project/group entry points and repeated group summaries in the rail. Inline capture does not ask users to choose the destination they just clicked.
- **Honest state:** viewing an archived project is read-only and does not restore it or change chat context. Restoration is explicit. Progress always shows completion counts and a bar; a historical graph appears only when there are at least two observations.
- **Useful metadata:** overdue incomplete tasks use a distinct date color; inherited dates have explanatory titles; the weekly schedule includes month/year. Default task priority is named “Tanpa prioritas.” Project forms say “Nama proyek.”
- **Predictable feedback:** failed preference saves keep users on their current page. Shared dialog/calendar labels use Indonesian. Chat shows a writing placeholder and a folder icon for opening projects; switching chat context remains a separate overlay action.
- **Quiet focus:** remove colored glow from every chat composer layer, including the library's layout wrapper and the outer reveal container. Buttons retain keyboard focus indication.

No new navigation destinations, analytics cards, or decorative controls were added solely to resemble the references. Astryx remains the component base.
