# Legura Editor

An independent rich-text editor project for Legura and, later, other Axonyx
applications. Foundry UI supplies the visual language; Legura owns publishing.

Status: experimental Rust paragraph/text validation and rendering core on a
feature branch. No browser editor, Cargo/npm release, React adapter or Legura
integration is shipped yet.

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

## Core Checks

```sh
cargo test --locked
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
```

`Document::parse_json` returns an immutable validated document. Only that
document exposes `render_html`; there is no public unchecked constructor.
Current marks must be an explicit empty array. Bold/italic are future work.

## Development

Feature branches target `dev`; release PRs move `dev` into `main`. Keep source
and reusable contracts here, not copied into Legura. Integration will consume a
versioned package once the first slice is usable. Package names and license are
not selected or reserved by this scaffold.

Browser verification will initially use available tooling. Aegis can take over
when its browser backend provides equivalent assertions; HTTP checks alone
cannot prove caret, toolbar or keyboard behavior.
