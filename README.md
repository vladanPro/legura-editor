# Legura Editor

An independent rich-text editor project for Legura and, later, other Axonyx
applications. Foundry UI supplies the visual language; Legura owns publishing.

Status: experimental Rust paragraph/text validation and rendering core on dev,
plus isolated paragraph, formatting and in-place editor pilots. No Cargo/npm release,
React adapter or Legura integration is shipped yet.

## Direction

- Native Axonyx `.asx` component with a small browser interaction module.
- A versioned structured document, validated and safely rendered on the server.
- No React, Node or npm requirement for the editor runtime or native package.
- JS initially handles selection, caret and browser editing; WASM is optional.
- Plain-text content stays supported without rewriting existing posts.

This repository does not implement an entire browser editing engine or promise
to eliminate browser JavaScript. Rust owns document validation/rendering;
browser APIs own interaction.

## V0

Paragraphs, headings, bold, italic, ordered/unordered lists and safe links.
Keyboard accessibility, undo/redo, paste normalization and submission recovery
are acceptance requirements, not optional polish.

See [the document contract](docs/document-v0.md) and [roadmap](docs/roadmap.md).
The first browser slice is documented in [Paragraph Editor V0](docs/paragraph-editor-v0.md).

## Core Checks

```sh
cargo test --locked
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
```

`Document::parse_json` returns an immutable validated document. Only that
document exposes `render_html`; there is no public unchecked constructor.
The Rust core accepts unique bold/italic marks and renders fixed strong/em tags.
ParagraphEditor still requires empty marks and refuses formatted documents to
avoid data loss. The new [FormattingEditor pilot](docs/formatting-editor-v0.md)
supports selected bold/italic and document-aware history with a separate preview.
It is not WYSIWYG or connected to Legura's database yet.

The new [RichTextEditor pilot](docs/rich-text-editor-v0.md) displays and edits
paragraphs with bold/italic in place, reusing that model/history. Plain-text
paste only; IME transaction handling has trusted Chromium protocol tests.
Real OS/browser IME acceptance remains open. It is not integrated or published.
RichTextEditor also supports H2/H3 text blocks with safe Rust rendering,
block-style conversion and metadata-aware history. Lists and links remain planned.

## Development

Feature branches target `dev`; release PRs move `dev` into `main`. Keep source
and reusable contracts here, not copied into Legura. Integration will consume a
versioned package once the first slice is usable. Package names and license are
not selected or reserved by this scaffold.

Browser verification runs Chromium, Firefox and WebKit in isolated CI jobs:

```sh
node tests/browser.mjs ../legura chromium
node tests/browser.mjs ../legura firefox
node tests/browser.mjs ../legura webkit
```

The first argument supplies an existing test-only Playwright installation, not
a runtime dependency. Native CDP IME testing is Chromium-only. Clipboard fixtures
are synthetic and do not prove operating-system clipboard integration.
Aegis can take over
when its browser backend provides equivalent assertions; HTTP checks alone
cannot prove caret, toolbar or keyboard behavior.
