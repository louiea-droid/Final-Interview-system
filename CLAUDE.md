@AGENTS.md

## Where we left off (session of 2026-09-25)

Nothing below is committed yet. Everything sits uncommitted on
`fix/visual-preview`, mixed in with the user's own earlier uncommitted work.
**Don't commit without asking;** the user commits.

### Batch 1 of the Visual Board editor: finished and reviewed

- Design: `docs/superpowers/specs/2026-09-24-visual-board-batch1-design.md`
- Plan: `docs/superpowers/plans/2026-09-24-visual-board-batch1.md`
- Step-by-step log, with every decision made:
  `.superpowers/sdd/2026-09-24-visual-board-batch1/progress.md` (git-ignored)

**Done (Tasks 1–9):**
- align and distribute;
- multi-select delete, duplicate, lock, hide and nudge;
- smart guides with gap labels (Snap is on by default; Ctrl drags freely);
- 8 resize handles (Shift keeps proportions, Alt resizes from the centre);
- a rotate handle for shapes, text, logo, photos and video (a `rotation`
  field, also drawn on the live board);
- double-click text to edit it on the canvas;
- shortcuts (Ctrl+A/X/C/V/D/G, Ctrl+[ ], zoom, Ctrl+scroll, Space-drag pan,
  Enter, Esc);
- the fuller right-click menu.

**Finished on 2026-09-25:**
- **The right-click menu overflow is fixed.** The clamp only re-ran on
  `[x, y]`, so it went stale when the menu's rows changed while it was open,
  or when the window was resized.
- **Task 10 is done.**
- **The final review ran** on the most capable model (0 Critical, 4
  Important). All four are fixed and checked in the browser:
  - triangle handles were unclickable, because the clip-path now sits on an
    inner `.vb-shape-fill`;
  - multi-select layer order did nothing (new `moveLayers`);
  - text edits were lost on Firefox/Safari, because `select()` now blurs the
    editor first;
  - text corner-resize drifted (`boxWidth` now scales, and `addText` sets
    `boxWidth: 92`).
- **StrictMode trap:** `main.jsx` uses StrictMode, so effect cleanups run
  twice in dev. Never save or close from an unmount cleanup.

**Deferred minors** (full list in the log above, none fixed yet):
- Enter opens the editor on locked text.
- Space and Enter are captured page-wide.
- `spaceHeld` can get stuck after Alt-tab.
- The context menu has no max-height.
- Dead code: `pointToPercent`, `duplicateElement`, `removeElement`,
  `describe`.
- Nudging a group at the board edge deforms it.
- `field-sizing` in the canvas text editor is Chromium-only.
- The menu and rotate tooltip don't show in Fullscreen.
- Resize/rotate handles still draw on locked elements (the drag is refused).

**Testing:** saves need a signed-in admin. Create a throwaway Firebase
email/password account (REST `accounts:signUp`, key in `.env.local`). Its UID
isn't in the rules, so its saves are refused and the real draft is safe.
Delete the account afterwards. Never click Publish.

Unit checks: `node src/lib/photoCrop.test.js && node src/lib/boardGeometry.test.js && node src/lib/boardTransform.test.js`

### Other things done this session (all working)

- **Photo cropping:** it used to read pixels back from Firebase Storage, which
  failed because the bucket has no CORS. A crop is now saved as
  `photo_crop: { x, y, width, height }` (percentages) next to `photo_url`, and
  drawn by `src/components/CandidatePhoto.jsx` (maths in
  `src/lib/photoCrop.js`). The original photo is stored uncropped.
  `src/lib/cropImage.js` was deleted. Save Crop shows "Crop saved. Save the
  candidate to keep it."
- **Sign-in and security:**
  - Admin sign-in is now Firebase Auth email/password
    (`src/lib/firebase/auth.js`); `localAuth.js` was deleted and the password
    is no longer in the bundle.
  - `firestore.rules` and `storage.rules`: anyone can read, and only the UID
    `tNRXV3YjwghpgnORmJrOPcGgHKr2` (louiea@hyacinthindustriesllc.com) can
    write. Storage uploads must be images under 10 MB.
  - The user deployed rules and hosting, and signed-out writes were checked
    to return 403.
  - To add an admin, put their UID in both rules files and run
    `firebase deploy --only firestore:rules,storage`.
  - Claude Code's auto mode blocks `firebase deploy`, so the user runs deploys.
- **Bugs fixed that already existed:**
  - Reset, then clicking the headline, crashed the editor (the default texts
    had no `animation`);
  - Ctrl+A skipped the candidate board and announcement strip;
  - right-click menu items never ran;
  - the first step of every drag was lost.
- The user can delete `ADMIN_USERNAME`, `ADMIN_PASSWORD` and
  `ADMIN_SESSION_SECRET` from their env file, since nothing reads them now.

## Visual Board editor roadmap

Batch 1 is finished (see above). Batches 2 and 3 are queued: pick them up when
the user asks. For Batch 3, check the editor first in case some of it already
exists.

### Batch 2: styling. Designed, parked by the user
- **Spec:** `docs/superpowers/specs/2026-09-25-visual-board-batch2-design.md`.
  The design was agreed section by section in chat. The user saw the written
  spec but asked to park it rather than review it, so ask them to review it
  before continuing.
- **Next step when resumed:** the user reviews the spec, then write the plan
  with writing-plans. No plan exists yet.
- **Decisions the spec records:**
  - custom shadows (colour, blur, X/Y, opacity) for every element, and text
    presets are converted to them;
  - borders on shapes, frames, images and videos, but not the logo;
  - adjustments on every kind of picture;
  - copy/paste style works across element types.
- **Keep testing light:** unit tests, plus one browser smoke check at the end.

### Batch 3: workflow extras
- Rulers and draggable guide lines
- Version history: restore an earlier published board
- Export the board as a PNG
- Drag-and-drop a photo straight onto the canvas
- Icon / sticker library
- Animation start delay
