# Package Assets V0

`legura_editor::assets` exposes bundle version 1 and five embedded UTF-8 files:

- `components/RichTextEditor.asx`
- `public/editor.css`
- `public/rich-text-editor.js`
- `public/formatting-editor.js`
- `public/paragraph-editor.js`

The crate embeds canonical sources with include_str, not a second generated
copy. Cargo's include list retains these sources in packaged crates. Consumers
do not need to locate Cargo checkout directories or read src/ internals. The
three browser modules keep their relative paths together under public/.

The application owns asset staging, URL prefix, shell stylesheet/module loading,
Foundry dependency, lifecycle host and cleanup policy. The bundle does not run
filesystem operations, auto-register runtime callbacks or activate CMS editing.
The ASX component still imports native Foundry icons. Runtime native-422 replay
support is optional for basic editing, required for the new native retry flow.

Bundle version describes layout/integration compatibility; package version/Git
revision still selects the actual code. Consumers should inventory content hashes
and refuse accidental overwrites. Git-pinned package and exported assets must
come from the same build. There is no npm bundle, WASM requirement, update daemon
or publication in this slice; publish=false remains intentional.
