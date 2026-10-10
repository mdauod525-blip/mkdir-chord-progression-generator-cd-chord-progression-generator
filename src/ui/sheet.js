/**
 * Bottom-sheet dialogs (one open at a time) with backdrop, Escape-to-close and
 * focus return – they feel native on iPhone and work with a keyboard.
 */
const backdrop = () => document.getElementById('sheet-backdrop');
let current = null;
let returnFocus = null;
let onCloseCb = null;

export function openSheet(el, { onClose } = {}) {
  if (current && current !== el) closeSheet();
  if (current !== el) returnFocus = document.activeElement;
  current = el;
  onCloseCb = onClose || null;
  el.hidden = false;
  backdrop().hidden = false;
  requestAnimationFrame(() => {
    el.classList.add('open');
    backdrop().classList.add('open');
  });
  document.body.classList.add('sheet-open');
  const focusable = el.querySelector('[data-autofocus]') || el.querySelector('button, [href], input, select');
  focusable?.focus({ preventScroll: true });
}

export function closeSheet() {
  if (!current) return;
  const el = current;
  current = null;
  el.classList.remove('open');
  backdrop().classList.remove('open');
  document.body.classList.remove('sheet-open');
  setTimeout(() => {
    if (current !== el) el.hidden = true;
    if (!current) backdrop().hidden = true;
  }, 220);
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
  returnFocus?.focus?.({ preventScroll: true });
}

export const isSheetOpen = (el) => current === el;

export function initSheets() {
  backdrop().addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) closeSheet();
  });
}
