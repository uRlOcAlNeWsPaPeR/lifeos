"use client";

/**
 * Read an uploaded document to plain text. .txt / .md natively; .docx and .pdf
 * by lazy-loading mammoth / pdf.js from a CDN on first use (same pattern as the
 * detector models — nobody who never uploads pays for the download).
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const scriptCache: Record<string, Promise<void> | undefined> = {};

function loadScript(src: string): Promise<void> {
  const cached = scriptCache[src];
  if (cached) return cached;
  scriptCache[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => {
      delete scriptCache[src];
      reject(new Error("Could not load " + src + " — check your connection."));
    };
    document.head.appendChild(s);
  });
  return scriptCache[src];
}

export async function readFileText(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is too large (25 MB max).");
  const name = file.name.toLowerCase();

  if (name.endsWith(".docx")) {
    await loadScript("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js");
    const mammoth = (window as unknown as { mammoth: { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> } }).mammoth;
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value.trim();
  }

  if (name.endsWith(".pdf")) {
    await loadScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs");
    const pdfjs = (window as unknown as { pdfjsLib: { getDocument: (o: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }> }> } } }).pdfjsLib;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map((i) => i.str ?? "").join(" ") + "\n\n";
    }
    return out.trim();
  }

  // .txt / .md / .markdown / anything else — read as text
  return (await file.text()).trim();
}
