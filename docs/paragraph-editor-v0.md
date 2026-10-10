# Paragraph Editor V0

Experimental isolated UI, not a rich-text toolbar or persistence integration.

## Assets

- src/components/ParagraphEditor.asx: native component.
- src/js/paragraph-editor.js: explicit mount/teardown browser module.
- src/css/editor.css: Foundry semantic-token styling with standalone fallbacks.
- examples/paragraphs.html: two independent instances; submit displays JSON only.
- examples/axonyx-page.asx: compile pilot when the component is copied into an
  isolated scaffold's app/components for testing. Not the eventual package API.

The runtime assets have no Node/npm/React dependencies. Package namespace and
automatic asset loading are not implemented. Load CSS and the ES module once,
then call mountParagraphEditors() after markup exists. Destroy returned handles
when their owner removes the component; remount explicitly after page replacement.
No MutationObserver or automatic Axonyx lifecycle integration is claimed.

## Contract

`document` is the encoded V1 JSON envelope, not arbitrary HTML. Empty string
starts a new document with one empty paragraph. `fallback` is escaped plain text
for read-only display without JavaScript; the caller must supply it for existing
content. `label` provides the textarea's accessible name; `name` names the hidden
JSON field (default content_document).

Textarea lines map to paragraphs. Blank lines are empty paragraphs. Adjacent
unformatted text runs become a single run after editing. Existing runs containing
inline CR/LF cannot round-trip through this representation and are refused,
rather than silently altered. Formatting marks/unsupported documents are also
refused and remain read-only, with submission disabled.

Native textarea behavior handles caret, plain-text paste and undo/redo. This is
not a contenteditable block editor. There is no execCommand implementation.
Form reset updates the submission document; destruction disables submission.
Client limits mirror the core subset as usability checks, NOT a security boundary.
The server must still call Document::parse_json before persistence, reject
duplicate JSON fields and enforce actual encoded HTTP request limits.

Without JavaScript the field is disabled and input read-only: no rich-text data
is submitted. A host form must not interpret omitted content as deletion.
Action integration, retention after server/network failure and DB migrations are
future work. No existing Legura posts are converted or touched.

## Tests

Rust checks: cargo test --locked. Browser pilot (test-only tooling):

```sh
node tests/browser.mjs ../legura
```

Pass a directory where Playwright is installed. Local verification reuses
Legura's existing test tools without adding node_modules to the editor repo.
CI installs pinned tools into RUNNER_TEMP. The Browser plugin was unavailable;
existing Playwright is used until Aegis provides equivalent browser coverage.

Checks: two instances, literal unsafe text/JSON, limits/recovery, reset,
undo/redo, teardown, unsupported input refusal, 320px layout and no-JS fallback.
This is not an accessibility audit, lossless arbitrary-document editor or
CMS action/persistence proof.
