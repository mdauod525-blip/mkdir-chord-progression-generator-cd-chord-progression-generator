/**
 * Minimal hash router (works on static hosts and from any sub-path).
 *   #/                 home
 *   #/library?q=…      search & library
 *   #/song/:id?view=…  learning screen
 *   #/edit/:id         song / progression editor ("new" for a blank song)
 *   #/patterns[/:id]   strumming pattern library / editor
 *   #/settings
 */
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const hash = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
  const [p, q] = hash.split('?');
  return { path: (p || '/').split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q ?? '') };
}

let current = parse();
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = parse();
    for (const l of listeners) l();
  });
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export function navigate(to: string, replace = false): void {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (replace) {
    history.replaceState(null, '', target);
    current = parse();
    for (const l of listeners) l();
  } else location.hash = target;
}

/** Go "up" to a parent screen (predictable even when the page was opened from a link). */
export function up(parent = '/'): void {
  navigate(parent);
}

export const href = (to: string) => `#${to}`;
