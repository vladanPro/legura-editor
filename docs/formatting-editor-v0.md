# Formatting Editor V0

Text input plus separate formatted preview; NOT WYSIWYG or a Legura storage
integration. The toolbar exposes bold, italic, undo and redo. Select text first;
there is no collapsed-caret pending formatting mode yet.

## Contract

FormattingEditor.asx uses the same name/label/document/fallback props as the
paragraph component. Load editor.css and formatting-editor.js once and call
mountFormattingEditor(root). Returned handles must be destroyed when the owner
removes markup. No automatic page lifecycle integration or package import is
claimed. Keep the older ParagraphEditor for unformatted input; it intentionally
refuses marks it cannot preserve.

One textarea line maps to a paragraph. Each Unicode scalar is represented by
an immutable character/mark pair while editing. Selection offsets from browser
UTF-16 are mapped to character boundaries, so emoji are not split into invalid
JSON. Beforeinput ranges anchor repeated-character replacements/deletions;
prefix/suffix diff is a fallback for programmatic input without beforeinput.
Inserted text inherits the mark of the character immediately before it in the
same paragraph, or plain formatting at paragraph start. New paragraph separators
never carry marks. Inline line breaks inside imported runs remain unsupported
and are refused rather than silently converted.

Selected text toggles marks: if every selected character has a mark, remove it;
otherwise apply it to all selected characters. Paragraph separators are excluded.
Serialization merges adjacent equally formatted characters into text runs.
Preview uses fixed DOM tags and text nodes, never innerHTML from submitted data.

Ctrl/Cmd+B/I toggle formatting, Ctrl/Cmd+Z undo and Shift+Z/Y redo. History stores
text AND marks AND selection, bounded to 50 snapshots and 100000 retained code
points (counting separators). New edits discard redo history. Reset restores
the initially loaded document. IME composition disables submission until settled.
Composition is covered synthetically; real IME/OS/browser interoperability remains
an acceptance gap, not a production claim.

## Boundaries

No-JS fallback is read-only with submission disabled. Hosts must not interpret
an omitted document as deletion. Invalid input remains visible, disables JSON
submission and can be corrected or undone to the last valid state. Server/network
error retention still awaits real action integration. Rust Document validation
remains mandatory before storage; browser validation is usability only.

No heading/list/link, real contenteditable WYSIWYG, autosave, collaboration,
arbitrary HTML paste, pending-caret styles or DB migrations in this slice.

## Verification

Run node tests/browser.mjs ../legura with an existing test-only Playwright install.
Browser plugin unavailable; no Node/npm dependency in runtime assets.
Checks include selected/combined/toggled marks, keyboard history, repeated-letter
deletion, emoji/multiple paragraphs, literal unsafe text, document reload, reset,
invalid recovery, synthetic composition, two instances, teardown, 320px and no-JS.
Real Axonyx check/build verifies component markup separately in a disposable
scaffold. This is not a broad browser matrix or accessibility audit.
