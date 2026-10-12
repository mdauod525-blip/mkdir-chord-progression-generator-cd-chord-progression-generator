/**
 * Tiny DOM helpers – enough to keep rendering code readable without a framework.
 */

/**
 * Create an element: h('button', { class: 'x', onclick: fn }, 'Label', child)
 * Attributes starting with "on" become event listeners; `dataset` and `style`
 * objects are merged; `false`/`null` attributes are skipped.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Replace all children of an element. */
export function mount(parent, ...children) {
  parent.replaceChildren(...children.flat().filter(Boolean));
}

/** A segmented control built from radio buttons (accessible, big tap targets). */
export function segmented(name, options, value, onChange, { label, className = '' } = {}) {
  const group = h('div', { class: `segmented ${className}`, role: 'radiogroup', 'aria-label': label || name });
  for (const [val, text] of options) {
    const id = `${name}-${String(val).replace(/[^a-z0-9]/gi, '_')}`;
    const input = h('input', { type: 'radio', name, id, value: val, checked: String(val) === String(value) });
    input.addEventListener('change', () => input.checked && onChange(val));
    group.append(input, h('label', { for: id }, text));
  }
  return group;
}

/** A native <select> (gives the iOS wheel picker). */
export function select(name, options, value, onChange, { label } = {}) {
  const el = h('select', { name, id: `sel-${name}`, 'aria-label': label || name });
  for (const [val, text] of options) el.append(h('option', { value: val, selected: String(val) === String(value) }, text));
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

/** Labelled field wrapper. */
export function field(labelText, control, { hint, forId } = {}) {
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-label' }, h('label', { for: forId || control.id || null }, labelText), hint ? h('span', { class: 'field-hint' }, hint) : null),
    control,
  );
}
