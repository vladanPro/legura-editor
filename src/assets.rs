//! Versioned editor integration assets, embedded from the canonical sources.

pub const BUNDLE_VERSION: u32 = 1;
pub const PACKAGE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Copy)]
pub struct Asset {
    pub path: &'static str,
    pub content: &'static str,
}

pub fn assets() -> &'static [Asset] {
    &[
        Asset {
            path: "components/RichTextEditor.asx",
            content: include_str!("components/RichTextEditor.asx"),
        },
        Asset {
            path: "public/editor.css",
            content: include_str!("css/editor.css"),
        },
        Asset {
            path: "public/rich-text-editor.js",
            content: include_str!("js/rich-text-editor.js"),
        },
        Asset {
            path: "public/formatting-editor.js",
            content: include_str!("js/formatting-editor.js"),
        },
        Asset {
            path: "public/paragraph-editor.js",
            content: include_str!("js/paragraph-editor.js"),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[test]
    fn bundle_is_complete_portable_and_has_no_duplicate_paths() {
        let mut paths = BTreeSet::new();
        for asset in assets() {
            assert!(paths.insert(asset.path));
            assert!(!asset.content.is_empty());
            assert!(asset
                .path
                .split('/')
                .all(|part| !part.is_empty() && part != "." && part != ".."));
            assert!(!asset.path.contains(['\\', ':']));
        }
        assert_eq!(paths.len(), 5);
        for asset in assets().iter().filter(|asset| asset.path.ends_with(".js")) {
            for line in asset
                .content
                .lines()
                .filter(|line| line.starts_with("import "))
            {
                let relative = line
                    .split("from './")
                    .nth(1)
                    .unwrap()
                    .split('\'')
                    .next()
                    .unwrap();
                assert!(paths.contains(format!("public/{relative}").as_str()));
            }
        }
        assert!(assets()[0].content.contains("return ASX"));
    }
}
