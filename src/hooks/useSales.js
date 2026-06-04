import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

const COUNTER_KEY = "sepela-invoice-counter";

function saleId() {
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function allocateInvoiceNumber(prefix) {
  const clean = (prefix || "SEP").toString().replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "SEP";
  let n = parseInt(localStorage.getItem(COUNTER_KEY) || "1", 10);
  if (Number.isNaN(n) || n < 1) n = 1;
  const invoiceNumber = `${clean}-${String(n).padStart(5, "0")}`;
  localStorage.setItem(COUNTER_KEY, String(n + 1));
  return invoiceNumber;
}

export function useSales() {
  const [sales, setSales] = useLocalStorage("sepela-sales", []);

  const recordSale = useCallback(
    (payload) => {
      const { invoicePrefix, ...rest } = payload;
      const invoiceNumber = allocateInvoiceNumber(invoicePrefix);

      const entry = {
        id: saleId(),
        invoiceNumber,
        timestamp: new Date().toISOString(),
        status: "completed",
        ...rest,
      };

      setSales((prev) => [entry, ...prev]);
      return entry;
    },
    [setSales]
  );

  /**
   * @returns {{ ok: true, sale: object } | { ok: false, error: string }}
   */
  const refundSale = useCallback(
    (saleId, { reason, restoreStock, byUserId, byUserName }) => {
      let outcome = { ok: false, error: "Unknown error." };

      setSales((prev) => {
        const sale = prev.find((s) => s.id === saleId);
        if (!sale) {
          outcome = { ok: false, error: "Invoice not found." };
          return prev;
        }
        if (sale.status === "refunded") {
          outcome = { ok: false, error: "This invoice was already refunded." };
          return prev;
        }

        outcome = { ok: true, sale };

        return prev.map((s) =>
          s.id === saleId
            ? {
                ...s,
                status: "refunded",
                refund: {
                  at: new Date().toISOString(),
                  reason: (reason && reason.trim()) || "—",
                  restoreStock: !!restoreStock,
                  byUserId,
                  byUserName,
                },
              }
            : s
        );
      });

      return outcome;
    },
    [setSales]
  );

  return { sales, recordSale, refundSale };
}
