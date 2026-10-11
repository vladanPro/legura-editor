import assert from 'node:assert/strict';

export async function checkRichText(page, baseUrl) {
  await page.goto(`${baseUrl}/examples/richtext.html`);
  await page.waitForFunction(() => window.richtextHandle);
  const surface = page.locator('[data-editor-preview]');
  const field = page.locator('[data-editor-document]');
  const text = async () => JSON.parse(await field.inputValue()).blocks.map(block => block.children.map(run => run.text).join('')).join('\n');
  const select = async (start, end) => {
    await surface.evaluate((node, [start, end]) => {
      const nodes = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let item;
      while ((item = walker.nextNode())) nodes.push(item);
      const point = offset => {
        for (const node of nodes) {
          if (offset <= node.length) return [node, offset];
          offset -= node.length;
        }
        return [node, 0];
      };
      node.focus();
      const range = document.createRange();
      range.setStart(...point(start)); range.setEnd(...point(end));
      const selection = document.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    }, [start, end]);
  };
  await surface.focus();
  await surface.pressSequentially('Hello world');
  assert.equal(await text(), 'Hello world');
  await select(0, 5);
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  assert.equal(await surface.locator('strong').textContent(), 'Hello');
  await surface.press('Control+i');
  assert.equal(await surface.locator('strong em').textContent(), 'Hello');
  await surface.press('Control+z');
  assert.equal(await surface.locator('em').count(), 0);
  await surface.press('Control+Shift+z');
  assert.equal(await surface.locator('strong em').textContent(), 'Hello');
  await select(0, 5);
  await surface.press('Backspace');
  assert.equal(await text(), ' world');
  await surface.press('Control+z');
  assert.equal(await surface.locator('strong em').textContent(), 'Hello');
  await select(11, 11);
  await surface.press('Enter');
  await surface.pressSequentially('Second');
  assert.equal(await text(), 'Hello world\nSecond');
  assert.equal(await surface.locator('p').count(), 2);
  await surface.press('Control+a');
  await surface.evaluate(node => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '<img src=x onerror=evil()>🙂\nČ');
    clipboardData.setData('text/html', '<img src=x onerror=evil()>');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  assert.equal(await text(), '<img src=x onerror=evil()>🙂\nČ');
  assert.equal(await surface.locator('img, script').count(), 0);
  const saved = await field.inputValue();
  await page.evaluate(async () => {
    const root = document.querySelector('[data-legura-editor]');
    root.dataset.document = root.querySelector('[data-editor-document]').value;
    window.richtextHandle.destroy();
    const { mountRichTextEditor } = await import('/src/js/rich-text-editor.js');
    window.richtextHandle = mountRichTextEditor(root);
  });
  assert.equal(await field.inputValue(), saved);
  await surface.focus();
  const emojiStart = '<img src=x onerror=evil()>'.length;
  await select(emojiStart, emojiStart + 2);
  await surface.press('Backspace');
  assert.equal(await text(), '<img src=x onerror=evil()>\nČ', 'Deleting an emoji must remove one complete scalar');
  await surface.press('Control+z');
  assert.equal(await field.inputValue(), saved);
  await surface.focus();
  await surface.press('Control+a');
  await surface.evaluate(node => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'x'.repeat(20001));
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true }));
  });
  assert.equal(await field.inputValue(), saved, 'An over-limit edit must preserve the last valid document');
  await surface.evaluate(node => {
    node.append(document.createElement('img'));
    node.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  assert.equal(await surface.locator('img').count(), 0);
  assert.equal(await field.inputValue(), saved);
  await surface.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionstart')));
  assert.equal(await field.isDisabled(), true);
  await surface.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend')));
  assert.equal(await field.inputValue(), saved);
  assert.equal(await field.isDisabled(), false);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await field.inputValue(), saved);
  await page.setViewportSize({ width: 320, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => window.richtextHandle.destroy());
  assert.equal(await surface.getAttribute('contenteditable'), 'false');
  assert.equal(await field.isDisabled(), true);
  console.log('Rich-text pilot passed: real typing, in-place marks, selection, history, paragraphs, literal paste, reload, limits, unexpected DOM recovery, reset, mobile and teardown.');
}
