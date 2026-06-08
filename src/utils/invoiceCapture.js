import invoicePrintCss from "../components/invoice-print.css?inline";

const PX_PER_MM = 96 / 25.4;

export function invoiceWidthPx(widthMm) {
  return Math.round(Number(widthMm) * PX_PER_MM);
}

/** Strip app stylesheets from html2canvas clone; keep invoice hex CSS only. */
export function isolateInvoiceDocument(clonedDoc) {
  clonedDoc.querySelectorAll("style, link[rel='stylesheet']").forEach((el) => el.remove());

  const style = clonedDoc.createElement("style");
  style.textContent = invoicePrintCss;
  clonedDoc.head.appendChild(style);

  if (clonedDoc.body) {
    clonedDoc.body.style.margin = "0";
    clonedDoc.body.style.padding = "0";
    clonedDoc.body.style.background = "#ffffff";
    clonedDoc.body.style.color = "#111827";
  }

  const root = clonedDoc.querySelector(".invoice-print-root");
  if (root) {
    root.style.background = "#ffffff";
    root.style.width = "100%";
    root.style.maxWidth = "100%";
    root.style.overflow = "visible";
    root.style.fontFamily = '"Segoe UI", Arial, Helvetica, sans-serif';
  }
}

export function invoicePrintStylesheet() {
  return invoicePrintCss;
}

export function buildInvoiceHtml2CanvasOptions(node) {
  const width = Math.max(node.scrollWidth, node.offsetWidth, 1);
  const height = Math.max(node.scrollHeight, node.offsetHeight, 1);

  return {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc) => {
      isolateInvoiceDocument(clonedDoc);
    },
  };
}
