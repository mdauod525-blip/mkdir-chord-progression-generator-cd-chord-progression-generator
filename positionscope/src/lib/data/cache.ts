/**
 * Server-side cache: in-memory plus JSON files on disk so restarts don't burn free-tier quotas.
 * Supports stale-if-error: if a refresh fails, the last good value is served and flagged.
 */
import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface CacheResult<T> {
  value: T;
  fromCache: boolean;
  fetchedAt: string;
  /** Served an expired entry because the refresh failed. */
  staleFallback: boolean;
  error?: string;
}

interface Entry<T> {
  value: T;
  fetchedAt: string;
}

const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<CacheResult<unknown>>>();

function cacheDir() {
  return process.env.CACHE_DIR || path.join(process.cwd(), '.cache');
}

function fileFor(key: string) {
  const safe = key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
  return path.join(cacheDir(), `${safe}-${hash}.json`);
}

async function readDisk<T>(key: string): Promise<Entry<T> | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), 'utf8')) as Entry<T>;
  } catch {
    return null;
  }
}

async function writeDisk<T>(key: string, entry: Entry<T>) {
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    await fs.writeFile(fileFor(key), JSON.stringify(entry));
  } catch {
    // Read-only filesystems (some serverless hosts): memory cache still works.
  }
}

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<CacheResult<T>> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<CacheResult<T>>;
  const run = (async (): Promise<CacheResult<T>> => {
    let entry = memory.get(key) as Entry<T> | undefined;
    if (!entry) {
      const disk = await readDisk<T>(key);
      if (disk) {
        entry = disk;
        memory.set(key, disk);
      }
    }
    if (entry && Date.now() - Date.parse(entry.fetchedAt) < ttlMs) {
      return { value: entry.value, fromCache: true, fetchedAt: entry.fetchedAt, staleFallback: false };
    }
    try {
      const value = await fetcher();
      const fresh = { value, fetchedAt: new Date().toISOString() };
      memory.set(key, fresh);
      await writeDisk(key, fresh);
      return { value, fromCache: false, fetchedAt: fresh.fetchedAt, staleFallback: false };
    } catch (err) {
      if (entry) return { value: entry.value, fromCache: true, fetchedAt: entry.fetchedAt, staleFallback: true, error: (err as Error).message };
      throw err;
    }
  })();
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}
