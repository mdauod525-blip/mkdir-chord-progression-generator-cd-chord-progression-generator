/**
 * Favorites and preferences persisted in localStorage.
 * Every access is wrapped: private browsing or blocked storage must never
 * break the app – it just won't remember things.
 */

const FAVORITES_KEY = 'chordlab.favorites.v1';
const PREFS_KEY = 'chordlab.prefs.v1';
const MAX_FAVORITES = 200;

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    const ls = globalThis.localStorage;
    const probe = '__chordlab_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryStorage();
  }
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Create a favorites store (pass a custom storage object in tests). */
export function createFavoritesStore(storage) {
  const store = resolveStorage(storage);

  const list = () => {
    const items = readJson(store, FAVORITES_KEY, []);
    return Array.isArray(items) ? items : [];
  };

  return {
    list,
    save(progression, name) {
      const items = list().filter((f) => f.progression?.id !== progression.id);
      const entry = {
        id: progression.id,
        name: name || 'Untitled progression',
        savedAt: new Date().toISOString(),
        progression,
      };
      items.unshift(entry);
      writeJson(store, FAVORITES_KEY, items.slice(0, MAX_FAVORITES));
      return entry;
    },
    remove(id) {
      writeJson(store, FAVORITES_KEY, list().filter((f) => f.id !== id));
    },
    rename(id, name) {
      writeJson(store, FAVORITES_KEY, list().map((f) => (f.id === id ? { ...f, name } : f)));
    },
    has(id) {
      return list().some((f) => f.id === id);
    },
    loadPrefs() {
      return readJson(store, PREFS_KEY, {});
    },
    savePrefs(prefs) {
      writeJson(store, PREFS_KEY, prefs);
    },
  };
}
