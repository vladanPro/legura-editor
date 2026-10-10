const instances = new WeakMap();
const encoder = new TextEncoder();

export function validateParagraphDocument(document, allowMarks = false) {
  const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
  if (!exact(document, ['format', 'version', 'blocks']) || document.format !== 'legura-richtext'
    || document.version !== 1 || !Array.isArray(document.blocks)
    || document.blocks.length < 1 || document.blocks.length > 256) throw new Error('Unsupported document structure.');
  let runs = 0;
  let characters = 0;
  for (const block of document.blocks) {
    if (!exact(block, ['type', 'children']) || block.type !== 'paragraph'
      || !Array.isArray(block.children) || !block.children.length) throw new Error('Unsupported paragraph.');
    runs += block.children.length;
    if (runs > 512) throw new Error('Too many text runs.');
    for (const run of block.children) {
      if (!exact(run, ['text', 'marks']) || typeof run.text !== 'string'
        || !Array.isArray(run.marks) || (!allowMarks && run.marks.length)
        || run.marks.length > 2 || new Set(run.marks).size !== run.marks.length
        || run.marks.some(mark => !['bold', 'italic'].includes(mark))) throw new Error('Unsupported text or formatting.');
      for (const character of run.text) {
        const code = character.codePointAt(0);
        if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159)
          || (code >= 0xd800 && code <= 0xdfff)) throw new Error('Unsupported text character.');
        characters += 1;
      }
      // Each paragraph is represented by one textarea line; reject lossy input.
      if (/[\r\n]/.test(run.text)) throw new Error('This editor cannot edit inline line breaks yet.');
    }
  }
  if (characters > 20000) throw new Error('Content exceeds 20000 characters.');
  if (encoder.encode(JSON.stringify(document)).length > 32768) throw new Error('Document exceeds 32 KiB.');
  return document;
}

export function mountParagraphEditor(root) {
  if (instances.has(root)) return instances.get(root);
  const input = root.querySelector('[data-editor-input]');
  const field = root.querySelector('[data-editor-document]');
  const error = root.querySelector('[data-editor-error]');
  if (!input || !field || !error) throw new Error('Incomplete editor markup.');
  const form = field.form;
  let valid = false;
  let active = true;
  const fail = message => {
    valid = false;
    field.disabled = true;
    error.textContent = message;
    input.setCustomValidity(message);
    input.setAttribute('aria-invalid', 'true');
  };
  try {
    const source = root.dataset.document || '{"format":"legura-richtext","version":1,"blocks":[{"type":"paragraph","children":[{"text":"","marks":[]}]}]}';
    if (encoder.encode(source).length > 32768) throw new Error('Document exceeds 32 KiB.');
    const document = validateParagraphDocument(JSON.parse(source));
    input.value = document.blocks.map(block => block.children.map(run => run.text).join('')).join('\n');
    input.defaultValue = input.value;
    field.value = JSON.stringify(document);
    field.disabled = false;
    input.readOnly = false;
    valid = true;
  } catch {
    fail('This document cannot be edited safely by this version. Original content was not changed.');
  }
  const update = () => {
    if (!active || input.readOnly) return;
    try {
      const document = validateParagraphDocument({ format: 'legura-richtext', version: 1, blocks:
        input.value.split('\n').map(text => ({ type: 'paragraph', children: [{ text, marks: [] }] })) });
      field.value = JSON.stringify(document);
      field.disabled = false;
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
      error.textContent = '';
      valid = true;
    } catch (failure) { fail(failure.message); }
  };
  const submit = event => {
    if (!valid) { event.preventDefault(); input.reportValidity(); }
  };
  input.addEventListener('input', update);
  form?.addEventListener('submit', submit);
  const reset = () => queueMicrotask(update);
  form?.addEventListener('reset', reset);
  const handle = { destroy() {
    active = false;
    input.removeEventListener('input', update);
    form?.removeEventListener('submit', submit);
    form?.removeEventListener('reset', reset);
    input.readOnly = true;
    field.disabled = true;
    instances.delete(root);
  } };
  instances.set(root, handle);
  return handle;
}

export function mountParagraphEditors(scope = document) {
  return Array.from(scope.querySelectorAll('[data-legura-editor="paragraph"]'), mountParagraphEditor);
}
