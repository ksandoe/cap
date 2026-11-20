# Embedding the simulator in a CAP page

`@cap/sim-web` exports `SimWorkspace`: the simulated SAP session without any exercise around it. CAP's student app puts it beside the recipe instructions.

## What the student app does

1. Depend on the package (`"@cap/sim-web": "*"`) and import:

   ```tsx
   import { SimWorkspace, createCapSimApi } from '@cap/sim-web';

   const api = useMemo(() => createCapSimApi({ baseUrl: '/api', getToken: () => sessionToken }), [sessionToken]);

   <div style={{ height: 620 }}>
     <SimWorkspace api={api} />
   </div>
   ```

   The parent gives the workspace its height. The SAP screen scrolls inside it and the status bar sticks to its bottom. Without a height it grows with its content.

2. Register the scoping plugin in the student app's Vite config. The simulator's stylesheet then applies only inside `.sim-root` and cannot restyle CAP:

   ```ts
   import scopeSimStyles from '@cap/sim-web/postcss-scope';

   export default defineConfig({
     // ...
     css: { postcss: { plugins: [scopeSimStyles()] } },
   });
   ```

   The plugin changes only files under `sim-web/src`, so CAP's own stylesheets are untouched.

## What the workspace contains

- The Easy Access menu, with four transactions: Inquiry ▸ Create (VA11), Quotation ▸ Create (VA21), Order ▸ Create (VA01) and Order ▸ Display (VA03). The student may use them in any order.
- VA03 asks for a document number, shows the document, and opens Document Flow from Environment ▸ Display Document Flow. It finds only the learner's own documents.
- The status bar at the bottom of the workspace, with the quirks (the saved document number appears there).
- No intro, background or conclusion and no instruction pane. The recipe text is CAP's.

## Rules that keep it embeddable

- **Never size against the window.** No `100vh`, no `position: fixed`, no `window.innerWidth`. The simulator is laid out against its container (`.sim-root`). The status bar is `position: sticky`, and the Menu dropdown closes on a document-level click, not a full-screen layer.
- **The workspace never asks its container for more width.** `.sim-root.sim-workspace` has `contain: inline-size`. Without it, a wide SAP screen (the Overview needs about 700px) raises the minimum width of a grid or flex parent, as CAP's `.guided-layout` is, and the whole page scrolls sideways. With it, the screen scrolls inside the workspace. Found in the PR 4 review at a 659px window.
- **Embedded mode drops the instructions pane, so nothing the student must click may live there.** `ActivityLayout` takes an `embeddedNotice` that is drawn above the screen when embedded. The "Quotation saved" and "Order saved" panels pass their Continue button through it; before this, a student who saved a quotation or order was stuck on a blank screen with no way back to the menu. Teaching text stays in `instructions` only, because that is CAP's job when embedded.
- **CAP's bare element rules can leak in.** A shield block at the end of `src/index.css` reverts the properties CAP sets on `h1`–`h4` and `button`. If CAP adds another bare element rule (`p`, `a`, `input`), add the properties it sets to the shield. Better: CAP adds new global rules under a class.
- **UI5 dialogs (search help, Create with Reference) open in the browser's top layer,** centred in the window, not inside the workspace frame. Their content is still styled by the scoped stylesheet.

## Checked (2026-11-19)

Run in a throwaway harness that put the workspace in a fixed-height box under CAP's real `index.css`: Easy Access to VA11 and VA03, an inquiry created through the real screens (customer search help, material search help, quantity, Save), the "saved" status message surviving the return to the menu, a mistyped document number, Display Document Flow, the Menu dropdown opening inside the frame and closing on a click outside it. CAP's page styles were unchanged throughout. The standalone app still fills the window.

Checked in the real student page (2026-11-20, PR 4 review and the fixes after it): Inquiry, Quotation and Order created through the real screens, the Quotation and Order by Create with Reference, the warning and acknowledgement chain on save, Continue after each save, VA03 and Document Flow, resume after a relaunch, and a failed "Check my work" showing the student-safe messages. The review found the two problems described under "Rules" (page overflow in a narrow window, and no way back to the menu after saving a quotation or order); both are fixed and were re-checked in the same flow.

Not checked: a real phone, and side-by-side at desktop widths. In CAP's current layout the workspace gets only about 370px beside the instructions at a 1280px window, so wide SAP screens scroll sideways inside it. That is a CAP layout decision (see the PR 4 review notes), not something the workspace can solve on its own.
