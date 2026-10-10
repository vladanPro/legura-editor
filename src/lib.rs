//! Bounded paragraph/text documents. Rendering accepts only validated documents.

use serde::{Deserialize, Serialize};
use std::fmt;

pub const MAX_JSON_BYTES: usize = 32 * 1024;
pub const MAX_BLOCKS: usize = 256;
pub const MAX_RUNS: usize = 512;
pub const MAX_TEXT_CHARS: usize = 20_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DocumentError {
    TooLarge,
    InvalidStructure,
    UnsupportedVersion,
    InvalidBlockCount,
    InvalidRunCount,
    TooMuchText,
    InvalidText,
    InvalidMarks,
}

impl fmt::Display for DocumentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TooLarge => "Document exceeds the JSON byte limit",
            Self::InvalidStructure => "Invalid or unsupported document structure",
            Self::UnsupportedVersion => "Unsupported document version",
            Self::InvalidBlockCount => "Document requires between 1 and 256 paragraphs",
            Self::InvalidRunCount => "Each paragraph requires text; document run limit is 512",
            Self::TooMuchText => "Document exceeds the text character limit",
            Self::InvalidText => "Document contains unsupported control characters",
            Self::InvalidMarks => "Text marks must be unique bold or italic values",
        })
    }
}

impl std::error::Error for DocumentError {}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct RawDocument {
    format: Format,
    version: u32,
    blocks: Vec<Paragraph>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
enum Format {
    #[serde(rename = "legura-richtext")]
    RichText,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Paragraph {
    #[serde(rename = "type")]
    kind: ParagraphKind,
    children: Vec<TextRun>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
enum ParagraphKind {
    #[serde(rename = "paragraph")]
    Paragraph,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct TextRun {
    text: String,
    marks: Vec<Mark>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Mark {
    Bold,
    Italic,
}

/// Immutable proof that a document passed server-side validation.
/// There is deliberately no Deserialize implementation or public raw constructor.
#[derive(Debug, Clone)]
pub struct Document(RawDocument);

impl Document {
    pub fn parse_json(input: &str) -> Result<Self, DocumentError> {
        if input.len() > MAX_JSON_BYTES {
            return Err(DocumentError::TooLarge);
        }
        let mut raw: RawDocument =
            serde_json::from_str(input).map_err(|_| DocumentError::InvalidStructure)?;
        if raw.version != 1 {
            return Err(DocumentError::UnsupportedVersion);
        }
        if raw.blocks.is_empty() || raw.blocks.len() > MAX_BLOCKS {
            return Err(DocumentError::InvalidBlockCount);
        }
        let mut runs = 0;
        let mut chars = 0;
        for block in &mut raw.blocks {
            runs += block.children.len();
            if block.children.is_empty() || runs > MAX_RUNS {
                return Err(DocumentError::InvalidRunCount);
            }
            for run in &mut block.children {
                if run.marks.len() > 2 || (run.marks.len() == 2 && run.marks[0] == run.marks[1]) {
                    return Err(DocumentError::InvalidMarks);
                }
                // Stable mark order makes equivalent combinations serialize/render identically.
                run.marks.sort_unstable();
                for character in run.text.chars() {
                    if character.is_control() && !matches!(character, '\n' | '\r' | '\t') {
                        return Err(DocumentError::InvalidText);
                    }
                    chars += 1;
                    if chars > MAX_TEXT_CHARS {
                        return Err(DocumentError::TooMuchText);
                    }
                }
            }
        }
        Ok(Self(raw))
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(&self.0)
    }

    /// Fixed tags plus escaped text only; no submitted attributes or raw HTML.
    pub fn render_html(&self) -> String {
        let mut html = String::new();
        for block in &self.0.blocks {
            html.push_str("<p>");
            for run in &block.children {
                if run.marks.contains(&Mark::Bold) {
                    html.push_str("<strong>");
                }
                if run.marks.contains(&Mark::Italic) {
                    html.push_str("<em>");
                }
                for character in run.text.chars() {
                    match character {
                        '&' => html.push_str("&amp;"),
                        '<' => html.push_str("&lt;"),
                        '>' => html.push_str("&gt;"),
                        '"' => html.push_str("&quot;"),
                        '\'' => html.push_str("&#39;"),
                        _ => html.push(character),
                    }
                }
                if run.marks.contains(&Mark::Italic) {
                    html.push_str("</em>");
                }
                if run.marks.contains(&Mark::Bold) {
                    html.push_str("</strong>");
                }
            }
            html.push_str("</p>");
        }
        html
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn input(text: &str) -> String {
        json!({"format":"legura-richtext","version":1,"blocks":[
            {"type":"paragraph","children":[{"text":text,"marks":[]}]}
        ]})
        .to_string()
    }

    #[test]
    fn inline_marks_are_safe_canonical_and_round_trip() {
        for (marks, expected) in [
            (json!([]), "<p>&lt;b&gt;&amp;</p>"),
            (json!(["bold"]), "<p><strong>&lt;b&gt;&amp;</strong></p>"),
            (json!(["italic"]), "<p><em>&lt;b&gt;&amp;</em></p>"),
            (
                json!(["italic", "bold"]),
                "<p><strong><em>&lt;b&gt;&amp;</em></strong></p>",
            ),
        ] {
            let mut raw: serde_json::Value = serde_json::from_str(&input("<b>&")).unwrap();
            raw["blocks"][0]["children"][0]["marks"] = marks;
            let doc = Document::parse_json(&raw.to_string()).unwrap();
            assert_eq!(doc.render_html(), expected);
            let serialized = doc.to_json().unwrap();
            assert_eq!(
                Document::parse_json(&serialized).unwrap().render_html(),
                expected
            );
            if expected.contains("<strong><em>") {
                assert!(serialized.contains("\"marks\":[\"bold\",\"italic\"]"));
            }
        }
        let raw = json!({"format":"legura-richtext","version":1,"blocks":[
            {"type":"paragraph","children":[
                {"text":"A","marks":["bold"]},
                {"text":"B","marks":[]},
                {"text":"C","marks":["italic"]}
            ]},
            {"type":"paragraph","children":[{"text":"D","marks":[]}]}
        ]});
        assert_eq!(
            Document::parse_json(&raw.to_string())
                .unwrap()
                .render_html(),
            "<p><strong>A</strong>B<em>C</em></p><p>D</p>"
        );
    }

    #[test]
    fn rejects_duplicate_and_non_enum_marks() {
        for marks in [
            json!(["bold", "bold"]),
            json!(["italic", "italic"]),
            json!(["bold", "italic", "bold"]),
        ] {
            let mut raw: serde_json::Value = serde_json::from_str(&input("private text")).unwrap();
            raw["blocks"][0]["children"][0]["marks"] = marks;
            assert_eq!(
                Document::parse_json(&raw.to_string()).unwrap_err(),
                DocumentError::InvalidMarks
            );
        }
        for marks in [
            json!(["Bold"]),
            json!(["script"]),
            json!([{"type":"bold"}]),
            json!([null]),
            json!("bold"),
        ] {
            let mut raw: serde_json::Value = serde_json::from_str(&input("private text")).unwrap();
            raw["blocks"][0]["children"][0]["marks"] = marks;
            let error = Document::parse_json(&raw.to_string()).unwrap_err();
            assert_eq!(error, DocumentError::InvalidStructure);
            assert!(!error.to_string().contains("private text"));
        }
    }

    #[test]
    fn safe_render_and_lossless_round_trip() {
        let source = input("Ćao <script>alert('x')</script> & \"test\"\n🙂");
        let doc = Document::parse_json(&source).unwrap();
        assert_eq!(
            doc.render_html(),
            "<p>Ćao &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;test&quot;\n🙂</p>"
        );
        let encoded = doc.to_json().unwrap();
        assert_eq!(
            Document::parse_json(&encoded).unwrap().render_html(),
            doc.render_html()
        );
    }

    #[test]
    fn rejects_versions_unknown_fields_and_features() {
        for (pointer, value) in [
            ("/format", json!("html")),
            ("/blocks/0/type", json!("heading")),
            ("/blocks/0/children/0/marks", json!(["underline"])),
        ] {
            let mut raw: serde_json::Value = serde_json::from_str(&input("hello")).unwrap();
            *raw.pointer_mut(pointer).unwrap() = value;
            assert_eq!(
                Document::parse_json(&raw.to_string()).unwrap_err(),
                DocumentError::InvalidStructure
            );
        }
        let mut raw: serde_json::Value = serde_json::from_str(&input("hello")).unwrap();
        raw["version"] = json!(2);
        assert_eq!(
            Document::parse_json(&raw.to_string()).unwrap_err(),
            DocumentError::UnsupportedVersion
        );
        for pointer in ["", "/blocks/0", "/blocks/0/children/0"] {
            let mut raw: serde_json::Value = serde_json::from_str(&input("hello")).unwrap();
            raw.pointer_mut(pointer).unwrap()["onclick"] = json!("secret payload");
            let error = Document::parse_json(&raw.to_string()).unwrap_err();
            assert_eq!(error, DocumentError::InvalidStructure);
            assert!(!error.to_string().contains("secret payload"));
        }
    }

    #[test]
    fn rejects_missing_duplicate_and_trailing_data() {
        for source in ["{}", "null", "[]", "{\"version\":1,\"version\":1}"] {
            assert!(Document::parse_json(source).is_err());
        }
        assert!(Document::parse_json(&(input("hello") + "{}")).is_err());
        assert!(Document::parse_json(&input("hello").replace("\"marks\":[],", "")).is_err());
    }

    #[test]
    fn byte_and_text_limits() {
        assert_eq!(
            Document::parse_json(&" ".repeat(MAX_JSON_BYTES + 1)).unwrap_err(),
            DocumentError::TooLarge
        );
        Document::parse_json(&input(&"x".repeat(MAX_TEXT_CHARS))).unwrap();
        assert_eq!(
            Document::parse_json(&input(&"x".repeat(MAX_TEXT_CHARS + 1))).unwrap_err(),
            DocumentError::TooMuchText
        );
        assert_eq!(
            Document::parse_json(&input("\0")).unwrap_err(),
            DocumentError::InvalidText
        );
    }

    #[test]
    fn block_and_run_limits_and_empty_paragraph() {
        let mut raw: serde_json::Value = serde_json::from_str(&input("")).unwrap();
        assert_eq!(
            Document::parse_json(&raw.to_string())
                .unwrap()
                .render_html(),
            "<p></p>"
        );
        raw["blocks"] = json!([]);
        assert_eq!(
            Document::parse_json(&raw.to_string()).unwrap_err(),
            DocumentError::InvalidBlockCount
        );
        raw["blocks"] = json!(vec![
            json!({"type":"paragraph","children":[{"text":"","marks":[]}]});
            MAX_BLOCKS + 1
        ]);
        assert_eq!(
            Document::parse_json(&raw.to_string()).unwrap_err(),
            DocumentError::InvalidBlockCount
        );
        raw["blocks"] = json!([{"type":"paragraph","children":[]}]);
        assert_eq!(
            Document::parse_json(&raw.to_string()).unwrap_err(),
            DocumentError::InvalidRunCount
        );
        raw["blocks"] =
            json!([{"type":"paragraph","children":vec![json!({"text":"","marks":[]}); MAX_RUNS]}]);
        Document::parse_json(&raw.to_string()).unwrap();
        raw["blocks"][0]["children"]
            .as_array_mut()
            .unwrap()
            .push(json!({"text":"","marks":[]}));
        assert_eq!(
            Document::parse_json(&raw.to_string()).unwrap_err(),
            DocumentError::InvalidRunCount
        );
    }
}
