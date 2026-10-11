import { validateParagraphDocument, validateLink } from './paragraph-editor.js';

const instances = new WeakMap();
const emptyDocument = { format: 'legura-richtext', version: 1, blocks: [
  { type: 'paragraph', children: [{ text: '', marks: [] }] },
] };
const marks = mask => ['bold', 'italic'].filter((_, index) => mask & (1 << index));
const textOf = atoms => atoms.map(atom => atom[0]).join('');
const isList = style => ['unordered', 'ordered'].includes(style);
const blockStyle = block => block.type === 'heading' ? `heading-${block.level}` : block.type === 'list-item' ? block.list : 'paragraph';
const commandStyle = name => name === 'unordered-list' ? 'unordered' : name === 'ordered-list' ? 'ordered' : name;

function decode(document) {
  const atoms = [];
  document.blocks.forEach((block, index) => {
    if (index) atoms.push(['\n', 0]);
    for (const run of block.children) {
      const mask = (run.marks.includes('bold') ? 1 : 0) | (run.marks.includes('italic') ? 2 : 0);
      for (const character of run.text) atoms.push([character, mask, run.link]);
    }
  });
  return atoms;
}

function encode(atoms, styles) {
  const blocks = [];
  let children = [];
  const finish = () => {
    const style = styles[blocks.length];
    if (!['paragraph', 'heading-2', 'heading-3', 'unordered', 'ordered'].includes(style)) throw new Error('Unsupported block style.');
    const metadata = isList(style) ? { type: 'list-item', list: style }
      : style === 'paragraph' ? { type: 'paragraph' } : { type: 'heading', level: Number(style.slice(-1)) };
    blocks.push({ ...metadata,
      children: children.length ? children : [{ text: '', marks: [] }] });
    children = [];
  };
  for (const [character, mask, link] of atoms) {
    if (character === '\n') { finish(); continue; }
    const previous = children.at(-1);
    const selected = marks(mask);
    if (previous && previous.marks.join() === selected.join() && previous.link === link) previous.text += character;
    else children.push({ text: character, marks: selected, ...(link === undefined ? {} : { link }) });
  }
  finish();
  if (styles.length !== blocks.length) throw new Error('Block metadata does not match the document.');
  return validateParagraphDocument({ format: 'legura-richtext', version: 1, blocks }, true, true, true, true);
}

