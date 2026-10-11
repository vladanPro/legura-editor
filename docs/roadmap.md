# Roadmap

No dates or completion percentages are promised. No production editor is shipped.

## 1. Document Core

Implement a Rust paragraph/text document model, strict bounded validation and
escaped HTML rendering. Test invalid structures, unsupported versions, resource
limits and malicious text. Decide package names/license before publishing.

The initial paragraph/text subset is implemented on the document-core feature
branch with unit tests and CI. It remains unpublished and not used by Legura.

## 2. First Editable Slice

Build a Foundry `.asx` component and browser module for paragraphs, submission,
selection and undo/redo. Verify two instances are isolated and lifecycle cleanup
works. Provide explicit no-JS behavior without content loss.

ParagraphEditor V0 now has an isolated textarea-based browser pilot with JSON
submission output, native undo/redo, limits/recovery, instance isolation, reset,
teardown and read-only fallback. This is not a formatting toolbar or database
integration. See paragraph-editor-v0.md for representation limits and tests.

## 3. Formatting

Add heading/bold/italic, then lists and safe links one at a time. Test keyboard
navigation, accessible toolbar semantics, selection retention, paste handling
and mobile layouts. Do not rely on deprecated execCommand as the architecture.

Inline mark core V0 adds strict bold/italic validation, canonical mark order and
safe strong/em rendering. Browser regression verifies the older textarea editor
refuses formatted documents without altering the source. Formatting-aware
selection, toolbar and undo history remain the next separate browser slice.

FormattingEditor V0 now provides a selected-text toolbar and separate safe
preview, with mark-aware bounded history, input/reset/teardown and IME submission
protection. See formatting-editor-v0.md. In-place WYSIWYG, real IME matrix and
server action/persistence integration remain future gates.

RichTextEditor V0 adds an isolated in-place surface over the same model/history.
Typing, paragraph splitting, selection formatting, plain-text paste and safe
recovery have Chromium checks. IME transactions now have trusted Chromium
composition/update/commit/cancel tests with one-step history and guarded submit.
Chromium/Firefox/WebKit browser suites now cover the shared editing path,
including cross-paragraph cut/history and independent instances. Clipboard
fixtures are synthetic; native CDP IME remains Chromium-only. Physical OS/mobile
IME and clipboard QA, links and persistence remain open gates.

Headings V0 adds strict H2/H3 document blocks, escaped Rust h2/h3 rendering,
Paragraph/H2/H3 controls, selected-block conversion and metadata-aware history.
Enter starts a paragraph; merges retain the first block style. Three-engine
checks cover marks, split/merge, empty headings, reload/reset and legacy refusal.

Flat Lists V0 adds strict unordered/ordered item blocks, grouped escaped Rust
ul/ol/li rendering and Bullets/Numbered controls. Enter continues a list; Enter
on an empty item exits to a paragraph. Three-engine checks cover conversion,
marks, grouping, container selection, split/merge, multiline paste and history.
Chromium native IME is also tested inside an item. Nested/task lists are deferred.

## 4. Legura Pilot

Safe Link Contract V0 is implemented in Rust: optional bounded run destinations,
parsed HTTP/HTTPS only, no credentials, escaped fixed anchor rendering and no
remote fetching. Browser clients deliberately reject linked imports until the
next slice implements selected link editing/removal, history and safe selection.
Local paths, target controls and automatic link detection remain deferred.

Agree explicit content-format storage and migration policy. Integrate one
versioned editor package into create/edit/preview/public rendering. Validate on
the server before writes. Prove setup/auth remain unchanged, rejected input
retains edits and existing plain-text posts round-trip without conversion.

## Later

Reusable packaging and React adapter, richer blocks, media integration and
extensions follow demonstrated needs. No Elementor-style page builder, realtime
collaboration, arbitrary HTML or WASM requirement in V0.
