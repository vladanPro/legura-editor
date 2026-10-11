// Test tooling only: reuse an explicitly supplied Playwright installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFormatting } from './formatting-checks.mjs';
import { checkRichText } from './richtext-checks.mjs';

const tooling = process.argv[2];
assert.ok(tooling, 'Pass the directory containing the test-only Playwright install');
const { chromium } = createRequire(resolve(tooling, 'package.json'))('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const files = new Map([
  ['/examples/paragraphs.html', 'text/html'],
  ['/examples/formatting.html', 'text/html'],
  ['/examples/richtext.html', 'text/html'],
  ['/src/js/rich-text-editor.js', 'text/javascript'],
  ['/src/js/formatting-editor.js', 'text/javascript'],
  ['/src/js/paragraph-editor.js', 'text/javascript'],
  ['/src/css/editor.css', 'text/css'],
]);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (!files.has(path)) { response.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(resolve(root, '.' + path));
    response.writeHead(200, { 'Content-Type': files.get(path) }).end(bytes);
  } catch { response.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const url = `http://127.0.0.1:${server.address().port}/examples/paragraphs.html`;
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  const first = page.getByLabel('First document');
  const second = page.getByLabel('Second document');
  await page.waitForFunction(() => window.editorHandles?.length === 2);
  await first.fill('Hello <script>alert(1)</script>\nČuvanje 🙂');
  await second.fill('Independent document');
  await page.locator('#first button').click();
  const output = JSON.parse(await page.locator('#first [data-result]').textContent());
  assert.equal(output.blocks.length, 2);
  assert.equal(output.blocks[0].children[0].text, 'Hello <script>alert(1)</script>');
  assert.equal(await second.inputValue(), 'Independent document');
  assert.equal(await page.locator('[data-result] script').count(), 0);
  await first.fill(Array(257).fill('paragraph').join('\n'));
  assert.equal(await page.locator('#first [data-editor-document]').isDisabled(), true);
  assert.match(await page.locator('#first [data-editor-error]').textContent(), /structure/);
  await first.fill('Recovered');
  assert.equal(await page.locator('#first [data-editor-document]').isDisabled(), false);
  await page.locator('#first button').click();
  assert.equal(JSON.parse(await page.locator('#first [data-result]').textContent()).blocks[0].children[0].text, 'Recovered');
  await page.evaluate(() => document.querySelector('#first').reset());
  assert.equal(await first.inputValue(), '');
  await first.focus();
  await first.pressSequentially('native undo');
  await first.press('Control+z');
  assert.equal(await first.inputValue(), '');
  await first.press('Control+Shift+z');
  assert.equal(await first.inputValue(), 'native undo');
  await page.evaluate(() => window.editorHandles[0].destroy());
  assert.equal(await first.getAttribute('readonly'), '');
  assert.equal(await page.locator('#first [data-editor-document]').isDisabled(), true);
  await page.evaluate(async () => {
    const root = document.querySelector('#first [data-legura-editor]');
    root.dataset.document = JSON.stringify({ format: 'legura-richtext', version: 2, blocks: [] });
    const { mountParagraphEditor } = await import('/src/js/paragraph-editor.js');
    window.failedHandle = mountParagraphEditor(root);
  });
  assert.match(await page.locator('#first [data-editor-error]').textContent(), /cannot be edited safely/);
  assert.equal(await page.locator('#first [data-editor-document]').isDisabled(), true);
  await page.evaluate(async () => {
    window.failedHandle.destroy();
    const root = document.querySelector('#first [data-legura-editor]');
    const formatted = { format: 'legura-richtext', version: 1, blocks: [
      { type: 'paragraph', children: [{ text: 'Keep formatting', marks: ['bold', 'italic'] }] },
    ] };
    root.dataset.document = JSON.stringify(formatted);
    window.formattedSource = root.dataset.document;
    const { mountParagraphEditor } = await import('/src/js/paragraph-editor.js');
    window.failedHandle = mountParagraphEditor(root);
  });
  assert.equal(await page.locator('#first [data-editor-document]').isDisabled(), true);
  assert.equal(await first.getAttribute('readonly'), '');
  assert.equal(await page.evaluate(() => document.querySelector('#first [data-legura-editor]').dataset.document === window.formattedSource), true);
  await page.setViewportSize({ width: 320, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noJs.newPage();
  await fallback.goto(url);
  assert.equal(await fallback.locator('[data-editor-document]:enabled').count(), 0);
  assert.equal(await fallback.locator('[data-editor-input]:not([readonly])').count(), 0);
  assert.equal(await fallback.locator('button:enabled').count(), 0);
  await fallback.goto(`http://127.0.0.1:${server.address().port}/examples/formatting.html`);
  assert.equal(await fallback.locator('[data-editor-document]:enabled').count(), 0);
  assert.equal(await fallback.locator('[data-editor-command]:enabled').count(), 0);
  assert.equal(await fallback.locator('textarea:not([readonly])').count(), 0);
  await fallback.goto(`http://127.0.0.1:${server.address().port}/examples/richtext.html`);
  assert.equal(await fallback.locator('[contenteditable="true"]').count(), 0);
  assert.equal(await fallback.locator('[data-editor-document]:enabled').count(), 0);
  await noJs.close();
  await checkFormatting(page, `http://127.0.0.1:${server.address().port}`);
  await checkRichText(page, `http://127.0.0.1:${server.address().port}`);
  assert.deepEqual(errors, []);
  console.log('Paragraph browser pilot passed: isolated instances, literal paste/input, JSON, limits/retry, reset, undo/redo, teardown, unsupported document refusal, mobile and no-JS fallback.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
