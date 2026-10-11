# Rich Text Editor V0

An isolated in-place paragraph/heading/flat-list editor with bold/italic, links, plain-text paste and
bounded undo/redo. This is a browser pilot, not a released CMS editor.

## Usage

RichTextEditor.asx accepts name, label, document (encoded JSON) and fallback.
Its label precedes a joined toolbar/content frame. Eleven icon-only controls
import native Foundry icons from @axonyx/ui/foundry/icons; aria-label and title
preserve command names. These icons require the new UI source assets, not the
previously published UI package. No document, persistence or validation contract
changes with this presentation.
Load editor.css and rich-text-editor.js, then mountRichTextEditor(root).
Call the returned destroy() when removing the component. Automatic Axonyx
lifecycle/package integration and server persistence are not implemented yet.

For an isolated local preview (no CMS database), check out the matching
axonyx-ui source beside this repository, or set AXONYX_UI_SOURCE to its path,
then run node examples/serve.mjs. Open
http://127.0.0.1:3947/examples/richtext.html.
This preview uses a deliberately limited fixture projection, not an Axonyx
compiler. Native imports must also be checked with the actual Axonyx CLI.

The adapter reuses FormattingEditor's validated character/mark model and
history. Its textarea is hidden only after successful initialization. The
contenteditable surface displays fixed text-block, list and strong/em tags from that
model; it is never treated as an HTML source to store or publish. Browser
selection offsets map to the model's UTF-16 selection, including paragraph
separators. Input, Enter, scalar deletion, selected formatting and clipboard
cut/paste update the model before rebuilding the surface. No execCommand.

Paste uses text/plain only; HTML formatting, images and embedded scripts are
not imported. CRLF/CR normalize to paragraph separators. Edits exceeding limits
are refused and the last valid document is restored with a visible message.
Unexpected native DOM input also restores the model instead of serializing HTML.
Server-side Rust Document validation remains mandatory before any future write.

## Explicit Limits

H2/H3/Paragraph controls change the selected blocks or the collapsed caret's
current block, preserving text and marks. Selection ending at the next block's
start excludes that next block. Block styles live alongside character atoms in
bounded history, so undo/redo, reload and reset restore them too. Enter splits
the current block and starts a paragraph; merging retains the first block's
style. Multiline paste keeps the first block style; added blocks are paragraphs
unless the insertion is inside a list, where they continue the same list kind.
H1 is left to the host page/post title. ParagraphEditor and FormattingEditor
refuse heading/list imports to prevent data loss.

Bullets/Numbered controls convert selected blocks or the caret's current block.
Flat list items form one ul/ol for each consecutive run of the same kind.
Enter in a nonempty item starts another item. Enter on an empty item changes it
to a paragraph without adding another block, as one undoable style change.
Changing an item to a heading/paragraph splits the list into separate groups.
Selection offsets count item separators even though the DOM wraps items in a
list container. No nested lists, indentation, custom start numbers or task lists.

No pending-caret formatting, drag/drop or browser-native
editing menu support yet. Unsupported beforeinput operations are canceled.
Typing inherits preceding marks as in FormattingEditor. IME composition now
uses a transaction anchored to the original model selection. Native temporary
DOM is left alone during composition, while submission/toolbar commands are
blocked. On compositionend, only the committed event.data replaces that range;
temporary native markup is discarded and the result is validated normally.
The entire composition is one undo step. Cancellation preserves original text.
Limits, reset, lost-focus recovery and teardown preserve the validated model.
Pointer-driven blur recovery waits until the click finishes so status changes
cannot move the clicked control between pointerdown and pointerup.

Trusted Chromium CDP composition/update/commit/cancel tests pass. This does NOT
prove physical Windows/macOS/Linux IMEs, mobile keyboards, Firefox or WebKit.
Do not claim production IME coverage until that separate acceptance is completed.

No-JS/invalid imports are read-only with disabled submission; omitted content
must never mean deletion. No DB change, autosave, collaboration or package release.

## Verification

Run node tests/browser.mjs ../legura chromium (or firefox/webkit) with an existing
test-only Playwright install. All three engine suites cover actual typing/Enter/deletion, selected in-place marks,
keyboard history, emoji, plain-text malicious paste, document reload, over-limit
rejection, unexpected DOM recovery, reset, mobile width, teardown and no-JS.
IME tests use trusted Input.imeSetComposition and Input.insertText via CDP,
plus synthetic boundary tests for limits, literal text, reset/blur and teardown.
Cross-paragraph cut/undo and independent editor instances are included.
Clipboard events are explicit synthetic fixtures because Firefox's
ClipboardEvent constructor does not retain a supplied DataTransfer payload.
This is not physical-IME, OS clipboard, actual Safari/mobile or accessibility QA.
The WebKit engine test is not a claim of having tested Safari on macOS/iOS.

References: [compositionend](https://developer.mozilla.org/en-US/docs/Web/API/Element/compositionend_event)
and [Chromium Input protocol](https://chromedevtools.github.io/devtools-protocol/tot/Input/).
## Selected Links V0

Select text, enter an absolute HTTP/HTTPS address, and choose Apply link (or
press Enter in the address field). Remove link clears only the selected text's
destination. A collapsed caret cannot create or remove a link; select its text.
Empty linked runs cannot be represented in the per-character model, so imports
containing them are refused without dropping metadata (the Rust core accepts them).
Changing an existing link uses the same apply control. Escape returns focus to
the editing surface. The address is a scratch control, not a submitted field or
an automatic reflection of the selected link. Invalid destinations leave the
validated document/history intact and show a status message.

Links are part of per-character model metadata and run grouping, not serialized
from DOM. Bold/italic, block styles, reload/reset and undo/redo preserve them.
Typing inside a link inherits its destination only when both neighboring atoms
have that destination; typing at a boundary is unlinked. Newlines never carry
destinations. Plain-text paste follows the same rule, discarding external HTML.
Selecting across blocks creates separate linked runs, never a cross-block anchor.
Editor anchors suppress navigation; published Rust HTML links navigate normally.
Link controls are disabled during composition and after teardown. No local-path
links, target options, link detection, popup preview or drag/drop in V0.

Three-engine tests use synthetic IME/clipboard fixtures for linked text, not a
claim of physical OS/mobile IME or system clipboard acceptance. The existing
trusted Chromium CDP IME tests cover the shared editor transaction engine.
