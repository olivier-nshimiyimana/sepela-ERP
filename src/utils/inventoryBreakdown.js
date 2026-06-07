/** Universal bulk-to-single-unit inventory breakdown (Excel spreadsheet model). */

export const DEFAULT_INVENTORY_BREAKDOWN = {
  buyUnit: "Unit",
  buyUnitCost: 0,
  qtyPerUnit: 1,
  itemSizeLabel: "",
  stockQuantityItems: 0,
  reorderLevelItems: 0,
};

export const REORDER_STATUS = {
  OK: "OK",
  REORDER: "REORDER",
};

/**
 * Item unit cost = Buy Unit Cost / Qty Per Unit (division-by-zero safe).
 */
export function calcItemUnitCost(buyUnitCost, qtyPerUnit) {
  const cost = Number(buyUnitCost);
  const qty = Number(qtyPerUnit);
  if (!Number.isFinite(cost) || !Number.isFinite(qty) || qty <= 0) {
    return 0;
  }
  return cost / qty;
}

/**
 * Dynamic reorder evaluator: REORDER when stock <= reorder threshold.
 */
export function calcReorderStatus(stockQuantityItems, reorderLevelItems) {
  const stock = Number(stockQuantityItems);
  const reorder = Number(reorderLevelItems);
  if (!Number.isFinite(stock) || !Number.isFinite(reorder)) {
    return REORDER_STATUS.OK;
  }
  return stock <= reorder ? REORDER_STATUS.REORDER : REORDER_STATUS.OK;
}

export function normalizeInventoryBreakdown(raw = {}, stockFallback = 0) {
  const qtyPerUnit = Math.max(1, parseInt(raw.qtyPerUnit ?? raw.qty_per_unit, 10) || 1);
  const buyUnitCost = Math.max(0, Number(raw.buyUnitCost ?? raw.buy_unit_cost) || 0);
  const stockQuantityItems = Math.max(
    0,
    parseInt(raw.stockQuantityItems ?? raw.stock_quantity_items ?? stockFallback, 10) || 0
  );
  const reorderLevelItems = Math.max(
    0,
    parseInt(raw.reorderLevelItems ?? raw.reorder_level_items, 10) || 0
  );

  return {
    buyUnit: String(raw.buyUnit ?? raw.buy_unit ?? DEFAULT_INVENTORY_BREAKDOWN.buyUnit).trim() || "Unit",
    buyUnitCost,
    qtyPerUnit,
    itemSizeLabel: String(raw.itemSizeLabel ?? raw.item_size_label ?? "").trim(),
    stockQuantityItems,
    reorderLevelItems,
    itemUnitCost: calcItemUnitCost(buyUnitCost, qtyPerUnit),
    reorderStatus: calcReorderStatus(stockQuantityItems, reorderLevelItems),
  };
}

/** Sellable stock for POS/FEFO — always single base items, never bulk packages. */
export function sellableStockQuantity(product) {
  if (product?.stockQuantityItems != null) {
    return Math.max(0, Number(product.stockQuantityItems) || 0);
  }
  return Math.max(0, Number(product?.stock) || 0);
}
