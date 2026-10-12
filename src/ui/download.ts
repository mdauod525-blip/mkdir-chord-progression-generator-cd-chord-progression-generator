/** Save text as a file (download on desktop, share sheet / Files on iOS). */
export async function saveTextFile(filename: string, text: string, mime = 'application/json'): Promise<void> {
  const blob = new Blob([text], { type: mime });
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: mime }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // On phones the share sheet is the friendliest way to save a file.
  if (file && nav.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch {
      /* cancelled or unsupported: fall back to a download link */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
}
