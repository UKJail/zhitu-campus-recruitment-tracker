/** Render only the verified page; never execute PDF actions, scripts or forms. */
export async function renderResumePdfPreview(blob: Blob, canvas: HTMLCanvasElement, signal: AbortSignal) {
  if (signal.aborted) return;
  if (blob.type !== "application/pdf" || !blob.size || blob.size > 20 * 1024 * 1024) throw new Error("INVALID_PREVIEW");
  const [{ getDocument, PDFWorker }, bytes] = await Promise.all([import("pdfjs-dist"), blob.arrayBuffer()]);
  if (signal.aborted) return;
  const port = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  const worker = PDFWorker.create({ port });
  const loading = getDocument({ data: new Uint8Array(bytes), worker, enableXfa: false, useWasm: false, stopAtErrors: true });
  const abort = () => { void loading.destroy().catch(() => undefined); worker.destroy(); port.terminate(); };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 20_000);
  try {
    const pdf = await loading.promise;
    if (signal.aborted) return;
    if (pdf.numPages !== 1) throw new Error("PREVIEW_PAGE_COUNT");
    const page = await pdf.getPage(1);
    if (signal.aborted) return;
    const natural = page.getViewport({ scale: 1 });
    if (Math.abs(natural.width - 595.276) > 2 || Math.abs(natural.height - 841.89) > 2) throw new Error("PREVIEW_PAGE_SIZE");
    const viewport = page.getViewport({ scale: 2 });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport, annotationMode: 0 }).promise;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    await loading.destroy().catch(() => undefined);
    worker.destroy();
    port.terminate();
  }
}
