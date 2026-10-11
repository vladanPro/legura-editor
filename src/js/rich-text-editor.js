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
  let compositionSelection = null;
  let pointerDown = false;

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
    if (composing) return false;
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
    isSuspended: () => composing,
    onRender: () => { if (document.activeElement === surface) restoreSelection(); },
    focus: () => { surface.focus(); restoreSelection(); },
  });
  const initialized = !input.readOnly;
  if (initialized) {
    input.hidden = true;
    surface.setAttribute('contenteditable', 'true');
  }
  const applyText = (text, start, end, type = 'insertText') => {
    input.setSelectionRange(start, end);
    input.dispatchEvent(new InputEvent('beforeinput', { inputType: type, bubbles: true }));
    input.setRangeText(text, start, end, 'end');
    input.dispatchEvent(new InputEvent('input', { inputType: type, bubbles: true }));
    if (field.disabled) {
      handle.restoreView();
      error.textContent = 'This edit exceeds the document limits and was not applied.';
    }
    restoreSelection();
  };
  const replace = (text, type = 'insertText') => {
    if (!initialized || composing || !syncSelection()) return;
    applyText(text, input.selectionStart, input.selectionEnd, type);
  };
  surface.addEventListener('beforeinput', event => {
    // IME owns its temporary DOM until compositionend. Do not destroy its range.
    if (initialized && (composing || event.isComposing
      || ['insertCompositionText', 'deleteCompositionText', 'insertFromComposition'].includes(event.inputType))) return;
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
  surface.addEventListener('compositionstart', () => {
    if (!initialized || composing || !syncSelection()) return;
    compositionSelection = [input.selectionStart, input.selectionEnd];
    composing = true;
    field.disabled = true;
    for (const button of root.querySelectorAll('[data-editor-command]')) button.disabled = true;
    error.textContent = 'Finish composing before submitting.';
  }, listeners);
  const finishComposition = text => {
    if (!composing) return;
    const selected = compositionSelection;
    composing = false;
    compositionSelection = null;
    // Discard temporary native markup; commit only event.data at the original range.
    handle.restoreView();
    if (text && selected) applyText(text.replace(/\r\n?/g, '\n'), ...selected);
  };
  surface.addEventListener('compositionend', event => finishComposition(event.data), listeners);
  surface.addEventListener('blur', () => {
    // Give native compositionend a chance to commit before recovering lost focus.
    // During a pointer click, wait until click/default action has completed: changing
    // the status height between pointerdown and pointerup can move the target away.
    queueMicrotask(() => { if (active && composing && !pointerDown) finishComposition(''); });
  }, listeners);
  document.addEventListener('pointerdown', () => { pointerDown = true; }, listeners);
  const releasePointer = () => {
    pointerDown = false;
    setTimeout(() => {
      if (active && composing && document.activeElement !== surface) finishComposition('');
    }, 0);
  };
  document.addEventListener('pointerup', releasePointer, listeners);
  document.addEventListener('pointercancel', releasePointer, listeners);
  field.form?.addEventListener('reset', () => {
    composing = false;
    compositionSelection = null;
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
