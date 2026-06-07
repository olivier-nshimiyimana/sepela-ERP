import "./invoice-print.css";
import CompanyLogo from "./CompanyLogo";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { paymentMethodLabel } from "../i18n";
import { saleExchangeRate } from "../utils/currency";
import { resolveInvoiceProfile } from "../data/defaultInvoiceProfile";
import { getPlatformCompanyLine } from "../data/platformBranding";
import {
  RECEIPT_TYPES,
  TRANSACTION_TYPES,
} from "../domain/receiptTransaction";

/** Branded invoice layout for screen + print */
export default function InvoicePrintBody({ sale, profile, formatId = "A4", receiptContext }) {
  const currency = useCurrency();
  const { t, locale } = useLocale();
  const saleRate = saleExchangeRate(sale, currency.exchangeRate);
  const p = resolveInvoiceProfile(profile, locale);
  const receiptType = receiptContext?.receiptType ?? sale.receiptType ?? RECEIPT_TYPES.NORMAL;
  const transactionType =
    receiptContext?.transactionType ??
    sale.transactionType ??
    (sale.status === "refunded" ? TRANSACTION_TYPES.REFUND : TRANSACTION_TYPES.SALES);
  const refunded = sale.status === "refunded" || transactionType === TRANSACTION_TYPES.REFUND;
  const isThermal = formatId === "THERMAL_80";
  const paymentLabel =
    receiptType === RECEIPT_TYPES.PROFORMA
      ? t("receipt.proformaPayment")
      : sale.methodLabel ?? paymentMethodLabel(sale.method, locale) ?? "—";

  return (
    <div className={`invoice-print-root ${isThermal ? "p-3 text-[10px]" : "p-8 text-sm"} font-sans leading-relaxed`}>
      <ReceiptTypeBanner
        receiptType={receiptType}
        transactionType={transactionType}
        sdcCode={receiptContext?.sdcReceiptCode ?? sale.sdcReceiptCode}
        copyIndex={receiptContext?.copyIndex ?? sale.copyIndex}
        t={t}
      />
      <div className="inv-inner p-4 rounded-sm">
        <div className="flex items-start justify-between">
          <div className="inv-header-brand">
            <CompanyLogo src={p.companyLogo} compact={isThermal} />
            <div>
              <h1 className={`inv-heading ${isThermal ? "text-lg" : "text-3xl"} font-black tracking-tight`}>
                {p.companyName}
              </h1>
              <p className="text-xs inv-muted">{p.companyTagline}</p>
              <p className="text-xs mt-2 font-bold uppercase">{p.invoiceTitle}</p>
              {p.invoiceSubtitle && <p className="text-[11px] inv-soft">{p.invoiceSubtitle}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className={`inv-heading ${isThermal ? "text-xs" : "text-2xl"} font-semibold`}>
              {t("receipt.invoiceLabel", { number: sale.invoiceNumber ?? sale.id })}
            </p>
            <p className="text-[11px] inv-soft">{new Date(sale.timestamp).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-bold uppercase">{t("receipt.billTo")}</p>
            <p>{sale.customerName ?? t("payment.walkIn")}</p>
            {sale.customerPhone && <p>{sale.customerPhone}</p>}
            {sale.customerTaxNumber && (
              <p className="font-mono">{t("payment.taxNumber")}: {sale.customerTaxNumber}</p>
            )}
            {sale.customerAddress && <p>{sale.customerAddress}</p>}
            {sale.customerEmail && <p>{sale.customerEmail}</p>}
          </div>
          <div className="text-right">
            <p>
              {t("receipt.issueDate", { date: new Date(sale.timestamp).toLocaleDateString() })}
            </p>
            <p>{t("receipt.refShort", { ref: sale.invoiceNumber ?? sale.id })}</p>
            <p>
              {t("receipt.cashier")}: {sale.cashierName ?? t("receipt.staffDefault")}
            </p>
            <p>
              {t("receipt.payment")}: {paymentLabel}
            </p>
            {(receiptContext?.sdcReceiptCode ?? sale.sdcReceiptCode) && (
              <p className="font-mono text-[10px] inv-light">
                SDC: {receiptContext?.sdcReceiptCode ?? sale.sdcReceiptCode}
              </p>
            )}
          </div>
        </div>

        {refunded && (
          <div className="inv-refund mt-3 p-2 text-xs font-bold rounded-sm">
            {t("receipt.refundedAt", { date: new Date(sale.refund.at).toLocaleString() })}
            {sale.refund?.reason && <span className="inv-refund-note"> ({sale.refund.reason})</span>}
          </div>
        )}

        <table className="w-full mt-4 text-xs border-collapse">
          <thead>
            <tr className="inv-table-head">
              <th className="py-2 text-left">{t("receipt.description")}</th>
              <th className="py-2 text-center">{t("common.qty")}</th>
              <th className="py-2 text-right">
                {t("receipt.unitPrice", { currency: currency.primaryCurrency })}
              </th>
              <th className="py-2 text-right">
                {t("receipt.amount", { currency: currency.primaryCurrency })}
              </th>
            </tr>
          </thead>
          <tbody>
            {(sale.items ?? []).map((it, i) => (
              <tr key={i} className="inv-row">
                <td className="py-2">
                  {it.name}
                  {it.lotNumber && (
                    <div className="text-[10px] inv-light">
                      {t("pos.lot")} {it.lotNumber}
                    </div>
                  )}
                </td>
                <td className="py-2 text-center">{it.qty}</td>
                <td className="py-2 text-right">{currency.formatPrimary(it.price, saleRate)}</td>
                <td className="py-2 text-right">
                  {currency.formatPrimary(it.price * it.qty, saleRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-full max-w-[280px] text-xs">
          <div className="flex justify-between py-1">
            <span>{t("receipt.subtotal")}</span>
            <span>{currency.formatPrimary(sale.totalUSD ?? 0, saleRate)}</span>
          </div>
          <div className="inv-total-row flex justify-between py-1 font-black">
            <span>{t("receipt.totalCurrency", { currency: currency.primaryCurrency })}</span>
            <span>{currency.formatPrimary(sale.totalUSD ?? 0, saleRate)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>{t("receipt.totalCurrency", { currency: currency.secondaryCurrency })}</span>
            <span>{currency.formatSecondary(sale.totalUSD ?? 0, saleRate)}</span>
          </div>
        </div>

        <div className="mt-8 text-xs inv-muted">
          {p.footerTitle && <p className="font-bold uppercase mb-1">{p.footerTitle}</p>}
          {p.footerBody && <p className="whitespace-pre-wrap">{p.footerBody}</p>}
          <p className="mt-4">
            {t("receipt.issuedBy", { name: sale.cashierName ?? t("receipt.staffDefault") })}
          </p>
          <p className="mt-3 text-[10px] inv-light font-semibold uppercase tracking-wide">
            {getPlatformCompanyLine(locale)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ReceiptTypeBanner({ receiptType, transactionType, sdcCode, copyIndex, t }) {
  if (receiptType === RECEIPT_TYPES.NORMAL && transactionType === TRANSACTION_TYPES.SALES) {
    return null;
  }
  let label = receiptType;
  if (receiptType === RECEIPT_TYPES.COPY) {
    label = t("receipt.copyBannerLabel", { n: copyIndex ?? 1 });
  }
  if (receiptType === RECEIPT_TYPES.TRAINING) label = t("receipt.trainingNoFiscal");
  if (receiptType === RECEIPT_TYPES.PROFORMA) label = t("receipt.proformaNotTax");
  if (transactionType === TRANSACTION_TYPES.REFUND) label = `${label}${t("receipt.refundSuffix")}`;

  return (
    <div className={`inv-receipt-banner inv-banner-${receiptType.toLowerCase()}`}>
      <p className="inv-banner-title">{label}</p>
      {sdcCode && <p className="inv-banner-code font-mono">{sdcCode}</p>}
    </div>
  );
}
