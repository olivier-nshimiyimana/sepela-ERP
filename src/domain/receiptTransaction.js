/**
 * Certified invoicing receipt types for SDC (Sales Data Controller).
 * Each (receiptType × transactionType) maps to a unique code.
 */

export const RECEIPT_TYPES = {
  NORMAL: "NORMAL",
  COPY: "COPY",
  TRAINING: "TRAINING",
  PROFORMA: "PROFORMA",
};

export const TRANSACTION_TYPES = {
  SALES: "SALES",
  REFUND: "REFUND",
};

/** Unique SDC receipt transaction codes (stable for cloud sync). */
export const SDC_RECEIPT_CODES = {
  NORMAL_SALES: "RT_NORMAL_SALES",
  NORMAL_REFUND: "RT_NORMAL_REFUND",
  COPY_SALES: "RT_COPY_SALES",
  COPY_REFUND: "RT_COPY_REFUND",
  TRAINING_SALES: "RT_TRAINING_SALES",
  TRAINING_REFUND: "RT_TRAINING_REFUND",
  PROFORMA_SALES: "RT_PROFORMA_SALES",
};

const CODE_MATRIX = {
  [RECEIPT_TYPES.NORMAL]: {
    [TRANSACTION_TYPES.SALES]: SDC_RECEIPT_CODES.NORMAL_SALES,
    [TRANSACTION_TYPES.REFUND]: SDC_RECEIPT_CODES.NORMAL_REFUND,
  },
  [RECEIPT_TYPES.COPY]: {
    [TRANSACTION_TYPES.SALES]: SDC_RECEIPT_CODES.COPY_SALES,
    [TRANSACTION_TYPES.REFUND]: SDC_RECEIPT_CODES.COPY_REFUND,
  },
  [RECEIPT_TYPES.TRAINING]: {
    [TRANSACTION_TYPES.SALES]: SDC_RECEIPT_CODES.TRAINING_SALES,
    [TRANSACTION_TYPES.REFUND]: SDC_RECEIPT_CODES.TRAINING_REFUND,
  },
  [RECEIPT_TYPES.PROFORMA]: {
    [TRANSACTION_TYPES.SALES]: SDC_RECEIPT_CODES.PROFORMA_SALES,
  },
};

export const RECEIPT_TYPE_LABELS = {
  NORMAL: "Normal",
  COPY: "Copy",
  TRAINING: "Training",
  PROFORMA: "Proforma",
};

export const TRANSACTION_TYPE_LABELS = {
  SALES: "Sales",
  REFUND: "Refund",
};

/**
 * @param {string} receiptType
 * @param {string} transactionType
 * @returns {string|null}
 */
export function getSdcReceiptCode(receiptType, transactionType) {
  return CODE_MATRIX[receiptType]?.[transactionType] ?? null;
}

/**
 * @param {string} receiptType
 * @param {string} transactionType
 * @returns {{ ok: true, sdcReceiptCode: string } | { ok: false, error: string }}
 */
export function validateReceiptCombination(receiptType, transactionType) {
  const code = getSdcReceiptCode(receiptType, transactionType);
  if (!code) {
    return {
      ok: false,
      error: `Invalid receipt combination: ${receiptType} + ${transactionType}. PROFORMA is only valid for SALES.`,
    };
  }
  return { ok: true, sdcReceiptCode: code };
}

/**
 * Build receipt context for a completed sale (original issuance).
 * @param {{ trainingMode?: boolean }} options
 */
export function receiptContextForNewSale(options = {}) {
  const receiptType = options.trainingMode ? RECEIPT_TYPES.TRAINING : RECEIPT_TYPES.NORMAL;
  const transactionType = TRANSACTION_TYPES.SALES;
  const { sdcReceiptCode } = validateReceiptCombination(receiptType, transactionType);
  return {
    receiptType,
    transactionType,
    sdcReceiptCode,
    copyIndex: 0,
    isReprint: false,
  };
}

/**
 * Copy reprint from invoice history.
 */
export function receiptContextForCopy(sale) {
  const transactionType =
    sale.status === "refunded" ? TRANSACTION_TYPES.REFUND : TRANSACTION_TYPES.SALES;
  const receiptType =
    sale.receiptType === RECEIPT_TYPES.TRAINING
      ? RECEIPT_TYPES.TRAINING
      : RECEIPT_TYPES.COPY;
  const copyIndex = Math.max(1, sale.copyIndex ?? 1);
  const { sdcReceiptCode } = validateReceiptCombination(receiptType, transactionType);
  return {
    receiptType,
    transactionType,
    sdcReceiptCode,
    copyIndex,
    isReprint: true,
    originalInvoiceNumber: sale.invoiceNumber ?? sale.id,
  };
}

/**
 * Refund receipt emission (NORMAL or TRAINING per original sale mode).
 */
export function receiptContextForRefund(sale, options = {}) {
  const receiptType = options.trainingMode
    ? RECEIPT_TYPES.TRAINING
    : sale.receiptType === RECEIPT_TYPES.TRAINING
      ? RECEIPT_TYPES.TRAINING
      : RECEIPT_TYPES.NORMAL;
  const transactionType = TRANSACTION_TYPES.REFUND;
  const { sdcReceiptCode } = validateReceiptCombination(receiptType, transactionType);
  return {
    receiptType,
    transactionType,
    sdcReceiptCode,
    copyIndex: 0,
    isReprint: false,
    originalInvoiceNumber: sale.invoiceNumber ?? sale.id,
  };
}

/** Proforma quote (no fiscal issuance, SALES only). */
export function receiptContextForProforma() {
  const receiptType = RECEIPT_TYPES.PROFORMA;
  const transactionType = TRANSACTION_TYPES.SALES;
  const { sdcReceiptCode } = validateReceiptCombination(receiptType, transactionType);
  return {
    receiptType,
    transactionType,
    sdcReceiptCode,
    copyIndex: 0,
    isReprint: false,
    isProforma: true,
  };
}
