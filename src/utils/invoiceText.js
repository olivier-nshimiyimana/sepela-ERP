import {
  RECEIPT_TYPE_LABELS,
  RECEIPT_TYPES,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
} from "../domain/receiptTransaction";
import {
  RECEIPT_WIDTH,
  center,
  formatReceiptItemLine,
  formatReceiptSubLine,
  labelValue,
  padEnd,
  repeatChar,
  wrapLines,
} from "./receiptText";

export { RECEIPT_WIDTH };

/**
 * @param {object} sale
 * @param {object} profile
 * @param {object} [ctx] receiptType, transactionType, sdcReceiptCode, copyIndex, ...
 * @param {number} [width]
 */
export function formatInvoicePlainText(sale, profile, ctx = {}, width = RECEIPT_WIDTH) {
  const receiptType = ctx.receiptType ?? sale.receiptType ?? RECEIPT_TYPES.NORMAL;
  const transactionType =
    ctx.transactionType ??
    (sale.status === "refunded" && !ctx.isReprint
      ? TRANSACTION_TYPES.REFUND
      : sale.transactionType ?? TRANSACTION_TYPES.SALES);
  const sdcReceiptCode = ctx.sdcReceiptCode ?? sale.sdcReceiptCode ?? "RT_NORMAL_SALES";

  const p = { ...profile };
  const sep = repeatChar("=", width);
  const thin = repeatChar("-", width);
  const lines = [];

  const push = (...rows) => {
    for (const row of rows) {
      if (row === null || row === undefined) continue;
      lines.push(String(row));
    }
  };

  push(...buildReceiptBanners(receiptType, transactionType, ctx, width));

  push(center(p.companyName?.toUpperCase() || "INVOICE", width));
  if (p.companyTagline) push(center(p.companyTagline, width));
  for (const addr of [p.addressLine1, p.addressLine2, p.cityProvince]) {
    if (addr) push(center(addr, width));
  }
  if (p.taxId) push(center(`Tax ID: ${p.taxId}`, width));
  if (p.phone) push(center(`Tel: ${p.phone}`, width));
  if (p.email) push(center(p.email, width));

  push("");
  push(center(getDocumentTitle(receiptType, transactionType, p), width));
  if (p.invoiceSubtitle && receiptType !== RECEIPT_TYPES.PROFORMA) {
    push(center(p.invoiceSubtitle, width));
  }
  push(sep);

  push(labelValue("SDC code", sdcReceiptCode, width));
  push(labelValue("Receipt", RECEIPT_TYPE_LABELS[receiptType] ?? receiptType, width));
  push(labelValue("Transaction", TRANSACTION_TYPE_LABELS[transactionType] ?? transactionType, width));

  if (ctx.originalInvoiceNumber || sale.invoiceNumber) {
    push(labelValue("Invoice", sale.invoiceNumber ?? sale.id, width));
  }
  if (ctx.originalInvoiceNumber && ctx.isReprint) {
    push(labelValue("Original", ctx.originalInvoiceNumber, width));
  }
  if (ctx.copyIndex > 0) {
    push(labelValue("Copy #", String(ctx.copyIndex), width));
  }

  push(
    labelValue(
      "Date",
      new Date(sale.timestamp).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      }),
      width
    )
  );
  push(labelValue("Client", sale.customerName ?? "Walk-in Client", width));
  if (sale.customerPhone) push(labelValue("Client tel", sale.customerPhone, width));
  if (sale.customerTaxNumber) push(labelValue("Client tax", sale.customerTaxNumber, width));
  if (sale.customerEmail) push(labelValue("Client email", sale.customerEmail, width));
  if (sale.customerAddress) {
    for (const ln of wrapLines(`Client addr: ${sale.customerAddress}`, width)) {
      push(ln);
    }
  }
  push(labelValue("Cashier", sale.cashierName ?? "—", width));

  if (receiptType !== RECEIPT_TYPES.PROFORMA) {
    push(labelValue("Payment", sale.methodLabel ?? sale.method ?? "—", width));
  } else {
    push(center("NOT A TAX INVOICE — QUOTE ONLY", width));
  }

  if (transactionType === TRANSACTION_TYPES.REFUND || sale.status === "refunded") {
    push("");
    push(center("*** REFUND ***", width));
    push(
      center(
        new Date(sale.refund?.at ?? sale.timestamp).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        }),
        width
      )
    );
    if (sale.refund?.reason) {
      for (const ln of wrapLines(`Reason: ${sale.refund.reason}`, width)) {
        push(ln);
      }
    }
  }

  if (receiptType === RECEIPT_TYPES.TRAINING) {
    push("");
    for (const ln of wrapLines(
      "TRAINING MODE — No fiscal value. No digital signature. For practice only.",
      width
    )) {
      push(ln);
    }
  }

  push(thin);
  push(padEnd("QTY", 4) + " " + padEnd("ITEM", width - 4 - 10 - 2) + " " + padEnd("AMOUNT", 10, " "));
  push(thin);

  for (const it of sale.items ?? []) {
    const sub = (it.price ?? 0) * (it.qty ?? 0);
    push(formatReceiptItemLine(it.qty, it.name, sub, width));
    if (it.lotNumber) push(formatReceiptSubLine(`Lot ${it.lotNumber}`, width));
    if (it.expirationDate) {
      push(
        formatReceiptSubLine(
          `Exp ${new Date(it.expirationDate).toLocaleDateString()}`,
          width
        )
      );
    }
  }

  push(thin);
  push(labelValue("TOTAL USD", `$${(sale.totalUSD ?? 0).toFixed(2)}`, width));
  push(
    labelValue("TOTAL CDF", `${(sale.totalCDF ?? 0).toLocaleString()} FC`, width)
  );

  if (receiptType !== RECEIPT_TYPES.PROFORMA) {
    if (sale.reference) {
      for (const ln of wrapLines(`Ref: ${sale.reference}`, width)) {
        push(ln);
      }
    }
    if (sale.cardLastFour) {
      push(labelValue("Card", `****${sale.cardLastFour}`, width));
    }
    if (sale.changeDueUSD > 0) {
      push(labelValue("Change USD", `$${sale.changeDueUSD.toFixed(2)}`, width));
      const changeCdf =
        sale.changeDueUSD * (sale.totalCDF && sale.totalUSD ? sale.totalCDF / sale.totalUSD : 0);
      if (changeCdf > 0) {
        push(labelValue("Change CDF", `${Math.round(changeCdf).toLocaleString()} FC`, width));
      }
    }
  }

  push(sep);

  if (p.footerTitle && receiptType !== RECEIPT_TYPES.TRAINING) {
    push("");
    push(center(p.footerTitle.toUpperCase(), width));
  }
  if (p.footerBody) {
    push("");
    for (const ln of wrapLines(p.footerBody, width)) {
      push(ln);
    }
  }

  push("");
  push(center("— end —", width));

  return lines.join("\n");
}

