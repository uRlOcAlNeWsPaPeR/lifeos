/**
 * Downscale + re-encode an image file before upload — a raw phone screenshot
 * can be several MB, well past what's worth sending (or what the API route
 * will accept) for something a vision model reads at a fraction of that size.
 *
 * The defaults favor legibility over file size: an assignment list is
 * usually a TALL screenshot (a long scrolling page), and the max dimension
 * constrains whichever side is largest — too aggressive here and the small
 * text on rows further down the list turns to mush, so the model only reads
 * confidently off the first item or two instead of the whole list.
 */
export async function compressImage(
  file: File,
  maxDim = 2200,
  quality = 0.85,
): Promise<{ data: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const mimeType = "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("Couldn't process that image.");
  return { data: dataUrl.slice(comma + 1), mimeType };
}

/**
 * A smaller copy for saving with a course, so a screenshot can be re-read later.
 * Firestore documents cap at 1 MB, so this aims well under that and gives up
 * (null) rather than store something that can't fit.
 */
export async function compressForStorage(
  file: File,
): Promise<{ data: string; mimeType: string } | null> {
  for (const [dim, q] of [
    [1600, 0.7],
    [1200, 0.6],
    [900, 0.55],
  ] as const) {
    const out = await compressImage(file, dim, q);
    if (out.data.length < 850_000) return out;
  }
  return null;
}
