import { validateParagraphDocument } from './paragraph-editor.js';

const instances = new WeakMap();
const emptyDocument = { format: 'legura-richtext', version: 1, blocks: [
  { type: 'paragraph', children: [{ text: '', marks: [] }] },
] };
const marks = mask => ['bold', 'italic'].filter((_, index) => mask & (1 << index));
const textOf = atoms => atoms.map(atom => atom[0]).join('');

function decode(document) {
  const atoms = [];
  document.blocks.forEach((block, index) => {
    if (index) atoms.push(['\n', 0]);
    for (const run of block.children) {
      const mask = (run.marks.includes('bold') ? 1 : 0) | (run.marks.includes('italic') ? 2 : 0);
      for (const character of run.text) atoms.push([character, mask]);
    }
  });
  return atoms;
}

function encode(atoms) {
  const blocks = [];
  let children = [];
  const finish = () => {
    blocks.push({ type: 'paragraph', children: children.length ? children : [{ text: '', marks: [] }] });
    children = [];
  };
  for (const [character, mask] of atoms) {
    if (character === '\n') { finish(); continue; }
    const previous = children.at(-1);
    const selected = marks(mask);
    if (previous && previous.marks.join() === selected.join()) previous.text += character;
    else children.push({ text: character, marks: selected });
  }
  finish();
  return validateParagraphDocument({ format: 'legura-richtext', version: 1, blocks }, true);
}

