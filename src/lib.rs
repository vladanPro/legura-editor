//! Bounded text block documents. Rendering accepts only validated documents.

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
    InvalidHeadingLevel,
    InvalidLink,
}

impl fmt::Display for DocumentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TooLarge => "Document exceeds the JSON byte limit",
            Self::InvalidStructure => "Invalid or unsupported document structure",
            Self::UnsupportedVersion => "Unsupported document version",
            Self::InvalidBlockCount => "Document requires between 1 and 256 text blocks",
            Self::InvalidRunCount => "Each block requires text; document run limit is 512",
            Self::TooMuchText => "Document exceeds the text character limit",
            Self::InvalidText => "Document contains unsupported control characters",
            Self::InvalidMarks => "Text marks must be unique bold or italic values",
            Self::InvalidHeadingLevel => "Heading level must be 2 or 3",
            Self::InvalidLink => {
                "Link must be a bounded absolute HTTP or HTTPS URL without credentials"
            }
        })
    }
}

impl std::error::Error for DocumentError {}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct RawDocument {
    format: Format,
    version: u32,
    blocks: Vec<Block>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
enum Format {
    #[serde(rename = "legura-richtext")]
    RichText,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
enum Block {
    Paragraph {
        children: Vec<TextRun>,
    },
    Heading {
        level: u8,
        children: Vec<TextRun>,
    },
    ListItem {
        list: ListKind,
        children: Vec<TextRun>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum ListKind {
    Unordered,
    Ordered,
}

impl ListKind {
    fn open(self) -> &'static str {
        match self {
            Self::Unordered => "<ul>",
            Self::Ordered => "<ol>",
        }
    }
    fn close(self) -> &'static str {
        match self {
            Self::Unordered => "</ul>",
            Self::Ordered => "</ol>",
        }
    }
}

impl Block {
    fn children(&self) -> &[TextRun] {
        match self {
            Self::Paragraph { children }
            | Self::Heading { children, .. }
            | Self::ListItem { children, .. } => children,
        }
    }

