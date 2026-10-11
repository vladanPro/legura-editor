import assert from 'node:assert/strict';
import { pasteFixture } from './clipboard-fixture.mjs';

export async function checkLinks(page, baseUrl) {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${baseUrl}/examples/richtext.html`);
  await page.waitForFunction(() => window.richtextHandle);
  const surface = page.locator('[data-editor-preview]');
  const field = page.locator('[data-editor-document]');
  const address = page.getByRole('textbox', { name: 'Link address' });
  const contentBox = await surface.boundingBox();
  const addressBox = await address.boundingBox();
  assert.ok(addressBox.y >= contentBox.y + contentBox.height, 'Link address belongs below the content');
  const command = name => page.getByRole('button', { name, exact: true }).click();
  const doc = async () => JSON.parse(await field.inputValue());
  const select = async (start, end = start) => surface.evaluate((node, [start, end]) => {
    node.focus();
    const point = offset => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) {
        if (offset <= text.length) return [text, offset];
        offset -= text.length;
      }
      return [node, 0];
    };
    const range = document.createRange();
    range.setStart(...point(start)); range.setEnd(...point(end));
    const selection = document.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, [start, end]);
  await surface.focus();
  await surface.pressSequentially('Read more');
  await select(0, 4);
  await command('Bold');
  await address.fill('https://example.com/?a=1&b="quoted"');
  await command('Apply link');
  assert.equal(await surface.locator('a strong').textContent(), 'Read');
  assert.equal(await surface.locator('a').getAttribute('href'), 'https://example.com/?a=1&b="quoted"');
  assert.equal(await surface.locator('a').evaluate(node => getComputedStyle(node).textDecorationLine.includes('underline')), true);
  const linked = await field.inputValue();
  await command('Undo');
  assert.equal(await surface.locator('a').count(), 0);
  await command('Redo');
  assert.equal(await field.inputValue(), linked);
  await select(0, 4);
  await address.fill('javascript:alert(1)');
  await command('Apply link');
  assert.equal(await field.inputValue(), linked);
  assert.equal(await field.isDisabled(), false, 'Invalid URL does not invalidate existing content');
  assert.match(await page.locator('[data-editor-error]').textContent(), /HTTP/);
  assert.equal(await page.locator('form').evaluate(form => form.checkValidity()), true);
  const rejected = await page.evaluate(async () => {
    const { validateLink } = await import('/src/js/paragraph-editor.js');
    return ['//example.com', '/posts', 'https://@example.com', 'https:///example.com', 'https://u:p@example.com', 'data:text/html,hi', 'https://example.com\\path', 'https://example.com/\u0085path', `https://example.com/${'a'.repeat(2048)}`].every(value => {
      try { validateLink(value); return false; } catch { return true; }
    });
  });
  assert.equal(rejected, true);
  await select(1, 3);
  await address.fill('https://other.example/posts');
  await command('Apply link');
  assert.deepEqual((await doc()).blocks[0].children.slice(0, 3).map(run => run.link),
    ['https://example.com/?a=1&b="quoted"', 'https://other.example/posts', 'https://example.com/?a=1&b="quoted"']);
  await command('Undo');
  await select(2);
  await surface.pressSequentially('X');
  assert.equal((await doc()).blocks[0].children[0].text, 'ReXad');
  assert.equal((await doc()).blocks[0].children[0].link, 'https://example.com/?a=1&b="quoted"');
  await select(5);
  await surface.pressSequentially('!');
  assert.equal((await doc()).blocks[0].children[1].link, undefined, 'Typing at the link boundary stays unlinked');
  await select(0, 5);
  await command('Italic');
  assert.equal(await surface.locator('a strong em').textContent(), 'ReXad');
  await command('Remove link');
  assert.equal(await surface.locator('a').count(), 0);
  await command('Undo');
  assert.equal(await surface.locator('a').count(), 1);
  await surface.locator('a').click();
  assert.equal(page.url(), `${baseUrl}/examples/richtext.html`, 'Editor anchors do not navigate');

  const saved = await field.inputValue();
  await page.evaluate(async source => {
    window.richtextHandle.destroy();
    const root = document.querySelector('[data-legura-editor]');
    root.dataset.document = source;
    const { mountRichTextEditor } = await import('/src/js/rich-text-editor.js');
    window.richtextHandle = mountRichTextEditor(root);
  }, saved);
  assert.equal(await field.inputValue(), saved);
  await select(0, 5);
  await command('Bullets');
  assert.equal(await surface.locator('ul li a').count(), 1);
  await command('H2');
  assert.equal(await surface.locator('h2 a').count(), 1);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await field.inputValue(), saved);
  await select(1);
  await surface.evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  assert.equal(await address.isDisabled(), true);
  assert.equal(await field.isDisabled(), true);
  await surface.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { data: '🙂', bubbles: true })));
  assert.equal((await doc()).blocks[0].children[0].text, 'R🙂eXad');
  assert.equal((await doc()).blocks[0].children[0].link, 'https://example.com/?a=1&b="quoted"');
  await command('Undo');
  assert.equal(await field.inputValue(), saved);
  await select(2);
  await surface.evaluate(pasteFixture, { text: '<b>literal</b>' });
  assert.equal(await surface.locator('b').count(), 0);
  assert.match((await doc()).blocks[0].children[0].text, /<b>literal<\/b>/);
  assert.equal((await doc()).blocks[0].children[0].link, 'https://example.com/?a=1&b="quoted"');
  await command('Undo');
  assert.equal(await field.inputValue(), saved);
  await select(0, 5);
  await address.fill('https://keyboard.example');
  await address.press('Enter');
  assert.equal((await doc()).blocks[0].children[0].link, 'https://keyboard.example');
  await command('Undo');
  assert.equal(await field.inputValue(), saved);
  if (process.env.EDITOR_LINKS_SCREENSHOT_PATH) await page.screenshot({ path: process.env.EDITOR_LINKS_SCREENSHOT_PATH });
  await page.setViewportSize({ width: 320, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  const multi = JSON.stringify({ format: 'legura-richtext', version: 1, blocks: [
    { type: 'heading', level: 2, children: [{ text: '🙂Title', marks: ['bold'] }] },
    { type: 'list-item', list: 'unordered', children: [{ text: 'Item', marks: [] }] },
  ] });
  await page.evaluate(async source => {
    window.richtextHandle.destroy();
    const root = document.querySelector('[data-legura-editor]');
    root.dataset.document = source;
    const { mountRichTextEditor } = await import('/src/js/rich-text-editor.js');
    window.richtextHandle = mountRichTextEditor(root);
  }, multi);
  await surface.evaluate(node => {
    node.focus();
    const blocks = node.querySelectorAll('[data-editor-block]');
    const range = document.createRange();
    range.setStart(blocks[0].querySelector('strong').firstChild, 0);
    range.setEnd(blocks[1].firstChild, 4);
    const selection = document.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await address.fill('https://example.com/cross-block');
  await command('Apply link');
  assert.equal(await surface.locator('h2 a strong').textContent(), '🙂Title');
  assert.equal(await surface.locator('ul li a').textContent(), 'Item');
  assert.equal((await doc()).blocks.length, 2);
  assert.ok((await doc()).blocks.every(block => block.children[0].link === 'https://example.com/cross-block'));
  await command('Undo');
  assert.equal(await field.inputValue(), multi);
  await command('Redo');
  await command('Remove link');
  assert.equal(await field.inputValue(), multi);

  const emptyLink = JSON.stringify({ format: 'legura-richtext', version: 1, blocks: [
    { type: 'paragraph', children: [{ text: '', marks: [], link: 'https://example.com' }] },
  ] });
  await page.evaluate(async source => {
    window.richtextHandle.destroy();
    const root = document.querySelector('[data-legura-editor]');
    root.dataset.document = source;
    const { mountRichTextEditor } = await import('/src/js/rich-text-editor.js');
    window.richtextHandle = mountRichTextEditor(root);
  }, emptyLink);
  assert.equal(await field.isDisabled(), true, 'Empty linked runs are refused, not silently dropped');
  assert.equal(await page.locator('[data-legura-editor]').getAttribute('data-document'), emptyLink);

  await page.goto(`${baseUrl}/examples/formatting.html`);
  await page.waitForFunction(() => window.formattingHandle);
  await page.evaluate(async source => {
    window.formattingHandle.destroy();
    const root = document.querySelector('[data-legura-editor="formatting"]');
    root.dataset.document = source;
    const { mountFormattingEditor } = await import('/src/js/formatting-editor.js');
    mountFormattingEditor(root);
  }, saved);
  const legacy = page.locator('[data-legura-editor="formatting"]').first();
  assert.equal(await legacy.locator('[data-editor-document]').isDisabled(), true);
  assert.equal(await legacy.getAttribute('data-document'), saved);
  console.log('Links passed: selection, apply/remove, marks, URL refusal, typing boundaries, history, reload/reset, block conversion, no navigation, mobile and legacy refusal.');
}