export function mountFormattingEditor(root) {
  if (instances.has(root)) return instances.get(root);
  const input = root.querySelector('[data-editor-input]');
  const field = root.querySelector('[data-editor-document]');
  const error = root.querySelector('[data-editor-error]');
  const preview = root.querySelector('[data-editor-preview]');
  const buttons = Array.from(root.querySelectorAll('[data-editor-command]'));
  if (!input || !field || !error || !preview || buttons.length !== 4) throw new Error('Incomplete formatting editor markup.');
  const form = field.form;
  const controller = new AbortController();
  const listeners = { signal: controller.signal };
  let atoms = [];
  let history = [];
  let cursor = 0;
  let active = true;
  let initialized = false;
  let valid = false;
  let composing = false;
  let initial = [];
  let beforeEdit = null;
  const selection = () => [input.selectionStart, input.selectionEnd];
  const selectedAtoms = () => {
    const [start, end] = selection();
    let offset = 0;
    return atoms.map(([character]) => {
      const selected = character !== '\n' && offset < end && offset + character.length > start;
      offset += character.length;
      return selected;
    });
  };
  const controls = () => {
    const chosen = selectedAtoms();
    for (const button of buttons) {
      const command = button.dataset.editorCommand;
      if (command === 'undo') button.disabled = !initialized || (valid && cursor === 0);
      else if (command === 'redo') button.disabled = !valid || cursor >= history.length - 1;
      else {
        const mask = command === 'bold' ? 1 : 2;
        button.disabled = !valid || composing || !chosen.some(Boolean);
        button.setAttribute('aria-pressed', String(!button.disabled && atoms.every((atom, index) => !chosen[index] || (atom[1] & mask))));
      }
    }
  };
  const fail = message => {
    valid = false;
    field.disabled = true;
    input.setCustomValidity(message);
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    controls();
  };
  const render = () => {
    const document = encode(atoms);
    field.value = JSON.stringify(document);
    field.disabled = false;
    valid = true;
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    const fragment = root.ownerDocument.createDocumentFragment();
    for (const block of document.blocks) {
      const p = root.ownerDocument.createElement('p');
      for (const run of block.children) {
        let node = root.ownerDocument.createTextNode(run.text);
        for (const tag of [...run.marks].reverse()) {
          const wrapper = root.ownerDocument.createElement(tag === 'bold' ? 'strong' : 'em');
          wrapper.append(node);
          node = wrapper;
        }
        p.append(node);
      }
      fragment.append(p);
    }
    preview.replaceChildren(fragment);
    controls();
  };
  const restore = snapshot => {
    beforeEdit = null;
    atoms = snapshot.atoms;
    input.value = textOf(atoms);
    input.setSelectionRange(...snapshot.selection);
    render();
  };
  const commit = (next, selected = selection(), keepPreviousSelection = false) => {
    encode(next); // Validate before changing the model/history.
    if (!keepPreviousSelection) history[cursor].selection = selection();
    atoms = next;
    history = history.slice(0, cursor + 1);
    history.push({ atoms, selection: selected });
    // Bound history by snapshot count AND retained code points, not just steps.
    while (history.length > 50 || (history.length > 1 && history.reduce((sum, entry) => sum + entry.atoms.length, 0) > 100000)) history.shift();
    cursor = history.length - 1;
    render();
  };
  const update = () => {
    if (!active || !initialized || composing) return;
    const before = atoms.map(atom => atom[0]);
    const after = Array.from(input.value);
    if (before.join('') === input.value) { beforeEdit = null; if (!valid) render(); else controls(); return; }
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < before.length - prefix && suffix < after.length - prefix
      && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
    // Anchor repeated-character edits to the actual selection when beforeinput exists.
    // A text-only prefix/suffix diff cannot distinguish deleting the first "a" in "aa".
    if (beforeEdit) {
      const boundary = target => {
        let offset = 0;
        let index = 0;
        while (index < before.length && offset < target) offset += before[index++].length;
        return index;
      };
      let left = boundary(beforeEdit.selection[0]);
      let right = boundary(beforeEdit.selection[1]);
      if (left === right && beforeEdit.type === 'deleteContentBackward') left = Math.max(0, left - 1);
      if (left === right && beforeEdit.type === 'deleteContentForward') right = Math.min(before.length, right + 1);
      const tail = before.length - right;
      const added = after.length - left - tail;
      if (added >= 0 && before.slice(0, left).join('') === after.slice(0, left).join('')
        && before.slice(right).join('') === after.slice(left + added).join('')) {
        prefix = left;
        suffix = tail;
      }
    }
    beforeEdit = null;
    const inherited = prefix > 0 && before[prefix - 1] !== '\n' ? atoms[prefix - 1][1] : 0;
    const inserted = after.slice(prefix, after.length - suffix).map(character => [character, character === '\n' ? 0 : inherited]);
    const next = [...atoms.slice(0, prefix), ...inserted, ...atoms.slice(before.length - suffix)];
    try { commit(next, selection(), true); } catch (failure) { fail(failure.message); }
  };
  const command = name => {
    if (!initialized || composing) return;
    if (name === 'undo') {
      if (!valid) restore(history[cursor]);
      else if (cursor > 0) restore(history[--cursor]);
    } else if (name === 'redo') {
      if (valid && cursor < history.length - 1) restore(history[++cursor]);
    } else if (valid) {
      const chosen = selectedAtoms();
      if (!chosen.some(Boolean)) return;
      const mask = name === 'bold' ? 1 : 2;
      const remove = atoms.every((atom, index) => !chosen[index] || (atom[1] & mask));
      const next = atoms.map((atom, index) => chosen[index] ? [atom[0], remove ? atom[1] & ~mask : atom[1] | mask] : atom);
      try { commit(next); } catch (failure) { fail(failure.message); }
    }
    input.focus();
    controls();
  };
  try {
    const source = root.dataset.document || JSON.stringify(emptyDocument);
    if (new TextEncoder().encode(source).length > 32768) throw new Error('Document exceeds 32 KiB.');
    const document = validateParagraphDocument(JSON.parse(source), true);
    atoms = decode(document);
    initial = atoms;
    input.value = input.defaultValue = textOf(atoms);
    input.readOnly = false;
    initialized = true;
    history = [{ atoms, selection: [0, 0] }];
    render();
  } catch { fail('This document cannot be edited safely by this version. Original content was not changed.'); }
  input.addEventListener('input', update, listeners);
  input.addEventListener('beforeinput', event => {
    if (initialized && valid && !composing) {
      history[cursor].selection = selection();
      beforeEdit = { selection: selection(), type: event.inputType };
    }
  }, listeners);
  for (const event of ['select', 'keyup', 'pointerup']) input.addEventListener(event, controls, listeners);
  input.addEventListener('compositionstart', () => {
    beforeEdit = { selection: selection(), type: 'insertCompositionText' };
    composing = true;
    field.disabled = true;
    controls();
  }, listeners);
  input.addEventListener('compositionend', () => { composing = false; update(); if (valid) render(); }, listeners);
  input.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || composing) return;
    const key = event.key.toLowerCase();
    if (!['b', 'i', 'z', 'y'].includes(key)) return;
    event.preventDefault();
    command(key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'y' || event.shiftKey ? 'redo' : 'undo');
  }, listeners);
  for (const button of buttons) button.addEventListener('click', () => command(button.dataset.editorCommand), listeners);
  form?.addEventListener('submit', event => {
    if (!valid || composing || !initialized) { event.preventDefault(); input.reportValidity(); }
  }, listeners);
  form?.addEventListener('reset', () => queueMicrotask(() => {
    if (!active || !initialized) return;
    history = [{ atoms: initial, selection: [0, 0] }];
    cursor = 0;
    restore(history[0]);
  }), listeners);
  const handle = { destroy() {
    active = false;
    controller.abort();
    input.readOnly = true;
    field.disabled = true;
    for (const button of buttons) button.disabled = true;
    history = [];
    instances.delete(root);
  } };
  instances.set(root, handle);
  return handle;
}
