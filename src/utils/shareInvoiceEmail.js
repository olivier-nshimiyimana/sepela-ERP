import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { resolveInvoiceProfile } from "../data/defaultInvoiceProfile";
import { isTauriRuntime } from "../db/client";
import { translate } from "../i18n";
import { buildInvoiceVectorPdfDoc } from "./invoiceVectorPdf";
import { pickEmailComposeHref } from "./openEmailCompose";
import { savePdfDocument } from "./savePdfDocument";

/**
 * Save invoice PDF (user picks location), reveal in Explorer, then open email compose.
 */
export async function shareInvoiceByEmail({
  sale,
  profile,
  receiptContext = {},
  promotions = [],
  primaryCurrency,
  exchangeRate,
  locale,
  formatId = "A4",
}) {
  const invoiceProfile = resolveInvoiceProfile(profile, locale);
  const invoiceNumber = String(sale?.invoiceNumber ?? sale?.id ?? "invoice");
  const company =
    invoiceProfile.companyName?.trim() ||
    translate("notification.emailDefaultSender", locale);
  const to = String(sale?.customerEmail ?? "").trim();

  const subject = translate("notification.invoiceEmailSubject", locale, {
    number: invoiceNumber,
    company,
  });

  let pdfPath = null;
  if (isTauriRuntime()) {
    const doc = await buildInvoiceVectorPdfDoc({
      sale,
      profile,
      receiptContext,
      promotions,
      primaryCurrency,
      exchangeRate,
      locale,
      formatId,
    });
    pdfPath = await savePdfDocument(doc, invoiceNumber, {
      dialogTitle: translate("notification.invoicePdfSaveTitle", locale),
    });
    if (!pdfPath) {
      return { to, pdfPath: null, subject, cancelled: true };
    }
    await revealItemInDir(pdfPath);
  }

  const body = translate("notification.invoiceEmailBodyShort", locale, {
    number: invoiceNumber,
    company,
  });

  const href = pickEmailComposeHref(to, subject, body);

  if (isTauriRuntime()) {
    await openUrl(href);
  } else {
    window.location.href = href;
  }

  return { to, pdfPath, subject };
}
