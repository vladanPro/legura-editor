# Rich Text Editor V0

An isolated in-place paragraph/heading editor with bold/italic, plain-text paste and
bounded undo/redo. This is a browser pilot, not a released CMS editor.

## Usage

RichTextEditor.asx accepts name, label, document (encoded JSON) and fallback.
Load editor.css and rich-text-editor.js, then mountRichTextEditor(root).
Call the returned destroy() when removing the component. Automatic Axonyx
lifecycle/package integration and server persistence are not implemented yet.

The adapter reuses FormattingEditor's validated character/mark model and
history. Its textarea is hidden only after successful initialization. The
contenteditable surface displays fixed paragraph/strong/em tags from that
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
start excludes that next block. Block levels live alongside character atoms in
bounded history, so undo/redo, reload and reset restore them too. Enter splits
the current block and starts a paragraph; merging retains the first block's
level. Multiline paste keeps the first block style and adds plain paragraphs.
H1 is left to the host page/post title. ParagraphEditor and FormattingEditor
refuse heading imports to prevent data loss.

No lists, links, pending-caret formatting, drag/drop or browser-native
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
