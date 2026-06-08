import { buildInvoiceHtml2CanvasOptions } from "./invoiceCapture";

function defaultHtml2CanvasOptions(node) {
  return {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    width: Math.max(node.scrollWidth, node.offsetWidth, 1),
    height: Math.max(node.scrollHeight, node.offsetHeight, 1),
  };
}

export async function saveNodeAsPdf(
  node,
  filename,
  { format = "a4", html2canvasOptions } = {}
) {
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

  const captureOptions = html2canvasOptions ?? defaultHtml2CanvasOptions(node);
  const canvas = await html2canvas(node, captureOptions);
  const img = canvas.toDataURL("image/png");

  const pdf = new JsPDF({
    orientation: "portrait",
    unit: "mm",
    format,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let position = 0;
  pdf.addImage(img, "PNG", 0, position, imgWidth, imgHeight);

  let heightLeft = imgHeight - pageHeight;
  while (heightLeft > 0.5) {
    position -= pageHeight;
    pdf.addPage(format, "portrait");
    pdf.addImage(img, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const safe =
    String(filename ?? "invoice")
      .replace(/[/\\:*?"<>|]/g, "-")
      .trim()
      .slice(0, 120) || "invoice";

  pdf.save(`${safe}.pdf`);
}

export function saveInvoiceAsPdf(node, filename, { format = "a4" } = {}) {
  return saveNodeAsPdf(node, filename, {
    format,
    html2canvasOptions: buildInvoiceHtml2CanvasOptions(node),
  });
}
