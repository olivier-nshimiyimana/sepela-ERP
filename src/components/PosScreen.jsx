import { useCallback, useMemo, useRef, useState } from "react";
import { CreditCard, Search } from "lucide-react";
import CartTable from "./CartTable";
import ExpiryAlertsBanner from "./ExpiryAlertsBanner";
import PaymentModal from "./PaymentModal";
import ProductGrid from "./ProductGrid";
import { can, PERMISSIONS } from "../auth/permissions";
import { usePosKeyboard } from "../hooks/usePosKeyboard";
import { filterProductsBySearch } from "../utils/productSearch";
import { buildFefoCatalog, buildFefoCartLine } from "../utils/fefo";

const Box = "d" + "iv";

export default function PosScreen({
  user,
  products,
  customers,
  exchangeRate,
  expiryAlertDays,
  cart,
  totalUSD,
  upsertLine,
  replaceCart,
  removeLine,
  clearCart,
  onPaymentComplete,
  onProforma,
  onOpenProducts,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const searchRef = useRef(null);

  const showExpiryAlerts = can(user.role, PERMISSIONS.MANAGE_PRODUCTS);
  const catalogProducts = useMemo(
    () => buildFefoCatalog(products, cart, expiryAlertDays),
    [products, cart, expiryAlertDays]
  );

  const handleAdd = (product) => {
    const existing = cart.find((item) => item.id === product.id);
    const result = buildFefoCartLine({
      products,
      cart,
      reference: product,
      qty: (existing?.qty ?? 0) + 1,
      alertDays: expiryAlertDays,
      excludeLineId: existing?.id ?? null,
    });
    if (!result.ok) {
      alert(result.error);
      return;
    }
    upsertLine(result.line);
  };

  const handleIncrement = (id) => {
    const line = cart.find((i) => i.id === id);
    if (!line) return;
    const result = buildFefoCartLine({
      products,
      cart,
      reference: line,
      qty: line.qty + 1,
      alertDays: expiryAlertDays,
      excludeLineId: line.id,
    });
    if (!result.ok) {
      alert(result.error);
      return;
    }
    upsertLine(result.line);
  };

  const handleDecrement = (id) => {
    const line = cart.find((item) => item.id === id);
    if (!line) return;
    if (line.qty <= 1) {
      removeLine(id);
      return;
    }
    const result = buildFefoCartLine({
      products,
      cart,
      reference: line,
      qty: line.qty - 1,
      alertDays: expiryAlertDays,
      excludeLineId: line.id,
    });
    if (!result.ok) {
      alert(result.error);
      return;
    }
    upsertLine(result.line);
  };

  const handleSetQty = (id, rawQty) => {
    const line = cart.find((item) => item.id === id);
    const parsed = parseInt(rawQty, 10);

    if (!line || rawQty === "" || Number.isNaN(parsed) || parsed <= 0) {
      removeLine(id);
      return;
    }

    const result = buildFefoCartLine({
      products,
      cart,
      reference: line,
      qty: parsed,
      alertDays: expiryAlertDays,
      excludeLineId: line.id,
    });
    if (!result.ok) {
      alert(result.error);
      if (result.available > 0) {
        const fallback = buildFefoCartLine({
          products,
          cart,
          reference: line,
          qty: result.available,
          alertDays: expiryAlertDays,
          excludeLineId: line.id,
        });
        if (fallback.ok) upsertLine(fallback.line);
      } else {
        removeLine(id);
      }
      return;
    }

    upsertLine(result.line);
  };

  const openPayment = useCallback(() => {
    const refreshed = [];
    for (const line of cart) {
      const result = buildFefoCartLine({
        products,
        cart,
        reference: line,
        qty: line.qty,
        alertDays: expiryAlertDays,
        excludeLineId: line.id,
      });
      if (!result.ok) {
        alert(result.error);
        return;
      }
      refreshed.push(result.line);
    }
    replaceCart(refreshed);
    setIsPaymentOpen(true);
  }, [cart, products, expiryAlertDays, replaceCart]);

  usePosKeyboard({
    enabled: !isPaymentOpen,
    cartLength: cart.length,
    onFocusSearch: () => searchRef.current?.focus(),
    onOpenPayment: openPayment,
  });

  const handleSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const matches = filterProductsBySearch(catalogProducts, searchTerm).filter((p) => p.stock > 0);
    if (matches.length >= 1) {
      e.preventDefault();
      handleAdd(matches[0]);
      setSearchTerm("");
      return;
    }
    if (cart.length > 0) {
      e.preventDefault();
      openPayment();
    }
  };

  return (
    <>
      {showExpiryAlerts && (
        <ExpiryAlertsBanner
          products={products}
          expiryAlertDays={expiryAlertDays}
          onManageProducts={onOpenProducts}
        />
      )}

      <Box className="flex flex-1 overflow-hidden">
        <section className="flex-1 flex flex-col bg-[#0f0f0f]">
          <Box className="p-4 border-b border-gray-900 flex gap-2">
            <Box className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search name, lot… multi-word (Enter add / pay, F4)"
                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-md py-2 pl-10 pr-4 focus:outline-none focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                aria-keyshortcuts="F3 F4 Enter"
              />
            </Box>
          </Box>

          <Box className="flex-1 overflow-auto p-4">
            <CartTable
              cart={cart}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              onSetQty={handleSetQty}
              onRemove={removeLine}
            />
          </Box>
        </section>

        <aside className="w-80 bg-[#161616] flex flex-col border-l border-gray-800 p-2">
          <Box className="flex-1 overflow-auto mb-4 min-h-0">
            <ProductGrid
              products={catalogProducts}
              searchTerm={searchTerm}
              expiryAlertDays={expiryAlertDays}
              onAdd={handleAdd}
            />
          </Box>

          <Box className="mt-auto grid gap-2 shrink-0">
            <button
              type="button"
              onClick={onProforma}
              disabled={cart.length === 0}
              className="h-10 text-xs text-purple-300 uppercase font-bold border border-purple-800 rounded disabled:opacity-40 hover:bg-purple-950/40"
            >
              Proforma quote
            </button>
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0 || window.confirm("Clear this sale?")) {
                  clearCart();
                }
              }}
              className="h-10 text-xs text-red-500 uppercase font-bold border border-red-900 rounded"
            >
              Clear sale
            </button>
            <button
              type="button"
              onClick={openPayment}
              disabled={cart.length === 0}
              title="Payment (F4 or Enter)"
              className="h-24 bg-green-600 hover:bg-green-700 disabled:bg-gray-800 rounded flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <CreditCard size={32} />
              <span className="text-xl font-black mt-1 uppercase">Payment</span>
              <span className="text-[9px] text-green-200/80 mt-0.5 font-bold">F4 · Enter</span>
            </button>
          </Box>
        </aside>
      </Box>

      <footer className="bg-[#1a1a1a] p-5 border-t-4 border-blue-600 flex justify-between items-center shrink-0">
        <Box>
          <p className="text-[10px] uppercase font-bold text-gray-500">Total USD</p>
          <h2 className="text-4xl font-black italic">${totalUSD.toFixed(2)}</h2>
        </Box>
        <Box className="text-right">
          <p className="text-[10px] uppercase font-bold text-gray-500 tracking-[0.2em]">Total CDF</p>
          <h2 className="text-3xl font-bold text-green-500 italic">
            {(totalUSD * exchangeRate).toLocaleString()} FC
          </h2>
        </Box>
      </footer>

      <PaymentModal
        isOpen={isPaymentOpen}
        customers={customers}
        totalUSD={totalUSD}
        exchangeRate={exchangeRate}
        onClose={() => setIsPaymentOpen(false)}
        onComplete={async (summary, options) => {
          const ok = await onPaymentComplete(summary, cart, options);
          if (ok !== false) {
            setIsPaymentOpen(false);
          }
        }}
      />
    </>
  );
}
