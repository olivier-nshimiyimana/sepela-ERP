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
  onAdd,
}) {
  const { t } = useLocale();
  const filtered = filterProductsBySearch(products, searchTerm);

  if (filtered.length === 0) {
    return (
      <p className="text-center text-gray-600 text-xs py-8 px-2">
        {t("products.noProducts")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col w-full divide-y divide-gray-800/80">
      {filtered.map((product) => {
        const sellable = isProductSellable(product, expiryAlertDays);
        const meta = productLineMeta(product, expiryAlertDays, t);
        const priceDual = formatDualCurrency(product.price, exchangeRate, primaryCurrency);

        return (
          <li key={product.id}>
            <button
              type="button"
              disabled={!sellable}
              onClick={() => onAdd(product)}
              title={`${product.name} — ${priceDual.primary} (≈ ${priceDual.secondary}) — ${meta.stockPart}`}
              className={`w-full px-2 py-2.5 text-left text-xs leading-snug transition-colors ${
                !sellable
                  ? "opacity-50 cursor-not-allowed text-gray-500"
                  : "text-gray-200 hover:bg-[#252525] hover:text-white"
              }`}
            >
              <span className="block truncate">
                <HighlightText text={product.name} searchTerm={searchTerm} />
                <span className="text-gray-500"> · </span>
                <span className="text-blue-400 font-semibold">{priceDual.primary}</span>
                <span className="text-gray-500"> · </span>
                <span
                  className={
                    meta.expired || meta.outOfStock
                      ? "text-red-400 font-medium"
                      : meta.lowStock
                        ? "text-amber-400 font-medium"
                        : "text-gray-400"
                  }
                >
                  {meta.stockPart}
                </span>
                {product.lotNumber && (
                  <>
                    <span className="text-gray-500"> · {t("pos.lot")} </span>
                    <HighlightText
                      text={product.displayLotNumber || product.lotNumber}
                      searchTerm={searchTerm}
                      className="text-gray-600"
                    />
                  </>
                )}
                {batchSummary(product, t) && (
                  <span className="text-cyan-500/80">{batchSummary(product, t)}</span>
                )}
                {meta.expiryPart && (
                  <span className="text-amber-500/90 font-medium">{meta.expiryPart}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