    fn children_mut(&mut self) -> &mut [TextRun] {
        match self {
            Self::Paragraph { children }
            | Self::Heading { children, .. }
            | Self::ListItem { children, .. } => children,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct TextRun {
    text: String,
    marks: Vec<Mark>,
    #[serde(
        default,
        deserialize_with = "deserialize_link",
        skip_serializing_if = "Option::is_none"
    )]
    link: Option<String>,
}

fn deserialize_link<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    String::deserialize(deserializer).map(Some)
}

fn valid_link(link: &str) -> bool {
    if link.is_empty()
        || link.len() > 2048
        || link
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || c == '\\')
    {
        return false;
    }
    let Ok(parsed) = url::Url::parse(link) else {
        return false;
    };
    let authority = link
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or(""));
    matches!(parsed.scheme(), "http" | "https")
        && parsed.host_str().is_some()
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && authority.is_some_and(|value| !value.is_empty() && !value.contains('@'))
        && (link.starts_with("https://") || link.starts_with("http://"))
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
            if matches!(block, Block::Heading { level, .. } if !matches!(level, 2 | 3)) {
                return Err(DocumentError::InvalidHeadingLevel);
            }
            runs += block.children().len();
            if block.children().is_empty() || runs > MAX_RUNS {
                return Err(DocumentError::InvalidRunCount);
            }
            for run in block.children_mut() {
                if run.link.as_deref().is_some_and(|link| !valid_link(link)) {
                    return Err(DocumentError::InvalidLink);
                }
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

    /// Search/legacy projection, not a rich-text editing or persistence fallback.
    pub fn plain_text(&self) -> String {
        self.0
            .blocks
            .iter()
            .map(|block| {
                block
                    .children()
                    .iter()
                    .map(|run| run.text.as_str())
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Fixed tags plus escaped text only; no submitted attributes or raw HTML.
    pub fn render_html(&self) -> String {
        let mut html = String::new();
        let mut current_list: Option<ListKind> = None;
        for block in &self.0.blocks {
            let next_list = match block {
                Block::ListItem { list, .. } => Some(*list),
                _ => None,
            };
            if current_list != next_list {
                if let Some(list) = current_list {
                    html.push_str(list.close());
                }
                if let Some(list) = next_list {
                    html.push_str(list.open());
                }
                current_list = next_list;
            }
            let (open, close) = match block {
                Block::Paragraph { .. } => ("<p>", "</p>"),
                Block::Heading { level: 2, .. } => ("<h2>", "</h2>"),
                Block::Heading { .. } => ("<h3>", "</h3>"),
                Block::ListItem { .. } => ("<li>", "</li>"),
            };
            html.push_str(open);
            for run in block.children() {
                if let Some(link) = &run.link {
                    html.push_str("<a href=\"");
                    escape_html(&mut html, link);
                    html.push_str("\" rel=\"nofollow ugc\">");
                }
                if run.marks.contains(&Mark::Bold) {
                    html.push_str("<strong>");
                }
                if run.marks.contains(&Mark::Italic) {
                    html.push_str("<em>");
                }
                escape_html(&mut html, &run.text);
                if run.marks.contains(&Mark::Italic) {
                    html.push_str("</em>");
                }
                if run.marks.contains(&Mark::Bold) {
                    html.push_str("</strong>");
                }
                if run.link.is_some() {
                    html.push_str("</a>");
                }
            }
            html.push_str(close);
        }
        if let Some(list) = current_list {
            html.push_str(list.close());
        }
        html
    }
}

fn escape_html(html: &mut String, text: &str) {
    for character in text.chars() {
        match character {
            '&' => html.push_str("&amp;"),
            '<' => html.push_str("&lt;"),
            '>' => html.push_str("&gt;"),
            '"' => html.push_str("&quot;"),
            '\'' => html.push_str("&#39;"),
            _ => html.push(character),
        }
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
    fn plain_text_projection_preserves_text_and_block_boundaries() {
        let raw = json!({"format":"legura-richtext","version":1,"blocks":[
            {"type":"heading","level":2,"children":[{"text":"Title","marks":["bold"]}]},
            {"type":"list-item","list":"unordered","children":[{"text":"🙂<literal>","marks":[],"link":"https://example.com"}]},
            {"type":"paragraph","children":[{"text":"","marks":[]}]},
            {"type":"paragraph","children":[{"text":"First ","marks":[]},{"text":"second","marks":["italic"]}]}
        ]}).to_string();
        assert_eq!(
            Document::parse_json(&raw).unwrap().plain_text(),
            "Title\n🙂<literal>\n\nFirst second"
        );
    }

    #[test]
    fn links_are_escaped_and_round_trip_with_marks() {
        let raw = json!({"format":"legura-richtext","version":1,"blocks":[
            {"type":"paragraph","children":[{"text":"<Read>","marks":["bold","italic"],"link":"https://example.com/?a=1&b=\"quoted\""}]}
        ]}).to_string();
        let doc = Document::parse_json(&raw).unwrap();
        let html = "<p><a href=\"https://example.com/?a=1&amp;b=&quot;quoted&quot;\" rel=\"nofollow ugc\"><strong><em>&lt;Read&gt;</em></strong></a></p>";
        assert_eq!(doc.render_html(), html);
        assert_eq!(
            Document::parse_json(&doc.to_json().unwrap())
                .unwrap()
                .render_html(),
            html
        );
        assert!(!Document::parse_json(&input("plain"))
            .unwrap()
            .to_json()
            .unwrap()
            .contains("link"));
    }

    #[test]
    fn unsafe_links_are_rejected_without_echoing_the_destination() {
        for link in [
            "javascript:private",
            "data:text/html,private",
            "//example.com",
            "/posts",
            "https://user:private@example.com",
            "https://example.com\\private",
            " https://example.com",
            "https://example.com/\nprivate",
            "https:example.com",
            "ftp://example.com",
            "",
            "https://",
        ] {
            let mut raw: serde_json::Value = serde_json::from_str(&input("text")).unwrap();
            raw["blocks"][0]["children"][0]["link"] = json!(link);
            let error = Document::parse_json(&raw.to_string()).unwrap_err();
            assert_eq!(error, DocumentError::InvalidLink);
            assert!(!error.to_string().contains("private"));
        }
        for link in [
            serde_json::Value::Null,
            json!(true),
            json!({"href":"https://example.com"}),
        ] {
            let mut raw: serde_json::Value = serde_json::from_str(&input("text")).unwrap();
            raw["blocks"][0]["children"][0]["link"] = link;
            assert_eq!(
                Document::parse_json(&raw.to_string()).unwrap_err(),
                DocumentError::InvalidStructure
            );
        }
        let mut raw: serde_json::Value = serde_json::from_str(&input("text")).unwrap();
        raw["blocks"][0]["children"][0]["link"] =
            json!(format!("https://example.com/{}", "a".repeat(2048)));
        assert_eq!(
            Document::parse_json(&raw.to_string()).unwrap_err(),
            DocumentError::InvalidLink
        );
    }

    #[test]
    fn url_policy_is_closed_and_shared_across_text_blocks() {
        for link in [
            "https://@example.com",
            "https:///example.com",
            "HTTPS://example.com",
            "https://example.com/\tpath",
            "https://example.com/\u{0085}path",
            "https://[broken",
            "https://example.com:bad",
        ] {
            assert!(!valid_link(link), "accepted an unsupported URL");
        }
        for link in [
            "https://example.com",
            "http://localhost:3940/posts",
            "https://[::1]:3940/posts",
            "https://example.com/path?q=hello%20world#section",
            "https://example.com/članak",
        ] {
            assert!(valid_link(link), "rejected a supported URL");
        }
        let children = json!([{"text":"Link","marks":[],"link":"https://example.com"}]);
        for block in [
            json!({"type":"paragraph","children":children}),
            json!({"type":"heading","level":2,"children":children}),
            json!({"type":"list-item","list":"ordered","children":children}),
        ] {
            let raw = json!({"format":"legura-richtext","version":1,"blocks":[block]}).to_string();
            assert!(Document::parse_json(&raw)
                .unwrap()
                .render_html()
                .contains("<a href="));
        }
        let raw = json!({"format":"legura-richtext","version":1,"blocks":[
            {"type":"paragraph","children":[{"text":"text","marks":[],"link":"https://example.com","target":"_blank"}]}
        ]}).to_string();
        assert_eq!(
            Document::parse_json(&raw).unwrap_err(),
            DocumentError::InvalidStructure
        );
    }

    #[test]
    fn headings_render_safely_and_round_trip() {
        let raw = json!({"format":"legura-richtext","version":1,"blocks":[
            {"type":"heading","level":2,"children":[{"text":"<Title>&","marks":["italic","bold"]}]},
            {"type":"heading","level":3,"children":[{"text":"","marks":[]}]},
            {"type":"paragraph","children":[{"text":"Body","marks":[]}]}
        ]});
        let doc = Document::parse_json(&raw.to_string()).unwrap();
        let expected = "<h2><strong><em>&lt;Title&gt;&amp;</em></strong></h2><h3></h3><p>Body</p>";
        assert_eq!(doc.render_html(), expected);
        assert_eq!(
            Document::parse_json(&doc.to_json().unwrap())
                .unwrap()
                .render_html(),
            expected
        );
    }

    #[test]
    fn flat_lists_group_and_render_safely() {
        let item = |list: &str, text: &str| json!({"type":"list-item","list":list,"children":[{"text":text,"marks":["bold"]}]});
        let raw = json!({"format":"legura-richtext","version":1,"blocks":[
            item("unordered", "<A>"), item("unordered", "B"), item("ordered", "C"),
            {"type":"heading","level":2,"children":[{"text":"Break","marks":[]}]},
            item("ordered", "D"),
            {"type":"paragraph","children":[{"text":"Body","marks":[]}]},
            item("unordered", "")
        ]});
        let doc = Document::parse_json(&raw.to_string()).unwrap();
        let expected = "<ul><li><strong>&lt;A&gt;</strong></li><li><strong>B</strong></li></ul><ol><li><strong>C</strong></li></ol><h2>Break</h2><ol><li><strong>D</strong></li></ol><p>Body</p><ul><li><strong></strong></li></ul>";
        assert_eq!(doc.render_html(), expected);
        assert_eq!(
            Document::parse_json(&doc.to_json().unwrap())
                .unwrap()
                .render_html(),
            expected
        );
    }

    #[test]
    fn rejects_invalid_list_kinds_and_nested_lists() {
        for block in [
            json!({"type":"list-item","children":[{"text":"private","marks":[]}]}),
            json!({"type":"list-item","list":"script","children":[{"text":"private","marks":[]}]}),
            json!({"type":"list-item","list":true,"children":[{"text":"private","marks":[]}]}),
            json!({"type":"list-item","list":"ordered","level":2,"children":[{"text":"private","marks":[]}]}),
            json!({"type":"paragraph","list":"unordered","children":[{"text":"private","marks":[]}]}),
            json!({"type":"list-item","list":"unordered","children":[{"type":"list-item","list":"ordered","children":[]}]}),
        ] {
            let raw = json!({"format":"legura-richtext","version":1,"blocks":[block]});
            let error = Document::parse_json(&raw.to_string()).unwrap_err();
            assert_eq!(error, DocumentError::InvalidStructure);
            assert!(!error.to_string().contains("private"));
        }
    }

    #[test]
    fn rejects_invalid_heading_levels_and_fields() {
        let heading =
            json!({"type":"heading","level":2,"children":[{"text":"private","marks":[]}]});
        for level in [0, 1, 4, 6, 255] {
            let mut block = heading.clone();
            block["level"] = json!(level);
            let raw = json!({"format":"legura-richtext","version":1,"blocks":[block]});
            assert_eq!(
                Document::parse_json(&raw.to_string()).unwrap_err(),
                DocumentError::InvalidHeadingLevel
            );
        }
        for block in [
            json!({"type":"heading","children":[{"text":"private","marks":[]}]}),
            json!({"type":"heading","level":"2","children":[{"text":"private","marks":[]}]}),
            json!({"type":"heading","level":-1,"children":[{"text":"private","marks":[]}]}),
            json!({"type":"heading","level":2,"onclick":"evil()","children":[{"text":"private","marks":[]}]}),
            json!({"type":"paragraph","level":2,"children":[{"text":"private","marks":[]}]}),
        ] {
            let raw = json!({"format":"legura-richtext","version":1,"blocks":[block]});
            let error = Document::parse_json(&raw.to_string()).unwrap_err();
            assert_eq!(error, DocumentError::InvalidStructure);
            assert!(!error.to_string().contains("private"));
        }
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