export function mountFormattingEditor(root, options = {}) {
  if (instances.has(root)) return instances.get(root);
  const input = root.querySelector('[data-editor-input]');
  const field = root.querySelector('[data-editor-document]');
  const error = root.querySelector('[data-editor-error]');
  const preview = root.querySelector('[data-editor-preview]');
  const buttons = Array.from(root.querySelectorAll('[data-editor-command]'));
  const expected = options.allowHeadings ? ['bold', 'italic', 'undo', 'redo', 'paragraph', 'heading-2', 'heading-3'] : ['bold', 'italic', 'undo', 'redo'];
  if (options.allowLists) expected.push('unordered-list', 'ordered-list');
  if (options.allowLinks) expected.push('link', 'unlink');
  const linkInput = root.querySelector('[data-editor-link]');
  if (options.allowLinks && !linkInput) throw new Error('Missing link address input.');
  if (!input || !field || !error || !preview || buttons.length !== expected.length
    || expected.some(command => buttons.filter(button => button.dataset.editorCommand === command).length !== 1)) throw new Error('Incomplete formatting editor markup.');
  const form = field.form;
  const controller = new AbortController();
  const listeners = { signal: controller.signal };
  let atoms = [];
  let styles = ['paragraph'];
  let history = [];
  let cursor = 0;
  let active = true;
  let initialized = false;
  let valid = false;
  let composing = false;
  let initial = [];
  let initialStyles = ['paragraph'];
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
  const selectedBlocks = () => {
    const [start, end] = selection();
    const text = textOf(atoms);
    const first = text.slice(0, start).split('\n').length - 1;
    // A selection ending at the next block's start does not include that block.
    const last = text.slice(0, end > start ? end - 1 : end).split('\n').length - 1;
    return styles.map((_, index) => index >= first && index <= last);
  };
  const controls = () => {
    const chosen = selectedAtoms();
    for (const button of buttons) {
      const command = button.dataset.editorCommand;
      if (options.isSuspended?.()) button.disabled = true;
      else if (command === 'undo') button.disabled = !initialized || (valid && cursor === 0);
      else if (command === 'redo') button.disabled = !valid || cursor >= history.length - 1;
      else if (command === 'link' || command === 'unlink') {
        button.disabled = !valid || composing || !chosen.some(Boolean)
          || (command === 'unlink' && !atoms.some((atom, index) => chosen[index] && atom[2] !== undefined));
      }
      else if (command === 'paragraph' || command.startsWith('heading-') || command.endsWith('-list')) {
        const style = commandStyle(command);
        const blocks = selectedBlocks();
        button.disabled = !valid || composing;
        button.setAttribute('aria-pressed', String(!button.disabled && styles.every((value, index) => !blocks[index] || value === style)));
      }
      else {
        const mask = command === 'bold' ? 1 : 2;
        button.disabled = !valid || composing || !chosen.some(Boolean);
        button.setAttribute('aria-pressed', String(!button.disabled && atoms.every((atom, index) => !chosen[index] || (atom[1] & mask))));
      }
    }
    if (linkInput) linkInput.disabled = !valid || composing || Boolean(options.isSuspended?.());
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
    const document = encode(atoms, styles);
    field.value = JSON.stringify(document);
    field.disabled = false;
    valid = true;
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    const fragment = root.ownerDocument.createDocumentFragment();
    let listGroup = null;
    for (const block of document.blocks) {
      const p = root.ownerDocument.createElement(block.type === 'heading' ? `h${block.level}` : block.type === 'list-item' ? 'li' : 'p');
      p.dataset.editorBlock = 'true';
      if (block.type === 'list-item') {
        const tag = block.list === 'unordered' ? 'ul' : 'ol';
        if (!listGroup || listGroup.localName !== tag) {
          listGroup = root.ownerDocument.createElement(tag);
          fragment.append(listGroup);
        }
      } else listGroup = null;
      for (const run of block.children) {
        let node = root.ownerDocument.createTextNode(run.text);
        for (const tag of [...run.marks].reverse()) {
          const wrapper = root.ownerDocument.createElement(tag === 'bold' ? 'strong' : 'em');
          wrapper.append(node);
          node = wrapper;
        }
        if (run.link !== undefined) {
          const anchor = root.ownerDocument.createElement('a');
          anchor.setAttribute('href', run.link);
          anchor.setAttribute('rel', 'nofollow ugc');
          anchor.append(node);
          node = anchor;
        }
        p.append(node);
      }
      (listGroup || fragment).append(p);
    }
    preview.replaceChildren(fragment);
    controls();
    options.onRender?.();
  };
  const restore = snapshot => {
    beforeEdit = null;
    atoms = snapshot.atoms;
    styles = snapshot.styles;
    input.value = textOf(atoms);
    input.setSelectionRange(...snapshot.selection);
    render();
  };
  const commit = (next, selected = selection(), keepPreviousSelection = false, nextStyles = styles) => {
    encode(next, nextStyles); // Validate before changing the model/history.
    if (!keepPreviousSelection) history[cursor].selection = selection();
    atoms = next;
    styles = nextStyles;
    history = history.slice(0, cursor + 1);
    history.push({ atoms, styles, selection: selected });
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
    // Inherit links only inside an existing run, never at its boundary.
    const right = atoms[before.length - suffix];
    const inheritedLink = prefix > 0 && atoms[prefix - 1][2] === right?.[2] ? right?.[2] : undefined;
    const inserted = after.slice(prefix, after.length - suffix).map(character => [character, character === '\n' ? 0 : inherited, character === '\n' ? undefined : inheritedLink]);
    const next = [...atoms.slice(0, prefix), ...inserted, ...atoms.slice(before.length - suffix)];
    const first = before.slice(0, prefix).filter(character => character === '\n').length;
    const last = before.slice(0, before.length - suffix).filter(character => character === '\n').length;
    const continuation = isList(styles[first]) ? styles[first] : 'paragraph';
    const added = inserted.filter(atom => atom[0] === '\n').map(() => continuation);
    const nextStyles = [...styles.slice(0, first), styles[first], ...added, ...styles.slice(last + 1)];
    try { commit(next, selection(), true, nextStyles); } catch (failure) { fail(failure.message); }
  };
  const command = (name, applyLink = false) => {
    if (!initialized || composing || options.isSuspended?.()) return;
    if (name === 'undo') {
      if (!valid) restore(history[cursor]);
      else if (cursor > 0) restore(history[--cursor]);
    } else if (name === 'redo') {
      if (valid && cursor < history.length - 1) restore(history[++cursor]);
    } else if (valid && options.allowLinks && (name === 'link' || name === 'unlink')) {
      const chosen = selectedAtoms();
      if (!chosen.some(Boolean)) return;
      if (name === 'link' && !applyLink && options.requestLink) {
        const links = atoms.filter((_, index) => chosen[index]).map(atom => atom[2]);
        options.requestLink(links.every(link => link === links[0]) ? links[0] || '' : '');
        return;
      }
      try {
        const destination = name === 'link' ? validateLink(linkInput.value) : undefined;
        const next = atoms.map((atom, index) => chosen[index] ? [atom[0], atom[1], destination] : atom);
        if (next.some((atom, index) => atom[2] !== atoms[index][2])) commit(next);
        error.textContent = '';
        options.linkApplied?.();
      } catch (failure) {
        error.textContent = failure.message;
        options.linkError?.(failure.message);
        linkInput.focus();
        return;
      }
    } else if (valid && (name === 'paragraph' || name.startsWith('heading-') || name.endsWith('-list'))) {
      const style = commandStyle(name);
      const chosen = selectedBlocks();
      const nextStyles = styles.map((value, index) => chosen[index] ? style : value);
      if (nextStyles.some((value, index) => value !== styles[index])) {
        try { commit(atoms, selection(), false, nextStyles); } catch (failure) { fail(failure.message); }
      }
    } else if (valid) {
      const chosen = selectedAtoms();
      if (!chosen.some(Boolean)) return;
      const mask = name === 'bold' ? 1 : 2;
      const remove = atoms.every((atom, index) => !chosen[index] || (atom[1] & mask));
      const next = atoms.map((atom, index) => chosen[index] ? [atom[0], remove ? atom[1] & ~mask : atom[1] | mask, atom[2]] : atom);
      try { commit(next); } catch (failure) { fail(failure.message); }
    }
    if (options.focus) options.focus();
    else input.focus();
    controls();
  };
  try {
    const source = root.dataset.document || JSON.stringify(emptyDocument);
    if (new TextEncoder().encode(source).length > 32768) throw new Error('Document exceeds 32 KiB.');
    const document = validateParagraphDocument(JSON.parse(source), true, Boolean(options.allowHeadings), Boolean(options.allowLists), Boolean(options.allowLinks));
    atoms = decode(document);
    styles = document.blocks.map(blockStyle);
    initial = atoms;
    initialStyles = styles;
    input.value = input.defaultValue = textOf(atoms);
    input.readOnly = false;
    initialized = true;
    history = [{ atoms, styles, selection: [0, 0] }];
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
  linkInput?.addEventListener('keydown', event => {
    if (event.isComposing || options.isSuspended?.()) return;
    if (event.key === 'Enter') { event.preventDefault(); command('link', true); }
    else if (event.key === 'Escape') { event.preventDefault(); options.cancelLink?.(); options.focus?.(); }
  }, listeners);
  root.querySelector('[data-editor-link-apply]')?.addEventListener('click', () => command('link', true), listeners);
  root.querySelector('[data-editor-link-close]')?.addEventListener('click', () => {
    options.cancelLink?.();
    options.focus?.();
  }, listeners);
  form?.addEventListener('submit', event => {
    if (!valid || composing || !initialized) { event.preventDefault(); input.reportValidity(); }
  }, listeners);
  form?.addEventListener('reset', () => queueMicrotask(() => {
    if (!active || !initialized) return;
    history = [{ atoms: initial, styles: initialStyles, selection: [0, 0] }];
    cursor = 0;
    restore(history[0]);
  }), listeners);
  const handle = {
    exitEmptyList() {
      if (!valid || composing || options.isSuspended?.() || input.selectionStart !== input.selectionEnd) return false;
      const lines = input.value.split('\n');
      const index = input.value.slice(0, input.selectionStart).split('\n').length - 1;
      if (lines[index] !== '' || !isList(styles[index])) return false;
      command('paragraph');
      return true;
    },
    restoreView() { if (initialized) restore(history[cursor]); }, destroy() {
    active = false;
    controller.abort();
    input.readOnly = true;
    field.disabled = true;
    for (const button of buttons) button.disabled = true;
    if (linkInput) linkInput.disabled = true;
    history = [];
    instances.delete(root);
  } };
  instances.set(root, handle);
  return handle;
}
