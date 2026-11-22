// Render the film to MP4: node render.js [fps] [scale] [start] [end] [out]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const fps = +(process.argv[2] || 24), scale = +(process.argv[3] || 1.5);
  const t0 = +(process.argv[4] || 0), t1 = +(process.argv[5] || 118);
  const out = process.argv[6] || 'build/video.mp4';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, 'index.html') + '?render');
  await page.waitForFunction('window.READY === true', null, { timeout: 30000 });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round((t1 - t0) * fps);
  for (let f = 0; f < frames; f++) {
    const url = await page.evaluate(([t, s]) => window.renderAt(t, s), [t0 + f / fps, scale]);
    const ok = ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'));
    if (!ok) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 240 === 0) console.log('frame', f, '/', frames);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n')); process.exitCode = 1; }
  console.log('done', out);
})();
