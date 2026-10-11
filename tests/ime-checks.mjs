import assert from 'node:assert/strict';

export async function checkIme(page, baseUrl) {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${baseUrl}/examples/richtext.html`);
  await page.waitForFunction(() => window.richtextHandle);
  const surface = page.locator('[data-editor-preview]');
  const field = page.locator('[data-editor-document]');
  const selected = async (start, end) => surface.evaluate((node, [start, end]) => {
    node.focus();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    const range = document.createRange();
    range.setStart(text, start); range.setEnd(text, end);
    const selection = document.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, [start, end]);
  const documentText = async () => JSON.parse(await field.inputValue()).blocks
    .map(block => block.children.map(run => run.text).join('')).join('\n');
  await surface.focus();
  await surface.pressSequentially('Hello');
  await selected(0, 5);
  await surface.press('Control+b');
  await selected(5, 5);
  const before = await field.inputValue();
  const cdp = await page.context().newCDPSession(page);
  try {
    // Trusted Chromium composition, not merely dispatched JS events.
    await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
    assert.equal(await field.isDisabled(), true);
    assert.equal(await field.inputValue(), before, 'Provisional IME text must not enter the submission payload');
    assert.equal(await surface.getAttribute('contenteditable'), 'true');
    assert.equal(await page.locator('[data-editor-command]:enabled').count(), 0);
    await cdp.send('Input.imeSetComposition', { text: '日本', selectionStart: 2, selectionEnd: 2 });
    assert.ok((await surface.textContent()).includes('日本'), 'Browser should display the uncommitted composition');
    assert.equal(await field.inputValue(), before);
    assert.equal(await page.locator('form').evaluate(form => {
      const event = new Event('submit', { bubbles: true, cancelable: true });
      return form.dispatchEvent(event);
    }), false);
    await cdp.send('Input.insertText', { text: '日本' });
    assert.equal(await documentText(), 'Hello日本');
    assert.equal(await field.isDisabled(), false);
    assert.equal(await surface.locator('strong').textContent(), 'Hello日本');
    if (process.env.EDITOR_SCREENSHOT_PATH) await page.screenshot({ path: process.env.EDITOR_SCREENSHOT_PATH });
    await surface.press('Control+z');
    assert.equal(await field.inputValue(), before, 'One undo should remove the entire committed composition');
    await surface.press('Control+Shift+z');
    assert.equal(await documentText(), 'Hello日本');
    await selected(5, 7);
    await cdp.send('Input.imeSetComposition', { text: '語', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '語' });
    assert.equal(await documentText(), 'Hello語', 'Composition replaces its original selection, not a changed native range');
    await surface.press('Control+z');
    assert.equal(await documentText(), 'Hello日本');
    const retained = await field.inputValue();
    await selected(5, 7);
    await cdp.send('Input.imeSetComposition', { text: '中', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    assert.equal(await field.inputValue(), retained, 'Canceled IME must not change the model');
    assert.equal(await field.isDisabled(), false);
  } finally { await cdp.detach(); }

  // Synthetic edge cases supplement (do not replace) the native protocol proof.
  await surface.focus();
  await surface.press('Control+End');
  const retained = await field.inputValue();
  await surface.evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionstart'));
    node.dispatchEvent(new CompositionEvent('compositionend', { data: 'x'.repeat(20001) }));
  });
  assert.equal(await field.inputValue(), retained);
  assert.equal(await field.isDisabled(), false);
  await surface.evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionstart'));
    node.dispatchEvent(new CompositionEvent('compositionend', { data: '<script>evil()</script>🙂' }));
  });
  assert.equal(await surface.locator('script').count(), 0);
  assert.ok((await documentText()).endsWith('<script>evil()</script>🙂'));
  await surface.press('Control+z');
  assert.equal(await field.inputValue(), retained);
  await selected(5, 7);
  await surface.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionstart')));
  await surface.press('Tab');
  await page.waitForFunction(() => !document.querySelector('[data-editor-document]').disabled);
  assert.equal(await field.inputValue(), retained, 'Lost-focus cancellation must preserve the selected text');
  await surface.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionstart')));
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await documentText(), '');
  assert.equal(await field.isDisabled(), false);
  await surface.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { data: 'late' })));
  assert.equal(await documentText(), '', 'Late compositionend after reset must not overwrite reset content');
  await surface.focus();
  await surface.pressSequentially('Still editable');
  assert.equal(await documentText(), 'Still editable');
  await surface.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionstart')));
  await page.evaluate(() => window.richtextHandle.destroy());
  await surface.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { data: 'after teardown' })));
  assert.equal(await documentText(), 'Still editable');
  assert.equal(await field.isDisabled(), true);
  console.log('IME transactions passed: trusted Chromium composition/update/commit/cancel, blocked submit, selection replacement, marks, one-step history, limits, literal text and reset recovery.');
}
