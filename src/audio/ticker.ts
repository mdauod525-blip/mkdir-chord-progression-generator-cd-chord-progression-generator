/**
 * A steady ~25 ms tick for the look-ahead scheduler.
 *
 * Timers inside a Web Worker are throttled far less than main-thread timers
 * when the tab is hidden, so the worker drives the tick when available, with a
 * plain setInterval fallback. The tick only *triggers* scheduling; the actual
 * timing comes from the AudioContext clock.
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
  try {
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = () => onTick();
    }
  } catch {
    worker = null; // CSP or unsupported: fall back to the main thread.
  }
  let id: ReturnType<typeof setInterval> | null = null;
  return {
    start() {
      onTick();
      if (worker) worker.postMessage('start');
      else if (id === null) id = setInterval(onTick, intervalMs);
    },
    stop() {
      if (worker) worker.postMessage('stop');
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    },
    dispose() {
      this.stop();
      worker?.terminate();
      worker = null;
    },
  };
}
