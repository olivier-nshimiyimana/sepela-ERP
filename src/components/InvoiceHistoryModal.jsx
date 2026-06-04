import { useMemo, useState } from "react";
import { FileText, Search, X } from "lucide-react";
import { can, PERMISSIONS } from "../auth/permissions";

const Box = "d" + "iv";

export default function InvoiceHistoryModal({
  isOpen,
  onClose,
  sales,
  user,
  onViewInvoice,
  onRefund,
}) {
  const [query, setQuery] = useState("");

  const canRefund = can(user.role, PERMISSIONS.REFUND_SALE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...sales].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    if (!q) return list.slice(0, 80);
    return list
      .filter(
        (s) =>
          (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(q)) ||
          (s.cashierName && s.cashierName.toLowerCase().includes(q)) ||
          s.id.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [sales, query]);

  if (!isOpen) return null;

  return (
    <Box className="absolute inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <h3 className="font-bold flex items-center gap-2">
            <FileText className="text-cyan-400" size={20} />
            Invoices &amp; refunds
          </h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </Box>

        <Box className="p-3 border-b border-gray-900">
          <Box className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search by invoice #, cashier…"
              className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg py-2 pl-9 pr-3 text-sm focus:border-cyan-600 outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Box>
        </Box>

        <Box className="overflow-auto flex-1 p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-8">No invoices found.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 sticky top-0 bg-[#1a1a1a]">
                <tr>
                  <th className="p-2">Invoice</th>
                  <th className="p-2">When</th>
                  <th className="p-2">Cashier</th>
                  <th className="p-2 text-right">USD</th>
                  <th className="p-2 w-36" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-900 hover:bg-[#252525]">
            <td className="p-2 font-mono font-bold text-cyan-400">
              {sale.invoiceNumber ?? `— ${sale.id.slice(-6)}`}
            </td>
                    <td className="p-2 text-gray-400 whitespace-nowrap text-xs">
                      {new Date(sale.timestamp).toLocaleString()}
                    </td>
                    <td className="p-2 text-xs">{sale.cashierName}</td>
                    <td className="p-2 text-right font-bold">${(sale.totalUSD ?? 0).toFixed(2)}</td>
                    <td className="p-2 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(sale)}
                        className="text-[10px] font-bold uppercase text-blue-400 hover:underline"
                      >
                        View
                      </button>
                      {canRefund && sale.status !== "refunded" && (
                        <button
                          type="button"
                          onClick={() => onRefund(sale)}
                          className="text-[10px] font-bold uppercase text-red-400 hover:underline"
                        >
                          Refund
                        </button>
                      )}
                      {sale.status === "refunded" && (
                        <span className="text-[10px] text-red-500 font-bold uppercase">Refunded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Box>
      </Box>
    </Box>
  );
}
