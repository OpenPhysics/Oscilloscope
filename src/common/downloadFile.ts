/**
 * downloadFile.ts
 *
 * Tiny browser helpers to save data to the user's machine, used by the
 * oscilloscope's CSV / image export. They create an object URL for a Blob and
 * click a temporary anchor, then revoke the URL. No-ops when there is no DOM
 * (e.g. under a headless test environment).
 */

/** Triggers a download of `blob` as `filename`. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Triggers a download of `text` as `filename` with the given MIME type. */
export function downloadTextFile(filename: string, text: string, mimeType = "text/csv;charset=utf-8"): void {
  triggerBlobDownload(new Blob([text], { type: mimeType }), filename);
}
