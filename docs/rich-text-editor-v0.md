# Rich Text Editor V0

An isolated in-place paragraph editor with bold/italic, plain-text paste and
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

No headings, lists, links, pending-caret formatting, drag/drop or browser-native
editing menu support yet. Unsupported beforeinput operations are canceled.
Typing inherits preceding marks as in FormattingEditor. IME composition is
explicitly unsupported: submission is blocked during composition and the last
valid model is restored afterwards. Use ParagraphEditor when IME is required.
Do not integrate this pilot as the only production input until that gap closes.

No-JS/invalid imports are read-only with disabled submission; omitted content
must never mean deletion. No DB change, autosave, collaboration or package release.

## Verification

Run node tests/browser.mjs ../legura with an existing test-only Playwright install.
Chromium checks cover actual typing/Enter/deletion, selected in-place marks,
keyboard history, emoji, plain-text malicious paste, document reload, over-limit
rejection, unexpected DOM recovery, reset, synthetic IME refusal, mobile width,
teardown and no-JS. This is not a cross-browser/real-IME/accessibility audit.
