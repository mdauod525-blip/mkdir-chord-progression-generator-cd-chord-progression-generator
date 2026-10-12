/**
 * A steady ~25 ms tick for the look-ahead scheduler.
 *
 * Timers inside a Web Worker are throttled far less than main-thread timers
 * when the tab is hidden, so a worker drives the tick when it works. A
 * main-thread timer always runs as a backup: if the worker fails to load or
 * stops ticking (seen on iOS Safari), scheduling continues regardless. The
 * tick only *triggers* scheduling; the actual timing comes from the
 * AudioContext clock, and extra ticks are harmless.
 */
export interface Ticker {
  start(): void;
  stop(): void;
  dispose(): void;
}

const WORKER_SRC = `
let id = null;
onmessage = (e) => {
  if (e.data === 'start' && id === null) id = setInterval(() => postMessage('tick'), 25);
  if (e.data === 'stop' && id !== null) { clearInterval(id); id = null; }
};`;

export function createTicker(onTick: () => void, intervalMs = 25): Ticker {
  let worker: Worker | null = null;
  let url: string | null = null;
  try {
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      // Keep the blob URL alive until dispose(): Safari may load the worker
      // after a synchronous revoke and then silently never start it.
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = () => onTick();
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
      };
    }
  } catch {
    worker = null; // CSP or unsupported: the main-thread timer does the work.
  }
  let id: ReturnType<typeof setInterval> | null = null;
  return {
    start() {
      onTick();
      worker?.postMessage('start');
      if (id === null) id = setInterval(onTick, intervalMs);
    },
    stop() {
      worker?.postMessage('stop');
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    },
    dispose() {
      this.stop();
      worker?.terminate();
      worker = null;
      if (url) URL.revokeObjectURL(url);
      url = null;
    },
  };
}
