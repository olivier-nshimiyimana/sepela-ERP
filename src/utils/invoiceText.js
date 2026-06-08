import { getPlatformCompanyLine } from "../data/platformBranding";
import { resolveInvoiceProfile } from "../data/defaultInvoiceProfile";
import {
  DEFAULT_LOCALE,
  paymentMethodLabel,
  receiptTypeLabel,
  transactionTypeLabel,
  translate,
} from "../i18n";
import {
  DEFAULT_PRIMARY_CURRENCY,
  formatDualCurrency,
  normalizePrimaryCurrency,
  saleExchangeRate,
} from "./currency";
import {
  RECEIPT_TYPES,
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
import {
  saleAppliedPromotionName,
  saleItemsSubtotalUsd,
  salePromotionDiscountUsd,
} from "./saleTotals";

export { RECEIPT_WIDTH };

/**
 * @param {object} sale
 * @param {object} profile
 * @param {object} [ctx] receiptType, transactionType, sdcReceiptCode, copyIndex, locale, ...
 * @param {number} [width]
 */
export function formatInvoicePlainText(sale, profile, ctx = {}, width = RECEIPT_WIDTH) {
  const locale = ctx.locale ?? DEFAULT_LOCALE;
  const t = (key, params) => translate(key, locale, params);
  const primaryCurrency = ctx.primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY;
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const saleRate = saleExchangeRate(sale, ctx.exchangeRate);
  const receiptType = ctx.receiptType ?? sale.receiptType ?? RECEIPT_TYPES.NORMAL;
  const transactionType =
    ctx.transactionType ??
    (sale.status === "refunded" && !ctx.isReprint
      ? TRANSACTION_TYPES.REFUND
      : sale.transactionType ?? TRANSACTION_TYPES.SALES);
  const sdcReceiptCode = ctx.sdcReceiptCode ?? sale.sdcReceiptCode ?? "RT_NORMAL_SALES";

  const p = resolveInvoiceProfile(profile, locale);
  const sep = repeatChar("=", width);
  const thin = repeatChar("-", width);
  const lines = [];

  const push = (...rows) => {
    for (const row of rows) {
      if (row === null || row === undefined) continue;
      lines.push(String(row));
    }
  };

  push(...buildReceiptBanners(receiptType, transactionType, ctx, width, locale));

  for (const addr of [p.addressLine1, p.addressLine2, p.cityProvince]) {
    if (addr) push(center(addr, width));
  }
  if (p.phone) push(center(t("receipt.tel", { phone: p.phone }), width));
  if (p.email) push(center(p.email, width));
  if (p.taxId) push(center(t("receipt.taxId", { id: p.taxId }), width));

  push(thin);
  const companyName = String(p.companyName ?? "").trim();
  if (companyName) push(center(companyName.toUpperCase(), width));
  if (p.companyTagline) push(center(p.companyTagline, width));

  push("");
  push(center(getDocumentTitle(receiptType, transactionType, p, locale), width));
  if (p.invoiceSubtitle && receiptType !== RECEIPT_TYPES.PROFORMA) {
    push(center(p.invoiceSubtitle, width));
  }
  push(sep);

  push(labelValue(t("receipt.sdcCode"), sdcReceiptCode, width));
  push(labelValue(t("receipt.receipt"), receiptTypeLabel(receiptType, locale), width));
  push(labelValue(t("receipt.transaction"), transactionTypeLabel(transactionType, locale), width));

  if (ctx.originalInvoiceNumber || sale.invoiceNumber) {
    push(labelValue(t("receipt.invoice"), sale.invoiceNumber ?? sale.id, width));
  }
  if (ctx.originalInvoiceNumber && ctx.isReprint) {
    push(labelValue(t("receipt.original"), ctx.originalInvoiceNumber, width));
  }
  if (ctx.copyIndex > 0) {
    push(labelValue(t("receipt.copyNumber"), String(ctx.copyIndex), width));
  }

  push(
    labelValue(
      t("receipt.date"),
      new Date(sale.timestamp).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      }),
      width
    )
  );
  push(labelValue(t("receipt.client"), sale.customerName ?? t("payment.walkIn"), width));
  if (sale.customerPhone) push(labelValue(t("receipt.clientTel"), sale.customerPhone, width));
  if (sale.customerTaxNumber) push(labelValue(t("receipt.clientTax"), sale.customerTaxNumber, width));
  if (sale.customerEmail) push(labelValue(t("receipt.clientEmail"), sale.customerEmail, width));
  if (sale.customerAddress) {
    for (const ln of wrapLines(t("receipt.clientAddr", { address: sale.customerAddress }), width)) {
      push(ln);
    }
  }
  if (receiptType !== RECEIPT_TYPES.PROFORMA) {
    push(
      labelValue(
        t("receipt.payment"),
        sale.methodLabel ?? paymentMethodLabel(sale.method, locale) ?? "—",
        width
      )
    );
  } else {
    push(center(t("receipt.notTaxInvoice"), width));
  }

  if (transactionType === TRANSACTION_TYPES.REFUND || sale.status === "refunded") {
    push("");
    push(center(t("receipt.refundBanner"), width));
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
      for (const ln of wrapLines(t("receipt.reason", { reason: sale.refund.reason }), width)) {
        push(ln);
      }
    }
  }

  if (receiptType === RECEIPT_TYPES.TRAINING) {
    push("");
    for (const ln of wrapLines(t("receipt.trainingNotice"), width)) {
      push(ln);
    }
  }

  push(thin);
  push(
    padEnd(t("receipt.qtyHeader"), 4) +
      " " +
      padEnd(t("receipt.itemHeader"), width - 4 - 10 - 2) +
      " " +
      padEnd(t("receipt.amountHeader"), 10, " ")
  );
  push(thin);

  for (const it of sale.items ?? []) {
    const sub = (it.price ?? 0) * (it.qty ?? 0);
    const amountLabel = formatDualCurrency(sub, saleRate, primary).primary;
    push(formatReceiptItemLine(it.qty, it.name, sub, width, amountLabel));
    if (it.lotNumber) {
      push(formatReceiptSubLine(`${t("pos.lot")} ${it.lotNumber}`, width));
    }
    if (it.expirationDate) {
      push(
        formatReceiptSubLine(
          `${t("pos.exp")} ${new Date(it.expirationDate).toLocaleDateString()}`,
          width
        )
      );
    }
  }

  push(thin);
  const subtotalUSD = saleItemsSubtotalUsd(sale);
  const promotionDiscountUSD = salePromotionDiscountUsd(sale);
  const totalUSD = Number(sale.totalUSD) || 0;
  const promotionName = saleAppliedPromotionName(sale, ctx.promotions ?? []);

  const subtotalDual = formatDualCurrency(subtotalUSD, saleRate, primary);
  push(
    labelValue(
      t("receipt.subtotal"),
      subtotalDual.primary,
      width
    )
  );

  if (promotionDiscountUSD > 0.001) {
    const discountDual = formatDualCurrency(promotionDiscountUSD, saleRate, primary);
    const discountLabel = promotionName
      ? t("receipt.promotionApplied", { name: promotionName })
      : t("receipt.promotionDiscount");
    push(labelValue(discountLabel, `-${discountDual.primary}`, width));
  }

  const totalDual = formatDualCurrency(totalUSD, saleRate, primary);
  push(labelValue(t("common.total"), totalDual.primary, width));

  if (receiptType !== RECEIPT_TYPES.PROFORMA) {
    if (sale.reference) {
      for (const ln of wrapLines(t("receipt.ref", { ref: sale.reference }), width)) {
        push(ln);
      }
    }
    if (sale.cardLastFour) {
      push(labelValue(t("receipt.card"), `****${sale.cardLastFour}`, width));
    }
    if (sale.changeDueUSD > 0) {
      const changeDual = formatDualCurrency(sale.changeDueUSD, saleRate, primary);
      push(labelValue(t("receipt.changePrimary", { currency: changeDual.primaryCode }), changeDual.primary, width));
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

  push(
    center(
      t("receipt.issuedBy", { name: sale.cashierName ?? translate("receipt.staffDefault", locale) }),
      width
    )
  );
  push("");
  push(center(getPlatformCompanyLine(locale), width));
  push("");
  push(center(t("receipt.end"), width));

  return lines.join("\n");
}

function getDocumentTitle(receiptType, transactionType, profile, locale) {
  if (receiptType === RECEIPT_TYPES.PROFORMA) return translate("receipt.proformaTitle", locale);
  if (receiptType === RECEIPT_TYPES.TRAINING) {
    return transactionType === TRANSACTION_TYPES.REFUND
      ? translate("receipt.trainingRefundTitle", locale)
      : translate("receipt.trainingSalesTitle", locale);
  }
  if (transactionType === TRANSACTION_TYPES.REFUND) return translate("receipt.refundTitle", locale);
  return profile.invoiceTitle || translate("receipt.salesTitle", locale);
}

function buildReceiptBanners(receiptType, transactionType, ctx, width, locale) {
  const rows = [];
  if (receiptType === RECEIPT_TYPES.COPY) {
    rows.push("", center(translate("receipt.copyBanner", locale), width));
    rows.push(center(translate("receipt.copyDuplicate", locale), width));
  }
  if (receiptType === RECEIPT_TYPES.TRAINING) {
    rows.push("", center(translate("receipt.trainingBanner", locale), width));
  }
  if (receiptType === RECEIPT_TYPES.PROFORMA) {
    rows.push("", center(translate("receipt.proformaBanner", locale), width));
    rows.push(center(translate("receipt.proformaEstimate", locale), width));
  }
  if (transactionType === TRANSACTION_TYPES.REFUND && receiptType === RECEIPT_TYPES.NORMAL) {
    rows.push("", center(translate("receipt.refundTransactionBanner", locale), width));
  }
  return rows;
}
