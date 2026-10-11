import assert from 'node:assert/strict';
import { pasteFixture } from './clipboard-fixture.mjs';

export async function checkLists(page, baseUrl, browserName) {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${baseUrl}/examples/richtext.html`);
  await page.waitForFunction(() => window.richtextHandle);
  const surface = page.locator('#richtext [data-editor-preview]');
  const field = page.locator('#richtext [data-editor-document]');
  const blocks = async () => JSON.parse(await field.inputValue()).blocks;
  const command = name => page.getByRole('button', { name, exact: true }).click();
  const select = async (first, start, last = first, end = start) => surface.evaluate((node, args) => {
    node.focus();
    const items = node.querySelectorAll('[data-editor-block]');
    const point = (index, offset) => {
      const block = items[index];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) {
        if (offset <= text.length) return [text, offset];
        offset -= text.length;
      }
      return [block, 0];
    };
    const [first, start, last, end] = args;
    const range = document.createRange();
    range.setStart(...point(first, start)); range.setEnd(...point(last, end));
    const selection = document.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, [first, start, last, end]);
  await surface.focus();
  await surface.pressSequentially('One');
  await select(0, 0, 0, 3);
  await command('Bold');
  await command('Bullets');
  assert.equal(await surface.locator('ul > li strong').textContent(), 'One');
  await select(0, 3);
  await surface.press('Enter');
  await surface.pressSequentially('Two');
  assert.deepEqual((await blocks()).map(block => block.list), ['unordered', 'unordered']);
  assert.equal(await surface.locator('ul').count(), 1);
  assert.equal(await surface.locator('ul > li').count(), 2);
  await surface.press('Enter');
  await surface.press('Enter');
  assert.equal((await blocks())[2].type, 'paragraph', 'Enter on an empty item exits the list without adding another block');
  await surface.press('Control+z');
  assert.equal((await blocks())[2].type, 'list-item');
  await surface.press('Control+Shift+z');
  assert.equal((await blocks())[2].type, 'paragraph');
  await surface.pressSequentially('Body');
  await select(0, 1, 1, 2);
  await command('Numbered');
  assert.deepEqual((await blocks()).slice(0, 2).map(block => block.list), ['ordered', 'ordered']);
  assert.equal(await surface.locator('ol > li strong').textContent(), 'One');
  await surface.press('Control+z');
  assert.equal(await surface.locator('ul > li').count(), 2);
  await surface.evaluate(node => {
    const list = node.querySelector('ul');
    const range = document.createRange();
    range.setStart(list, 0); range.setEnd(list, 1);
    const selection = document.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await command('Numbered');
  assert.deepEqual((await blocks()).slice(0, 2).map(block => block.list), ['ordered', 'unordered'], 'Selection on the list container must map to the correct item boundaries');
  await surface.press('Control+z');
  await select(0, 0);
  await command('H2');
  assert.equal(await surface.locator('h2 strong').textContent(), 'One');
  assert.equal(await surface.locator('ul > li').textContent(), 'Two');
  await surface.press('Control+z');
  await select(0, 3, 1, 1);
  await surface.press('Backspace');
  assert.equal(await surface.locator('ul > li strong').textContent(), 'One');
  assert.equal(await surface.locator('ul > li').textContent(), 'Onewo');
  assert.equal((await blocks()).length, 2);
  await surface.press('Control+z');
  assert.equal(await surface.locator('ul > li').count(), 2);
  await select(1, 3);
  await surface.evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionstart'));
    node.dispatchEvent(new CompositionEvent('compositionend', { data: '🙂' }));
  });
  assert.equal(await surface.locator('ul > li').nth(1).textContent(), 'Two🙂');
  await select(1, 0);
  await surface.evaluate(pasteFixture, { text: 'A\nB' });
  assert.deepEqual((await blocks()).slice(0, 3).map(block => block.list), ['unordered', 'unordered', 'unordered']);
  assert.deepEqual(await surface.locator('ul > li').allTextContents(), ['One', 'A', 'BTwo🙂']);
  const saved = await field.inputValue();
  if (browserName === 'chromium') {
    await select(2, 'BTwo🙂'.length);
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.imeSetComposition', { text: '尾', selectionStart: 1, selectionEnd: 1 });
      assert.equal(await field.isDisabled(), true);
      await cdp.send('Input.insertText', { text: '尾' });
      assert.equal(await surface.locator('ul > li').nth(2).textContent(), 'BTwo🙂尾');
      await surface.press('Control+z');
      assert.equal(await field.inputValue(), saved, 'Native IME inside a list item must undo without losing list metadata');
    } finally { await cdp.detach(); }
  }
  if (process.env.EDITOR_LISTS_SCREENSHOT_PATH) await page.screenshot({ path: process.env.EDITOR_LISTS_SCREENSHOT_PATH });
  await page.evaluate(async () => {
    const root = document.querySelector('[data-legura-editor]');
    root.dataset.document = root.querySelector('[data-editor-document]').value;
    window.richtextHandle.destroy();
    const { mountRichTextEditor } = await import('/src/js/rich-text-editor.js');
    window.richtextHandle = mountRichTextEditor(root);
  });
  assert.equal(await field.inputValue(), saved);
  await select(1, 0);
  await command('Paragraph');
  assert.equal(await surface.locator('ul').count(), 2, 'A paragraph separates adjacent list groups');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await field.inputValue(), saved);
  await page.setViewportSize({ width: 320, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.goto(`${baseUrl}/examples/formatting.html`);
  await page.waitForFunction(() => window.formattingHandle);
  await page.evaluate(async source => {
    const root = document.querySelector('[data-legura-editor]');
    window.formattingHandle.destroy();
    root.dataset.document = source;
    const { mountFormattingEditor } = await import('/src/js/formatting-editor.js');
    window.formattingHandle = mountFormattingEditor(root);
  }, saved);
  assert.equal(await page.locator('[data-editor-document]').isDisabled(), true);
  assert.equal(await page.locator('[data-legura-editor]').getAttribute('data-document'), saved);
  console.log('Lists passed: grouped bullets/numbering, preserved marks, Enter/exit, conversion/history, merge, composition, multiline paste, reload/reset, mobile and legacy refusal.');
}
