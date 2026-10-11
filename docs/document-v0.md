# Document V0 Proposal

The paragraph/text subset is implemented experimentally; this is not a stable API.

## Envelope

Use an explicit format/version; do not guess rich text from a body string that
looks like JSON. Legura will retain its existing plain-text body path until an
explicit storage integration is agreed and migrated.

```json
{
  "format": "legura-richtext",
  "version": 1,
  "blocks": [
    {
      "type": "paragraph",
      "children": [
        { "text": "Hello ", "marks": [] },
        { "text": "Legura", "marks": [] }
      ]
    }
  ]
}
```

The current implementation supports paragraphs and headings with level 2 or 3:

```json
{"type":"heading","level":2,"children":[{"text":"Section title","marks":["bold"]}]}
```

Paragraphs cannot carry a level; headings require an integer level of 2 or 3.
H1 is reserved for the host page/post title. Missing/other levels and unknown
fields are rejected. Rendering emits fixed h2/h3 tags with escaped text and
the same inline marks.

Flat lists use consecutive item blocks, not nested documents:

```json
{"type":"list-item","list":"unordered","children":[{"text":"First item","marks":[]}]}
```

`list` must be `unordered` or `ordered`. Consecutive items with the same kind
render as one ul/ol group, each with a fixed li. Kind changes or non-list blocks
close the prior group. Each new ordered group starts normal HTML numbering at
1. No depth, custom numbering, attributes or child blocks are accepted. Each
item counts toward the same block/run/text/byte limits.
V0 is a bounded tree, not arbitrary HTML or executable components.

## Safe Link Server Contract V0

Text runs may have an optional `link` string:

```json
{"text":"Read more","marks":["bold"],"link":"https://example.com/posts"}
```

The Rust core accepts absolute lowercase `http://` and `https://` destinations
only, parsed using the `url` crate, with a nonempty host and no credentials.
The destination is bounded to 2048 UTF-8 bytes; whitespace, controls and
backslashes are rejected. Null, object and non-string links are invalid.
Local paths, protocol-relative URLs and other schemes are deliberately deferred.
Omit `link` for unlinked text. Server rendering escapes the href and text,
uses fixed `rel="nofollow ugc"`, and opens in the same browsing context.
No target, event attributes, automatic fetching or remote preview is accepted.
This is not phishing protection or a destination reputation check.

This first slice implements server validation/rendering only. Existing browser
editors reject linked documents without flattening them; link editing and
history-preserving selection are the next slice. Wire version remains 1 because
the package is unpublished; old server cores reject the new run field as well.

## Trust Boundary

The server rejects unsupported versions/types/marks, unknown fields, malformed
structures and excessive encoded bytes, nodes, depth or text lengths. Limits:
32 KiB raw JSON, 1..256 text blocks, 1 or more text runs per block,
512 total runs, and 20000 Unicode scalar values across all text. Empty text
is allowed; control characters other than newline, carriage return and tab are
rejected. Marks must be present and contain unique values from `bold` and
`italic` (or be empty). Other names/objects and duplicates are rejected.
Order is normalized to bold then italic. Rendering uses fixed strong/em tags,
closed before the next run; submitted text is always escaped. The wire version
remains 1 for this unpublished additive slice. Older clients must refuse marks
they cannot preserve rather than silently flattening formatted documents.
The wire version also remains 1 for unpublished additive headings. Older
server cores and paragraph/formatting clients must refuse unsupported headings;
RichTextEditor is the first client that preserves them.
There are no recursive block types. Serde's default recursion guard remains on.
These core limits do not override the HTTP/form encoded request budget; Legura
integration must check that boundary separately.
Invalid documents must not be persisted and should return actionable errors
without echoing private request data into logs.

Text is escaped when rendering; no raw HTML escape hatch. Link destinations
use the server policy above. No scripts, styles, event attributes, embeds or user-supplied SVG.
Paste is normalized to supported content, never stored as untrusted HTML.

The editor document is not an authorization token. Legura still checks session,
role, CSRF and database constraints at the action boundary.

## Failure And Compatibility

Keep unsaved content visible after validation/network failures. Undo/redo must
be deterministic; formatting must preserve selection. Unsupported versions
must be reported rather than silently dropping content.

Existing plain-text posts remain plain text. No-JS behavior must be explicit:
existing plain text remains editable; rich-text content must not silently be
flattened by a fallback textarea. Begin with read-only rich-text fallback until
a lossless submission strategy is implemented.
