import "./invoice-print.css";
import {
  RECEIPT_TYPES,
  TRANSACTION_TYPES,
} from "../domain/receiptTransaction";

/** Branded invoice layout for screen + print */
export default function InvoicePrintBody({ sale, profile, formatId = "A4", receiptContext }) {
  const p = { ...profile };
  const receiptType = receiptContext?.receiptType ?? sale.receiptType ?? RECEIPT_TYPES.NORMAL;
  const transactionType =
    receiptContext?.transactionType ??
    sale.transactionType ??
    (sale.status === "refunded" ? TRANSACTION_TYPES.REFUND : TRANSACTION_TYPES.SALES);
  const refunded = sale.status === "refunded" || transactionType === TRANSACTION_TYPES.REFUND;
  const isThermal = formatId === "THERMAL_80";

  return (
    <div className={`invoice-print-root ${isThermal ? "p-3 text-[10px]" : "p-8 text-sm"} font-sans leading-relaxed`}>
      <ReceiptTypeBanner
        receiptType={receiptType}
        transactionType={transactionType}
        sdcCode={receiptContext?.sdcReceiptCode ?? sale.sdcReceiptCode}
        copyIndex={receiptContext?.copyIndex ?? sale.copyIndex}
      />
      <div className="inv-inner p-4 rounded-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className={`inv-heading ${isThermal ? "text-lg" : "text-3xl"} font-black tracking-tight`}>
              {p.companyName}
            </h1>
            <p className="text-xs inv-muted">{p.companyTagline}</p>
            <p className="text-xs mt-2 font-bold uppercase">{p.invoiceTitle}</p>
            {p.invoiceSubtitle && <p className="text-[11px] inv-soft">{p.invoiceSubtitle}</p>}
          </div>
          <div className="text-right">
            <p className={`inv-heading ${isThermal ? "text-xs" : "text-2xl"} font-semibold`}>Invoice {sale.invoiceNumber ?? sale.id}</p>
            <p className="text-[11px] inv-soft">{new Date(sale.timestamp).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-bold uppercase">Bill To</p>
            <p>{sale.customerName ?? "Walk-in Client"}</p>
            {sale.customerPhone && <p>{sale.customerPhone}</p>}
            {sale.customerTaxNumber && <p className="font-mono">Tax: {sale.customerTaxNumber}</p>}
            {sale.customerAddress && <p>{sale.customerAddress}</p>}
            {sale.customerEmail && <p>{sale.customerEmail}</p>}
          </div>
          <div className="text-right">
            <p>Issue date: {new Date(sale.timestamp).toLocaleDateString()}</p>
            <p>Ref: {sale.invoiceNumber ?? sale.id}</p>
            <p>Cashier: {sale.cashierName ?? "Sepela Staff"}</p>
            <p>
              Payment:{" "}
              {receiptType === RECEIPT_TYPES.PROFORMA
                ? "— (proforma)"
                : sale.methodLabel ?? sale.method ?? "—"}
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
            REFUNDED — {new Date(sale.refund.at).toLocaleString()}
            {sale.refund?.reason && <span className="inv-refund-note"> ({sale.refund.reason})</span>}
          </div>
        )}

        <table className="w-full mt-4 text-xs border-collapse">
          <thead>
            <tr className="inv-table-head">
              <th className="py-2 text-left">Description</th>
              <th className="py-2 text-center">Qty</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items ?? []).map((it, i) => (
              <tr key={i} className="inv-row">
                <td className="py-2">
                  {it.name}
                  {it.lotNumber && <div className="text-[10px] inv-light">Lot {it.lotNumber}</div>}
                </td>
                <td className="py-2 text-center">{it.qty}</td>
                <td className="py-2 text-right">${it.price.toFixed(2)}</td>
                <td className="py-2 text-right">${(it.price * it.qty).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-full max-w-[280px] text-xs">
          <div className="flex justify-between py-1"><span>Subtotal</span><span>${(sale.totalUSD ?? 0).toFixed(2)}</span></div>
          <div className="inv-total-row flex justify-between py-1 font-black">
            <span>Total (USD)</span>
            <span>${(sale.totalUSD ?? 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1"><span>Total (CDF)</span><span>{(sale.totalCDF ?? 0).toLocaleString()} FC</span></div>
        </div>

        <div className="mt-8 text-xs inv-muted">
          {p.footerTitle && <p className="font-bold uppercase mb-1">{p.footerTitle}</p>}
          {p.footerBody && <p className="whitespace-pre-wrap">{p.footerBody}</p>}
          <p className="mt-4">Issued by: {sale.cashierName ?? "Sepela Staff"}</p>
        </div>
      </div>
    </div>
  );
}

function ReceiptTypeBanner({ receiptType, transactionType, sdcCode, copyIndex }) {
  if (receiptType === RECEIPT_TYPES.NORMAL && transactionType === TRANSACTION_TYPES.SALES) {
    return null;
  }
  let label = receiptType;
  if (receiptType === RECEIPT_TYPES.COPY) label = `COPY #${copyIndex ?? 1}`;
  if (receiptType === RECEIPT_TYPES.TRAINING) label = "TRAINING — NO FISCAL VALUE";
  if (receiptType === RECEIPT_TYPES.PROFORMA) label = "PROFORMA — NOT A TAX INVOICE";
  if (transactionType === TRANSACTION_TYPES.REFUND) label = `${label} · REFUND`;

  return (
    <div className={`inv-receipt-banner inv-banner-${receiptType.toLowerCase()}`}>
      <p className="inv-banner-title">{label}</p>
      {sdcCode && <p className="inv-banner-code font-mono">{sdcCode}</p>}
    </div>
  );
}
