# Document V0 Proposal

This is a proposed wire contract, not an implemented validator or stable API.

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
        { "text": "Legura", "marks": ["bold"] }
      ]
    }
  ]
}
```

The first implementation proves paragraph/text only. Heading, list and link
schemas must be specified and tested before exposing their toolbar controls.
V0 is a bounded tree, not arbitrary HTML or executable components.

## Trust Boundary

The server rejects unsupported versions/types/marks, unknown fields, malformed
structures and excessive encoded bytes, nodes, depth or text lengths. Numeric
limits will be chosen alongside runtime request limits in the validator PR.
Invalid documents must not be persisted and should return actionable errors
without echoing private request data into logs.

Text is escaped when rendering; no raw HTML escape hatch. Link destinations
require explicit scheme validation (initial proposal: HTTPS/HTTP and safe local
paths). No scripts, styles, event attributes, embeds or user-supplied SVG.
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
