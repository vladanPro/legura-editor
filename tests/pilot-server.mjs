import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const uiRoot = resolve(process.env.AXONYX_UI_SOURCE || resolve(root, '../axonyx-ui'));
const files = new Map([
  ['/examples/paragraphs.html', 'text/html'],
  ['/examples/formatting.html', 'text/html'],
  ['/examples/richtext.html', 'text/html'],
  ['/src/js/rich-text-editor.js', 'text/javascript'],
  ['/src/js/formatting-editor.js', 'text/javascript'],
  ['/src/js/paragraph-editor.js', 'text/javascript'],
  ['/src/css/editor.css', 'text/css'],
]);

// Fixture projection only, not an ASX compiler. Use the actual component and
// UI icon sources to avoid a second, drifting copy of the toolbar in examples.
async function richTextFixture() {
  const source = await readFile(resolve(root, 'src/components/RichTextEditor.asx'), 'utf8');
  let markup = source.match(/return ASX \{([\s\S]*)\}\s*\}\s*$/)?.[1];
  assert.ok(markup, 'Expected the RichTextEditor ASX template');
  for (const match of source.matchAll(/import \{ (\w+) \} from "@axonyx\/ui\/foundry\/icons\/(\w+)"/g)) {
    assert.equal(match[1], match[2]);
    const icon = await readFile(resolve(uiRoot, 'src/foundry/icons', match[2] + '.asx'), 'utf8');
    const svg = icon.match(/<svg[\s\S]*?<\/svg>/)?.[0].replace('data-size={size}', 'data-size=""');
    assert.ok(svg, 'Missing Foundry SVG: ' + match[2]);
    markup = markup.replaceAll('<' + match[1] + ' />', svg);
  }
  const props = { name: 'content_document', label: 'Content', document: '', fallback: '' };
  markup = markup.replace(/\{(name|label|document|fallback)\}/g, (_, name) => props[name]);
  assert.ok(!markup.includes('{'), 'Fixture contains an unsupported dynamic expression');
  return markup;
}

export function createPilotServer() {
  return createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!files.has(path)) { response.writeHead(404).end(); return; }
    try {
      let bytes = await readFile(resolve(root, '.' + path));
      if (path === '/examples/richtext.html') {
        bytes = bytes.toString().replace('<!-- richtext-component -->', await richTextFixture());
      }
      response.writeHead(200, { 'Content-Type': files.get(path) }).end(bytes);
    } catch (error) {
      console.error(error);
      response.writeHead(500).end('Pilot source rendering failed');
    }
  });
}
