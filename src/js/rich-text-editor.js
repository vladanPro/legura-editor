import { mountFormattingEditor } from './formatting-editor.js';

const instances = new WeakMap();

// The document/history remains authoritative. Never serialize arbitrary browser HTML.
export function mountRichTextEditor(root) {
  if (instances.has(root)) return instances.get(root);
  const input = root.querySelector('[data-editor-input]');
  const surface = root.querySelector('[data-editor-preview]');
  const field = root.querySelector('[data-editor-document]');
  const error = root.querySelector('[data-editor-error]');
  if (!input || !surface || !field || !error) throw new Error('Incomplete rich-text editor markup.');
  const document = root.ownerDocument;
  const controller = new AbortController();
  const listeners = { signal: controller.signal };
  let handle;
  let active = true;
  let composing = false;

  const point = offset => {
    const paragraphs = Array.from(surface.children);
    let remaining = offset;
    for (let index = 0; index < paragraphs.length; index++) {
      const paragraph = paragraphs[index];
      const length = paragraph.textContent.length;
      if (remaining <= length || index === paragraphs.length - 1) {
        const walker = document.createTreeWalker(paragraph, 4);
        let node;
        while ((node = walker.nextNode())) {
          if (remaining <= node.length) return [node, remaining];
          remaining -= node.length;
        }
        return [paragraph, paragraph.childNodes.length];
      }
      remaining -= length + 1;
    }
    return [surface, 0];
  };
  const restoreSelection = () => {
    if (!active || field.disabled) return;
    const range = document.createRange();
    range.setStart(...point(input.selectionStart));
    range.setEnd(...point(input.selectionEnd));
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const readOffset = (node, offset) => {
    let total = 0;
    const paragraphs = Array.from(surface.children);
    if (node === surface) return paragraphs.slice(0, offset).reduce((sum, p) => sum + p.textContent.length + 1, 0);
    for (const paragraph of paragraphs) {
      if (paragraph === node || paragraph.contains(node)) {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.setEnd(node, offset);
        return total + range.toString().length;
      }
      total += paragraph.textContent.length + 1;
    }
    return null;
  };
  const syncSelection = () => {
    const selection = document.getSelection();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return false;
    const start = readOffset(range.startContainer, range.startOffset);
    const end = readOffset(range.endContainer, range.endOffset);
    if (start === null || end === null) return false;
    input.setSelectionRange(start, end);
    input.dispatchEvent(new Event('select'));
    return true;
  };
  handle = mountFormattingEditor(root, {
    onRender: () => { if (document.activeElement === surface) restoreSelection(); },
    focus: () => { surface.focus(); restoreSelection(); },
  });
  const initialized = !input.readOnly;
  if (initialized) {
    input.hidden = true;
    surface.setAttribute('contenteditable', 'true');
  }
  const replace = (text, type = 'insertText') => {
    if (!initialized || composing || !syncSelection()) return;
    input.dispatchEvent(new InputEvent('beforeinput', { inputType: type, bubbles: true }));
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText(text, start, end, 'end');
    input.dispatchEvent(new InputEvent('input', { inputType: type, bubbles: true }));
    if (field.disabled) {
      handle.restoreView();
      error.textContent = 'This edit exceeds the document limits and was not applied.';
    }
    restoreSelection();
  };
  surface.addEventListener('beforeinput', event => {
    event.preventDefault();
    if (!initialized || !syncSelection()) return;
    const type = event.inputType;
    if (type === 'insertText' || type === 'insertReplacementText') replace(event.data || '', type);
    else if (type === 'insertParagraph' || type === 'insertLineBreak') replace('\n', 'insertText');
    else if (type === 'deleteContentBackward' || type === 'deleteContentForward') {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      if (start === end) {
        if (type === 'deleteContentBackward') input.setSelectionRange(start - (Array.from(input.value.slice(0, start)).at(-1)?.length || 0), end);
        else input.setSelectionRange(start, end + (Array.from(input.value.slice(end))[0]?.length || 0));
        restoreSelection();
      }
      replace('', 'deleteByCut');
    } else error.textContent = 'This editing operation is not supported by this pilot.';
  }, listeners);
  surface.addEventListener('paste', event => {
    event.preventDefault();
    if (event.clipboardData) replace(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
  }, listeners);
  surface.addEventListener('cut', event => {
    event.preventDefault();
    if (!event.clipboardData || !syncSelection()) return;
    event.clipboardData.setData('text/plain', input.value.slice(input.selectionStart, input.selectionEnd));
    replace('', 'deleteByCut');
  }, listeners);
  surface.addEventListener('drop', event => { event.preventDefault(); error.textContent = 'Drag-and-drop is not supported yet. Use paste.'; }, listeners);
  surface.addEventListener('keydown', event => {
    if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (!['b', 'i', 'z', 'y'].includes(event.key.toLowerCase())) return;
    event.preventDefault();
    syncSelection();
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
    }));
  }, listeners);
  // Native IME can mutate contenteditable even after beforeinput cancellation.
  // Refuse this pilot operation and restore the validated model, never submit that DOM.
  surface.addEventListener('compositionstart', () => {
    composing = true;
    field.disabled = true;
    surface.setAttribute('contenteditable', 'false');
    error.textContent = 'IME composition is not supported by this pilot. Use the paragraph editor.';
  }, listeners);
  surface.addEventListener('compositionend', () => {
    composing = false;
    handle.restoreView();
    if (initialized) surface.setAttribute('contenteditable', 'true');
    error.textContent = 'IME composition was not applied; the original document is preserved.';
  }, listeners);
  surface.addEventListener('input', () => { if (!composing) handle.restoreView(); }, listeners);
  field.form?.addEventListener('submit', event => {
    if (composing) event.preventDefault();
  }, listeners);
  document.addEventListener('selectionchange', syncSelection, listeners);
  root.addEventListener('click', event => {
    if (composing && event.target.closest('[data-editor-command]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { ...listeners, capture: true });
  for (const button of root.querySelectorAll('[data-editor-command]')) {
    button.addEventListener('mousedown', event => { syncSelection(); event.preventDefault(); }, listeners);
  }
  const result = { destroy() {
    active = false;
    controller.abort();
    handle.destroy();
    input.hidden = false;
    surface.setAttribute('contenteditable', 'false');
    instances.delete(root);
  } };
  instances.set(root, result);
  return result;
}
