import HighlightText from "./HighlightText";
import { useLocale } from "../contexts/LocaleContext";
import { formatDualCurrency } from "../utils/currency";
import { filterProductsBySearch } from "../utils/productSearch";
import { getExpiryStatus, isProductSellable } from "../utils/productExpiry";
import { sellableStockQuantity } from "../utils/inventoryBreakdown";

function productLineMeta(product, expiryAlertDays, t) {
  const stockQty = sellableStockQuantity(product);
  const status = getExpiryStatus(product.expirationDate, expiryAlertDays);
  const outOfStock = stockQty <= 0;
  const expired = !outOfStock && status === "expired";

  let stockPart = t("products.stockCount", { count: stockQty });
  if (outOfStock) stockPart = t("products.outOfStock");
  else if (expired) stockPart = t("products.expired");

  const expiryPart = outOfStock
    ? ""
    : status === "soon"
      ? ` · ${t("products.expiringSoon")}`
      : status === "expired"
        ? ` · ${t("products.expired")}`
        : "";

  return {
    stockPart,
    expiryPart,
    outOfStock,
    expired,
    lowStock: !outOfStock && !expired && product.stock <= 5,
  };
}

function batchSummary(product, t) {
  if (!product.batchCount || product.batchCount <= 1) return null;
  return t("products.batches", { count: product.batchCount });
}

export default function ProductGrid({
  products,
  searchTerm,
  exchangeRate,
  primaryCurrency,
  expiryAlertDays,
  cartProductIds = new Set(),
  onAdd,
}) {
  const { t } = useLocale();
  const filtered = filterProductsBySearch(products, searchTerm);

  if (filtered.length === 0) {
    return (
      <p className="text-center sepela-hint text-xs py-8 px-2">
        {t("products.noProducts")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col w-full">
      {filtered.map((product) => {
        const sellable = isProductSellable(product, expiryAlertDays);
        const meta = productLineMeta(product, expiryAlertDays, t);
        const priceDual = formatDualCurrency(product.price, exchangeRate, primaryCurrency);
        const inCart = cartProductIds.has(product.id);

        return (
          <li key={product.id} className="shadow-[inset_0_-1px_0_#383838]">
            <button
              type="button"
              disabled={!sellable}
              onClick={() => onAdd(product)}
              title={`${product.name} — ${priceDual.primary} (≈ ${priceDual.secondary}) — ${meta.stockPart}`}
              className={`pos-product-btn w-full text-left transition-colors ${
                !sellable
                  ? "opacity-50 cursor-not-allowed text-sepela-muted"
                  : inCart
                    ? "pos-product-btn--in-cart text-white"
                    : "text-white hover:bg-[#353535]"
              }`}
            >
              <span className="block truncate">
                <HighlightText text={product.name} searchTerm={searchTerm} />
                <span className="text-sepela-muted"> · </span>
                <span className="text-white font-semibold sepela-money">{priceDual.primary}</span>
                <span className="text-sepela-muted"> · </span>
                <span
                  className={
                    meta.expired || meta.outOfStock
                      ? "text-red-400"
                      : meta.lowStock
                        ? "text-amber-400"
                        : "text-sepela-muted"
                  }
                >
                  {meta.stockPart}
                </span>
                {product.lotNumber && (
                  <>
                    <span className="sepela-text-secondary"> · {t("pos.lot")} </span>
                    <HighlightText
                      text={product.displayLotNumber || product.lotNumber}
                      searchTerm={searchTerm}
                      className="sepela-hint"
                    />
                  </>
                )}
                {batchSummary(product, t) && (
                  <span className="text-cyan-500/80">{batchSummary(product, t)}</span>
                )}
                {meta.expiryPart && (
                  <span className="text-amber-500/90 font-bold">{meta.expiryPart}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
