import HighlightText from "./HighlightText";
import { filterProductsBySearch } from "../utils/productSearch";
import { getExpiryStatus, isProductSellable } from "../utils/productExpiry";

function productLineMeta(product, expiryAlertDays) {
  const status = getExpiryStatus(product.expirationDate, expiryAlertDays);
  const outOfStock = product.stock <= 0;
  const expired = status === "expired";

  let stockPart = `Stock ${product.stock}`;
  if (outOfStock) stockPart = "Out of stock";
  else if (expired) stockPart = "Expired";

  const expiryPart =
    status === "soon" ? " · Expiring soon" : status === "expired" ? " · Expired" : "";

  return {
    stockPart,
    expiryPart,
    outOfStock,
    expired,
    lowStock: !outOfStock && !expired && product.stock <= 5,
  };
}

function batchSummary(product) {
  if (!product.batchCount || product.batchCount <= 1) return null;
  return ` · ${product.batchCount} batches`;
}

export default function ProductGrid({ products, searchTerm, expiryAlertDays, onAdd }) {
  const filtered = filterProductsBySearch(products, searchTerm);

  if (filtered.length === 0) {
    return (
      <p className="text-center text-gray-600 text-xs py-8 px-2">
        No products match your search
      </p>
    );
  }

  return (
    <ul className="flex flex-col w-full divide-y divide-gray-800/80">
      {filtered.map((product) => {
        const sellable = isProductSellable(product, expiryAlertDays);
        const meta = productLineMeta(product, expiryAlertDays);

        return (
          <li key={product.id}>
            <button
              type="button"
              disabled={!sellable}
              onClick={() => onAdd(product)}
              title={`${product.name} — $${product.price.toFixed(2)} — ${meta.stockPart}`}
              className={`w-full px-2 py-2.5 text-left text-xs leading-snug transition-colors ${
                !sellable
                  ? "opacity-50 cursor-not-allowed text-gray-500"
                  : "text-gray-200 hover:bg-[#252525] hover:text-white"
              }`}
            >
              <span className="block truncate">
                <HighlightText text={product.name} searchTerm={searchTerm} />
                <span className="text-gray-500"> · </span>
                <span className="text-blue-400 font-semibold">${product.price.toFixed(2)}</span>
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
                    <span className="text-gray-500"> · Lot </span>
                    <HighlightText
                      text={product.displayLotNumber || product.lotNumber}
                      searchTerm={searchTerm}
                      className="text-gray-600"
                    />
                  </>
                )}
                {batchSummary(product) && (
                  <span className="text-cyan-500/80">{batchSummary(product)}</span>
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