function getDocumentTitle(receiptType, transactionType, profile) {
  if (receiptType === RECEIPT_TYPES.PROFORMA) return "PROFORMA INVOICE";
  if (receiptType === RECEIPT_TYPES.TRAINING) {
    return transactionType === TRANSACTION_TYPES.REFUND
      ? "TRAINING REFUND RECEIPT"
      : "TRAINING SALES RECEIPT";
  }
  if (transactionType === TRANSACTION_TYPES.REFUND) return "REFUND RECEIPT";
  return profile.invoiceTitle || "SALES INVOICE";
}

function buildReceiptBanners(receiptType, transactionType, ctx, width) {
  const rows = [];
  if (receiptType === RECEIPT_TYPES.COPY) {
    rows.push("", center("*** COPY ***", width));
    rows.push(center("Duplicate — not original fiscal receipt", width));
  }
  if (receiptType === RECEIPT_TYPES.TRAINING) {
    rows.push("", center("*** TRAINING ***", width));
  }
  if (receiptType === RECEIPT_TYPES.PROFORMA) {
    rows.push("", center("*** PROFORMA ***", width));
    rows.push(center("Estimate only — payment not recorded", width));
  }
  if (transactionType === TRANSACTION_TYPES.REFUND && receiptType === RECEIPT_TYPES.NORMAL) {
    rows.push("", center("*** REFUND TRANSACTION ***", width));
  }
  return rows;
}
