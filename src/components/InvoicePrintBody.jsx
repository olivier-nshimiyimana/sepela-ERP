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
import {
  saleAppliedPromotionName,
  saleItemsSubtotalUsd,
  salePromotionDiscountUsd,
} from "../utils/saleTotals";

/** Branded invoice layout for screen + print + PDF (hex CSS only — no Tailwind). */
export default function InvoicePrintBody({
  sale,
  profile,
  formatId = "A4",
  receiptContext,
  promotions = [],
}) {
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

  const subtotalUSD = saleItemsSubtotalUsd(sale);
  const promotionDiscountUSD = salePromotionDiscountUsd(sale);
  const totalUSD = Number(sale.totalUSD) || 0;
  const promotionName = saleAppliedPromotionName(sale, promotions);

  const rootClass = `invoice-print-root ${isThermal ? "invoice-print-root--thermal" : "invoice-print-root--a4"}`;

  return (
    <div className={rootClass}>
      <ReceiptTypeBanner
        receiptType={receiptType}
        transactionType={transactionType}
        sdcCode={receiptContext?.sdcReceiptCode ?? sale.sdcReceiptCode}
        copyIndex={receiptContext?.copyIndex ?? sale.copyIndex}
        t={t}
      />
      <div className="inv-inner">
        <MerchantInvoiceHeader profile={p} isThermal={isThermal} t={t} />

        <div className="inv-doc-header">
          <div>
            <p className="inv-doc-type">{p.invoiceTitle}</p>
            {p.invoiceSubtitle ? <p className="inv-doc-subtitle">{p.invoiceSubtitle}</p> : null}
          </div>
          <div className="inv-meta-right">
            <p className={`inv-heading ${isThermal ? "inv-heading-xs" : "inv-heading-md"}`}>
              {t("receipt.invoiceLabel", { number: sale.invoiceNumber ?? sale.id })}
            </p>
          </div>
        </div>

        <div className="inv-grid-2">
          <div>
            <p className="inv-label">{t("receipt.billTo")}</p>
            <p>{sale.customerName ?? t("payment.walkIn")}</p>
            {sale.customerPhone ? <p>{sale.customerPhone}</p> : null}
            {sale.customerTaxNumber ? (
              <p className="inv-mono">
                {t("payment.taxNumber")}: {sale.customerTaxNumber}
              </p>
            ) : null}
            {sale.customerAddress ? <p>{sale.customerAddress}</p> : null}
            {sale.customerEmail ? <p>{sale.customerEmail}</p> : null}
          </div>
          <div className="inv-grid-right">
            <p>{t("receipt.issueDate", { date: new Date(sale.timestamp).toLocaleDateString() })}</p>
            <p>{t("receipt.refShort", { ref: sale.invoiceNumber ?? sale.id })}</p>
            <p>
              {t("receipt.payment")}: {paymentLabel}
            </p>
            {(receiptContext?.sdcReceiptCode ?? sale.sdcReceiptCode) ? (
              <p className="inv-light inv-mono">
                SDC: {receiptContext?.sdcReceiptCode ?? sale.sdcReceiptCode}
              </p>
            ) : null}
          </div>
        </div>

        {refunded ? (
          <div className="inv-refund">
            {t("receipt.refundedAt", { date: new Date(sale.refund.at).toLocaleString() })}
            {sale.refund?.reason ? (
              <span className="inv-refund-note"> ({sale.refund.reason})</span>
            ) : null}
          </div>
        ) : null}

        <table className="inv-table">
          <thead>
            <tr className="inv-table-head">
              <th>{t("receipt.description")}</th>
              <th className="inv-num">{t("common.qty")}</th>
              <th className="inv-money">{t("receipt.unitPriceShort")}</th>
              <th className="inv-money">{t("receipt.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items ?? []).map((it, i) => (
              <tr key={i} className="inv-row">
                <td>
                  {it.name}
                  {it.lotNumber ? (
                    <div className="inv-light">
                      {t("pos.lot")} {it.lotNumber}
                    </div>
                  ) : null}
                </td>
                <td className="inv-num inv-amount">{it.qty}</td>
                <td className="inv-money inv-amount">{currency.formatPrimary(it.price, saleRate)}</td>
                <td className="inv-money inv-amount">
                  {currency.formatPrimary(it.price * it.qty, saleRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-totals">
          <div className="inv-totals-line">
            <span>{t("receipt.subtotal")}</span>
            <span className="inv-amount">{currency.formatPrimary(subtotalUSD, saleRate)}</span>
          </div>
          {promotionDiscountUSD > 0.001 ? (
            <div className="inv-totals-line inv-promo-line">
              <span>
                {promotionName
                  ? t("receipt.promotionApplied", { name: promotionName })
                  : t("receipt.promotionDiscount")}
              </span>
              <span className="inv-amount">-{currency.formatPrimary(promotionDiscountUSD, saleRate)}</span>
            </div>
          ) : null}
          <div className="inv-totals-line inv-total-row">
            <span>{t("common.total")}</span>
            <span className="inv-amount">{currency.formatPrimary(totalUSD, saleRate)}</span>
          </div>
        </div>

        <div className="inv-footer">
          {p.footerTitle ? <p className="inv-footer-title">{p.footerTitle}</p> : null}
          {p.footerBody ? <p className="inv-footer-body">{p.footerBody}</p> : null}
          <p className="inv-footer-issued">
            {t("receipt.issuedBy", { name: sale.cashierName ?? t("receipt.staffDefault") })}
          </p>
          <p className="inv-footer-brand">{getPlatformCompanyLine(locale)}</p>
        </div>
      </div>
    </div>
  );
}

function MerchantInvoiceHeader({ profile, isThermal, t }) {
  const hasContact =
    profile.addressLine1 ||
    profile.addressLine2 ||
    profile.cityProvince ||
    profile.phone ||
    profile.email ||
    profile.taxId;

  const companyName = String(profile.companyName ?? "").trim();

  return (
    <header className="inv-merchant-header">
      <div className="inv-merchant-top">
        <div className="inv-merchant-logo">
          <CompanyLogo src={profile.companyLogo} compact={isThermal} />
        </div>
        {hasContact ? (
          <div className="inv-merchant-details">
            {profile.addressLine1 ? <p>{profile.addressLine1}</p> : null}
            {profile.addressLine2 ? <p>{profile.addressLine2}</p> : null}
            {profile.cityProvince ? <p>{profile.cityProvince}</p> : null}
            {profile.phone ? <p>{t("receipt.tel", { phone: profile.phone })}</p> : null}
            {profile.email ? <p>{profile.email}</p> : null}
            {profile.taxId ? <p>{t("receipt.taxId", { id: profile.taxId })}</p> : null}
          </div>
        ) : (
          <div />
        )}
        <div className="inv-merchant-top-spacer" aria-hidden="true" />
      </div>
      <hr className="inv-merchant-rule" />
      {companyName ? <h1 className="inv-merchant-name">{companyName}</h1> : null}
      {profile.companyTagline ? (
        <p className="inv-merchant-tagline">{profile.companyTagline}</p>
      ) : null}
    </header>
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
      {sdcCode ? <p className="inv-banner-code">{sdcCode}</p> : null}
    </div>
  );
}
