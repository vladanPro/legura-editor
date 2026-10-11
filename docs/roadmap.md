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
recovery have Chromium checks. IME is explicitly refused, not claimed supported.
Cross-browser/IME, headings/lists/links and persistence remain open gates.

## 4. Legura Pilot

Agree explicit content-format storage and migration policy. Integrate one
versioned editor package into create/edit/preview/public rendering. Validate on
the server before writes. Prove setup/auth remain unchanged, rejected input
retains edits and existing plain-text posts round-trip without conversion.

## Later

Reusable packaging and React adapter, richer blocks, media integration and
extensions follow demonstrated needs. No Elementor-style page builder, realtime
collaboration, arbitrary HTML or WASM requirement in V0.
