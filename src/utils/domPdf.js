function trimCanvasBottomWhitespace(canvas, opts = {}) {
  const { minKeep = 40, whiteMin = 248 } = opts;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  if (height <= minKeep) return canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  const rowHasNonWhite = (y) => {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const i = row + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 8) continue;
      if (r < whiteMin || g < whiteMin || b < whiteMin) return true;
    }
    return false;
  };

  let bottom = height;
  while (bottom > minKeep && !rowHasNonWhite(bottom - 1)) bottom -= 1;
  if (bottom >= height) return canvas;

  const trimmed = document.createElement("canvas");
  trimmed.width = width;
  trimmed.height = bottom;
  trimmed.getContext("2d").drawImage(canvas, 0, 0, width, bottom, 0, 0, width, bottom);
  return trimmed;
}

export async function saveNodeAsPdf(node, filename, { format = "a4" } = {}) {
  if (!node) throw new Error("Nothing to export.");

  try {
    await document.fonts?.ready;
  } catch {
    /* ignore */
  }

  const [{ default: html2canvas }, jspdfMod] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const JsPDF = jspdfMod.jsPDF ?? jspdfMod.default;
  if (typeof JsPDF !== "function") {
    throw new Error("PDF library did not load (jsPDF).");
  }

  const canvasRaw = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });
  const canvas = trimCanvasBottomWhitespace(canvasRaw);
  const img = canvas.toDataURL("image/png");

  const probe = new JsPDF({
    orientation: "portrait",
    unit: "mm",
    format,
  });
  const pageW = probe.internal.pageSize.getWidth();
  const maxPageH = probe.internal.pageSize.getHeight();
  const imgWidth = pageW;
  const imgHeight = (canvas.height * pageW) / canvas.width;
  const imgHMm = Math.max(imgHeight, 0.5);
  const EPS = 0.25;
  let pdf = null;

  for (let yOff = 0; yOff < imgHMm - EPS; yOff += maxPageH) {
    const remaining = imgHMm - yOff;
    const sliceH = Math.min(maxPageH, remaining);
    if (pdf == null) {
      pdf = new JsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [pageW, sliceH],
      });
    } else {
      pdf.addPage([pageW, sliceH], "portrait");
    }
    pdf.addImage(img, "PNG", 0, -yOff, imgWidth, imgHeight);
  }

  if (!pdf) {
    throw new Error("Statement capture was empty.");
  }

  const safe =
    String(filename ?? "statement")
      .replace(/[/\\:*?"<>|]/g, "-")
      .trim()
      .slice(0, 120) || "statement";

  pdf.save(`${safe}.pdf`);
}
