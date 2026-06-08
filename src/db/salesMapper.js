/** Map SQLite rows ↔ app sale objects. */

export function rowToSale(row, items) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    timestamp: row.timestamp,
    status: row.status,
    receiptType: row.receipt_type,
    transactionType: row.transaction_type,
    sdcReceiptCode: row.sdc_receipt_code,
    copyIndex: row.copy_index ?? 0,
    method: row.method,
    methodLabel: row.method_label,
    totalUSD: row.total_usd,
    totalCDF: row.total_cdf,
    changeDueUSD: row.change_due_usd ?? 0,
    amountReceived: row.amount_received,
    reference: row.reference,
    cardLastFour: row.card_last_four,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    customerEmail: row.customer_email,
    customerTaxNumber: row.customer_tax_number,
    exchangeRate: row.exchange_rate,
    promotionDiscountUSD: row.promotion_discount_usd ?? 0,
    appliedPromotionId: row.applied_promotion_id ?? null,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
    items: items.map((it) => ({
      id: it.id,
      productId: it.product_id,
      name: it.name,
      lotNumber: it.lot_number,
      expirationDate: it.expiration_date,
      price: it.price,
      qty: it.qty,
    })),
    refund: row.refund_at
      ? {
          at: row.refund_at,
          reason: row.refund_reason,
          restoreStock: !!row.refund_restore_stock,
          byUserId: row.refund_by_user_id,
          byUserName: row.refund_by_user_name,
        }
      : undefined,
  };
}
