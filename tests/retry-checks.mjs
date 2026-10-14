import assert from 'node:assert/strict';

export async function checkNativeRetry(page, baseUrl) {
  await page.goto(`${baseUrl}/examples/richtext.html`);
  await page.waitForFunction(() => window.richtextHandle);
  const restored = await page.evaluate(async () => {
    window.richtextHandle.destroy();
    const root = document.querySelector('[data-legura-editor]');
    root.dataset.document = JSON.stringify({ format: 'legura-richtext', version: 1, blocks: [{ type: 'paragraph', children: [{ text: 'Stored old text', marks: [] }] }] });
    const recovered = JSON.stringify({ format: 'legura-richtext', version: 1, blocks: [{ type: 'paragraph', children: [{ text: 'Unsaved </textarea><script>literal</script> 🙂', marks: ['bold'], link: 'https://example.com/retry' }] }] });
    const field = root.querySelector('[data-editor-document]');
    field.defaultValue = field.value = recovered;
    field.dataset.axRetained = 'true';
    const { mountRichTextEditor } = await import('/src/js/rich-text-editor.js');
    window.richtextHandle = mountRichTextEditor(root);
    return recovered;
  });
  const field = page.locator('[data-editor-document]');
  assert.equal(await field.inputValue(), restored);
  assert.equal(await field.isDisabled(), false);
  assert.equal(await page.locator('[data-editor-preview] a strong').textContent(), 'Unsaved </textarea><script>literal</script> 🙂');
  assert.equal(await page.locator('[data-editor-preview] script').count(), 0);
  assert.equal(await page.locator('[data-editor-preview] a').getAttribute('href'), 'https://example.com/retry');
  await page.evaluate(() => document.querySelector('#richtext').reset());
  assert.equal(await field.inputValue(), restored, 'Reset lost the recovered initial document');
  for (const invalid of ['{}', 'x'.repeat(32769)]) {
    await page.evaluate(async source => {
      window.richtextHandle.destroy();
      const root = document.querySelector('[data-legura-editor]');
      root.querySelector('[data-editor-document]').value = source;
      root.querySelector('[data-editor-document]').dataset.axRetained = 'true';
      const { mountRichTextEditor } = await import('/src/js/rich-text-editor.js');
      window.richtextHandle = mountRichTextEditor(root);
    }, invalid);
    assert.equal(await field.isDisabled(), true);
    assert.equal(await field.inputValue(), invalid, 'Invalid recovery must not silently revert to stored data');
    assert.equal(await page.locator('[data-editor-preview]').getAttribute('contenteditable'), 'false');
  }
}
