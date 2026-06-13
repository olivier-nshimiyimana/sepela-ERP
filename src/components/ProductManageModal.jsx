import { useMemo, useRef, useState } from "react";
import { Download, Package, Pencil, Plus, ShoppingCart, Trash2, Truck, Upload } from "lucide-react";
import ManagementScreen from "./ManagementScreen";
import ExpiryBadge from "./ExpiryBadge";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatExpiryDate, hasSellableStock } from "../utils/productExpiry";
import { sellableStockQuantity } from "../utils/inventoryBreakdown";
import {
  buildProductImportCsv,
  parseProductImportCsv,
  PRODUCT_IMPORT_COLUMNS,
} from "../utils/productImport";

const Box = "d" + "iv";

function emptyProductFields() {
  return {
    name: "",
    lotNumber: "",
    expirationDate: "",
    price: "",
    stock: "",
    categoryId: "",
    buyUnit: "",
    buyUnitCost: "",
    qtyPerUnit: "",
    itemSizeLabel: "",
    reorderLevelItems: "",
  };
}

function fieldsFromProduct(initial, currency) {
  if (!initial) return emptyProductFields();
  return {
    name: initial.name ?? "",
    lotNumber: initial.lotNumber ?? "",
    expirationDate: initial.expirationDate ?? "",
    price: currency.usdToInput(initial.price),
    stock: (initial.stockQuantityItems ?? initial.stock)?.toString() ?? "",
    categoryId: initial.categoryId ?? "",
    buyUnit: initial.buyUnit ?? "",
    buyUnitCost: initial.buyUnitCost ? currency.usdToInput(initial.buyUnitCost) : "",
    qtyPerUnit: initial.qtyPerUnit?.toString() ?? "",
    itemSizeLabel: initial.itemSizeLabel ?? "",
    reorderLevelItems: initial.reorderLevelItems?.toString() ?? "",
  };
}

function productFieldsToStorage(fields, currency) {
  return {
    ...fields,
    price: fields.price === "" ? "" : String(currency.inputToUsd(fields.price)),
    buyUnitCost:
      fields.buyUnitCost === "" ? "" : String(currency.inputToUsd(fields.buyUnitCost)),
  };
}

function fieldsFromSupplier(initial) {
  return {
    id: initial?.id ?? null,
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
  };
}

function emptyPurchaseLine(products = []) {
  const first = products[0];
  return {
    productId: first?.id ?? "",
    qty: "1",
    unitCost: "",
    lotNumber: first?.lotNumber ?? "",
    expirationDate: first?.expirationDate ?? "",
  };
}

function formatPurchaseTime(value, t) {
  if (!value) return t("products.unknownTime");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function ProductForm({ initial, productCategories = [], onSave, onCancel, saveLabel }) {
  const currency = useCurrency();
  const { t, tError } = useLocale();
  const [fields, setFields] = useState(() => fieldsFromProduct(initial, currency));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await Promise.resolve(onSave(productFieldsToStorage(fields, currency)));
      if (!result?.ok) {
        setError(result?.error ?? t("products.saveFailed"));
        return;
      }
      if (!initial) setFields(emptyProductFields());
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sepela-panel">
      <p className="sepela-label">{saveLabel}</p>
      <input
        type="text"
        placeholder={t("products.productName")}
        value={fields.name}
        onChange={set("name")}
        className="sepela-input"
      />
      <input
        type="text"
        placeholder={t("products.lotNumber")}
        value={fields.lotNumber}
        onChange={set("lotNumber")}
        className="sepela-input font-mono"
      />
      <Box>
        <label className="sepela-label">
          {t("products.expirationDate")}
        </label>
        <input
          type="date"
          value={fields.expirationDate}
          onChange={set("expirationDate")}
          className="w-full mt-1 sepela-input"
        />
      </Box>
      <input
        type="number"
        min="0"
        step={currency.inputStep}
        placeholder={`${currency.fieldLabel(t("products.priceLabel"))} *`}
        value={fields.price}
        onChange={set("price")}
        className="sepela-input"
      />
      <select
        value={fields.categoryId}
        onChange={set("categoryId")}
        className="sepela-input"
      >
        <option value="">{t("products.noCategory")}</option>
        {productCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name} ({category.code})
          </option>
        ))}
      </select>
      <Box className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder={t("products.buyUnit")}
          value={fields.buyUnit}
          onChange={set("buyUnit")}
          className="sepela-input"
        />
        <input
          type="number"
          min="1"
          step="1"
          placeholder={t("products.qtyPerUnit")}
          value={fields.qtyPerUnit}
          onChange={set("qtyPerUnit")}
          className="sepela-input"
        />
      </Box>
      <Box className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min="0"
          step={currency.inputStep}
          placeholder={currency.fieldLabel(t("products.buyUnitCost"))}
          value={fields.buyUnitCost}
          onChange={set("buyUnitCost")}
          className="sepela-input"
        />
        <input
          type="text"
          placeholder={t("products.itemSizeLabel")}
          value={fields.itemSizeLabel}
          onChange={set("itemSizeLabel")}
          className="sepela-input"
        />
      </Box>
      <Box className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min="0"
          step="1"
          placeholder={t("products.stockQuantity")}
          value={fields.stock}
          onChange={set("stock")}
          className="sepela-input"
        />
        <input
          type="number"
          min="0"
          step="1"
          placeholder={t("products.reorderLevel")}
          value={fields.reorderLevelItems}
          onChange={set("reorderLevelItems")}
          className="sepela-input"
        />
      </Box>
      {error && <p className="text-red-400 text-xs">{tError(error)}</p>}
      <Box className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="sepela-btn-primary flex-1 disabled:opacity-60"
        >
          {busy ? t("products.saving") : t("common.save")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="sepela-btn-secondary"
          >
            {t("common.cancel")}
          </button>
        )}
      </Box>
    </form>
  );
}

export default function ProductManageModal({
  isOpen,
  products,
  productCategories = [],
  suppliers = [],
  purchases = [],
  expiryAlertDays,
  currentUser,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  onImport,
  onPurchase,
  onRestock,
}) {
  const currency = useCurrency();
  const { t, tError, locale } = useLocale();
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [restockId, setRestockId] = useState(null);
  const [restockQty, setRestockQty] = useState("");
  const [restockLot, setRestockLot] = useState("");
  const [restockExpiry, setRestockExpiry] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importMessageSuccess, setImportMessageSuccess] = useState(false);
  const categoryById = useMemo(
    () => new Map(productCategories.map((category) => [category.id, category])),
    [productCategories]
  );
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [purchaseMessageSuccess, setPurchaseMessageSuccess] = useState(false);
  const [addProductMessage, setAddProductMessage] = useState("");
  const [addFormKey, setAddFormKey] = useState(0);
  const [restockMessage, setRestockMessage] = useState("");
  const [restockBusy, setRestockBusy] = useState(false);
  const [supplierFields, setSupplierFields] = useState(() => fieldsFromSupplier(null));
  const [purchaseReference, setPurchaseReference] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseLines, setPurchaseLines] = useState(() => [emptyPurchaseLine(products)]);
  const fileInputRef = useRef(null);

  const editingProduct = products.find((p) => p.id === editingId);
  const recentPurchases = useMemo(() => purchases.slice(0, 8), [purchases]);
  const purchaseTotalUsd = useMemo(
    () =>
      purchaseLines.reduce((sum, line) => {
        const qty = parseInt(line.qty, 10);
        const unitCostPrimary = parseFloat(line.unitCost);
        if (Number.isNaN(qty) || Number.isNaN(unitCostPrimary)) return sum;
        return sum + qty * currency.inputToUsd(unitCostPrimary);
      }, 0),
    [purchaseLines, currency]
  );

  if (!isOpen) return null;

  const resetPurchaseForm = () => {
    setSupplierFields(fieldsFromSupplier(null));
    setPurchaseReference("");
    setPurchaseNotes("");
    setPurchaseLines([emptyPurchaseLine(products)]);
  };

  const handleClose = () => {
    setEditingId(null);
    setShowAddForm(false);
    setShowPurchaseForm(false);
    setRestockId(null);
    setRestockQty("");
    setRestockLot("");
    setRestockExpiry("");
    setImportMessage("");
    setPurchaseMessage("");
    setAddProductMessage("");
    setRestockMessage("");
    resetPurchaseForm();
    onClose();
  };

  const startRestock = (product) => {
    setRestockId(product.id);
    setRestockQty("");
    setRestockLot(product.lotNumber ?? "");
    setRestockExpiry(product.expirationDate ?? "");
    setRestockMessage("");
  };

  const clearRestockForm = () => {
    setRestockId(null);
    setRestockQty("");
    setRestockLot("");
    setRestockExpiry("");
  };

  const startPurchase = () => {
    setShowAddForm(false);
    setEditingId(null);
    setRestockId(null);
    setPurchaseMessage("");
    setShowPurchaseForm(true);
    setPurchaseLines((prev) => (prev.length > 0 ? prev : [emptyPurchaseLine(products)]));
  };

  const submitRestock = async (productId, productName) => {
    setRestockBusy(true);
    setRestockMessage("");
    try {
      const result = await Promise.resolve(
        onRestock(productId, restockQty, restockLot, restockExpiry)
      );
      if (!result?.ok) {
        alert(tError(result?.error) || t("products.restockFailed"));
        return;
      }
      const qtyAdded = restockQty;
      clearRestockForm();
      setRestockMessage(t("products.restockSuccess", { qty: qtyAdded, name: productName }));
      setImportMessage("");
      setPurchaseMessage("");
      setAddProductMessage("");
    } finally {
      setRestockBusy(false);
    }
  };

  const handleExportCsv = () => {
    const csv = buildProductImportCsv(products);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-import-format.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseProductImportCsv(text, locale);
      if (!parsed.ok) {
        setImportMessage(tError(parsed.error));
        setImportMessageSuccess(false);
        return;
      }

      const result = await onImport(parsed.rows);
      if (!result.ok) {
        setImportMessage(tError(result.error));
        setImportMessageSuccess(false);
        return;
      }

      setImportMessage(
        t("products.importSuccess", {
          count: result.count,
          created: result.created,
          updated: result.updated,
        })
      );
      setImportMessageSuccess(true);
      setEditingId(null);
      setShowAddForm(false);
      setShowPurchaseForm(false);
      setRestockId(null);
    } catch (err) {
      setImportMessage(t("products.importFileFailed", { error: err?.message ?? err }));
      setImportMessageSuccess(false);
    } finally {
      e.target.value = "";
    }
  };

  const handleSupplierNameChange = (value) => {
    const match = suppliers.find(
      (supplier) => supplier.name?.trim().toLowerCase() === value.trim().toLowerCase()
    );
    if (match) {
      setSupplierFields(fieldsFromSupplier(match));
      return;
    }
    setSupplierFields((prev) => ({ ...prev, id: null, name: value }));
  };

  const updatePurchaseLine = (index, key, value) => {
    setPurchaseLines((prev) =>
      prev.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        if (key !== "productId") return { ...line, [key]: value };
        const product = products.find((entry) => entry.id === value);
        return {
          ...line,
          productId: value,
          lotNumber: product?.lotNumber ?? "",
          expirationDate: product?.expirationDate ?? "",
        };
      })
    );
  };

  const addPurchaseLine = () => {
    setPurchaseLines((prev) => [...prev, emptyPurchaseLine(products)]);
  };

  const removePurchaseLine = (index) => {
    setPurchaseLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const submitPurchase = async (e) => {
    e.preventDefault();
    setPurchaseMessage("");
    const payload = {
      supplier: supplierFields,
      reference: purchaseReference,
      notes: purchaseNotes,
      createdByUserId: currentUser?.id ?? null,
      createdByUserName: currentUser?.displayName ?? null,
      items: purchaseLines.map((line) => {
        const product = products.find((entry) => entry.id === line.productId);
        return {
          productId: line.productId,
          productName: product?.name ?? "",
          qty: line.qty,
          unitCost: String(currency.inputToUsd(line.unitCost)),
          lotNumber: line.lotNumber,
          expirationDate: line.expirationDate,
        };
      }),
    };
    const result = await onPurchase(payload);
    if (!result.ok) {
      setPurchaseMessage(tError(result.error));
      setPurchaseMessageSuccess(false);
      return;
    }
    resetPurchaseForm();
    setShowPurchaseForm(false);
    setPurchaseMessage(t("products.purchaseSaved"));
    setPurchaseMessageSuccess(true);
  };

  return (
    <ManagementScreen
      isOpen={isOpen}
      onClose={handleClose}
      title={t("products.title")}
      icon={Package}
      subtitle={t("products.subtitle")}
      wide
    >
      <Box className="grid grid-cols-1 xl:grid-cols-[1.2fr,1fr] gap-4">
            <Box className="space-y-4 min-w-0">
              <Box className="sepela-mgmt-toolbar">
                {!showAddForm && !editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPurchaseForm(false);
                      setShowAddForm(true);
                      setPurchaseMessage("");
                      setImportMessage("");
                      setAddProductMessage("");
                      setAddFormKey((key) => key + 1);
                    }}
                    className="sepela-btn-secondary"
                  >
                    <Plus size={16} />
                    {t("products.addProduct")}
                  </button>
                )}
                <button type="button" onClick={startPurchase} className="sepela-btn-secondary">
                  <Truck size={16} />
                  {t("products.recordPurchase")}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="sepela-btn-secondary"
                >
                  <Upload size={16} />
                  {t("products.importCsv")}
                </button>
                <button type="button" onClick={handleExportCsv} className="sepela-btn-secondary">
                  <Download size={16} />
                  {t("products.exportFormat")}
                </button>
              </Box>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportFile}
                className="hidden"
              />

              <p className="sepela-hint">
                {t("products.importHeaderHint")}{" "}
                <span className="font-mono sepela-text-muted">{PRODUCT_IMPORT_COLUMNS.join(", ")}</span>
              </p>
              <p className="sepela-hint">{t("products.importBatchHint")}</p>

              {importMessage && (
                <p
                  className={`text-xs ${importMessageSuccess ? "text-green-400" : "text-amber-400"}`}
                >
                  {importMessage}
                </p>
              )}

              {purchaseMessage && (
                <p
                  className={`text-xs ${purchaseMessageSuccess ? "text-green-400" : "text-amber-400"}`}
                >
                  {purchaseMessage}
                </p>
              )}

              {addProductMessage && (
                <p className="text-xs text-green-400">{addProductMessage}</p>
              )}

              {restockMessage && <p className="text-xs text-green-400">{restockMessage}</p>}

              {showPurchaseForm && (
                <form
                  onSubmit={submitPurchase}
                  className="sepela-subpanel space-y-4 p-4"
                >
                  <Box className="flex items-start justify-between gap-3">
                    <Box>
                      <p className="sepela-label">
                        {t("products.newPurchase")}
                      </p>
                      <p className="text-sm sepela-text-muted mt-1">
                        {t("products.purchaseSubtitle")}
                      </p>
                    </Box>
                    <ShoppingCart className="text-sepela-accent shrink-0" size={18} />
                  </Box>

                  <datalist id="supplier-options">
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.name} />
                    ))}
                  </datalist>

                  <Box className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      list="supplier-options"
                      placeholder={t("products.supplierName")}
                      value={supplierFields.name}
                      onChange={(e) => handleSupplierNameChange(e.target.value)}
                      className="sepela-input"
                    />
                    <input
                      type="text"
                      placeholder={t("products.supplierPhone")}
                      value={supplierFields.phone}
                      onChange={(e) =>
                        setSupplierFields((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      className="sepela-input"
                    />
                  </Box>

                  <Box className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder={t("products.purchaseReference")}
                      value={purchaseReference}
                      onChange={(e) => setPurchaseReference(e.target.value)}
                      className="sepela-input"
                    />
                    <textarea
                      rows={2}
                      placeholder={t("products.supplierAddress")}
                      value={supplierFields.address}
                      onChange={(e) =>
                        setSupplierFields((prev) => ({ ...prev, address: e.target.value }))
                      }
                      className="sepela-input"
                    />
                  </Box>

                  <textarea
                    rows={2}
                    placeholder={t("products.purchaseNotes")}
                    value={purchaseNotes}
                    onChange={(e) => setPurchaseNotes(e.target.value)}
                    className="sepela-input"
                  />

                  <Box className="space-y-2">
                    <Box className="flex items-center justify-between gap-3">
                      <p className="sepela-label">
                        {t("products.purchaseItems")}
                      </p>
                      <button
                        type="button"
                        onClick={addPurchaseLine}
                        className="sepela-link-btn"
                      >
                        {t("products.addLine")}
                      </button>
                    </Box>

                    {purchaseLines.map((line, index) => (
                      <Box
                        key={`${index}-${line.productId || "new"}`}
                        className="sepela-card-item grid grid-cols-1 md:grid-cols-[1.8fr,0.8fr,0.9fr,1.2fr,1.2fr,auto] gap-2 items-start"
                      >
                        <select
                          value={line.productId}
                          onChange={(e) => updatePurchaseLine(index, "productId", e.target.value)}
                          className="sepela-input"
                        >
                          <option value="">{t("products.selectProduct")}</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder={t("common.qty")}
                          value={line.qty}
                          onChange={(e) => updatePurchaseLine(index, "qty", e.target.value)}
                          className="sepela-input"
                        />
                        <input
                          type="number"
                          min="0"
                          step={currency.inputStep}
                          placeholder={currency.fieldLabel(t("products.unitCost"))}
                          value={line.unitCost}
                          onChange={(e) => updatePurchaseLine(index, "unitCost", e.target.value)}
                          className="sepela-input"
                        />
                        <input
                          type="text"
                          placeholder={t("products.lotNumber").replace(" *", "")}
                          value={line.lotNumber}
                          onChange={(e) => updatePurchaseLine(index, "lotNumber", e.target.value)}
                          className="sepela-input font-mono"
                        />
                        <input
                          type="date"
                          value={line.expirationDate}
                          onChange={(e) =>
                            updatePurchaseLine(index, "expirationDate", e.target.value)
                          }
                          className="sepela-input"
                        />
                        <button
                          type="button"
                          onClick={() => removePurchaseLine(index)}
                          disabled={purchaseLines.length <= 1}
                          className="px-3 py-2 rounded text-red-500 disabled:opacity-40"
                        >
                          <Trash2 size={16} />
                        </button>
                      </Box>
                    ))}
                  </Box>

                  <Box className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 sepela-divider">
                    <Box className="text-sm">
                      <span className="sepela-text-secondary">{t("products.purchaseTotal")}</span>{" "}
                      <span className="font-mono text-sepela-accent sepela-money">
                        {currency.formatPrimary(purchaseTotalUsd)}
                      </span>
                    </Box>
                    <Box className="flex gap-2">
                      <button
                        type="submit"
                        className="sepela-btn-primary !w-auto"
                      >
                        {t("products.savePurchase")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPurchaseForm(false);
                          setPurchaseMessage("");
                          setPurchaseMessageSuccess(false);
                          resetPurchaseForm();
                        }}
                        className="sepela-btn-secondary"
                      >
                        {t("common.cancel")}
                      </button>
                    </Box>
                  </Box>
                </form>
              )}

              {showAddForm && (
                <ProductForm
                  key={addFormKey}
                  productCategories={productCategories}
                  saveLabel={t("products.newProduct")}
                  onSave={async (fields) => {
                    const result = await Promise.resolve(onAdd(fields));
                    if (result?.ok) {
                      const name = fields.name?.trim() || t("common.product");
                      setAddProductMessage(t("products.productSaved", { name }));
                      setImportMessage("");
                      setPurchaseMessage("");
                      setAddFormKey((key) => key + 1);
                    }
                    return result;
                  }}
                  onCancel={() => {
                    setShowAddForm(false);
                    setAddProductMessage("");
                  }}
                />
              )}

              {editingId && editingProduct && (
                <ProductForm
                  key={editingId}
                  productCategories={productCategories}
                  initial={editingProduct}
                  saveLabel={t("products.editProduct")}
                  onSave={(fields) => {
                    const result = onUpdate(editingId, fields);
                    if (result.ok) setEditingId(null);
                    return result;
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )}

              <Box className="sepela-subpanel">
                <Box className="sepela-subpanel-header">
                  <h4 className="sepela-section-title">{t("products.recentPurchases")}</h4>
                  <p className="sepela-hint mt-1">{t("products.recentPurchasesHint")}</p>
                </Box>
                {recentPurchases.length === 0 ? (
                  <p className="p-4 text-sm sepela-hint">{t("products.noPurchases")}</p>
                ) : (
                  <ul className="sepela-list-rows max-h-104 overflow-y-auto sepela-scroll">
                    {recentPurchases.map((purchase) => (
                      <li key={purchase.id} className="p-4 space-y-2">
                        <Box className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <Box>
                            <p className="text-sm font-bold text-white">{purchase.supplierName}</p>
                            <p className="sepela-card-item__meta">
                              {formatPurchaseTime(purchase.timestamp, t)}
                              {purchase.reference
                                ? ` · ${t("products.purchaseRef", { ref: purchase.reference })}`
                                : ""}
                            </p>
                          </Box>
                          <Box className="text-right">
                            <p className="font-mono text-amber-400">
                              {currency.formatPrimary(purchase.totalCost ?? 0)}
                            </p>
                            <p className="sepela-card-item__meta">
                              {t("products.purchaseLines", { count: purchase.items?.length ?? 0 })}
                            </p>
                          </Box>
                        </Box>
                        <ul className="space-y-1">
                          {(purchase.items ?? []).map((item) => (
                            <li
                              key={item.id}
                              className="text-xs sepela-text-muted flex flex-wrap items-center gap-x-2"
                            >
                              <span className="text-white">{item.productName}</span>
                              <span className="font-mono">x{item.qty}</span>
                              <span className="font-mono">
                                @ {currency.formatPrimary(item.unitCost ?? 0)}
                              </span>
                              {item.lotNumber && (
                                <span className="font-mono sepela-text-secondary">
                                  {t("pos.lot")} {item.lotNumber}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {purchase.createdByUserName && (
                          <p className="sepela-hint">
                            {t("products.recordedBy", { name: purchase.createdByUserName })}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Box>
            </Box>

            <Box className="space-y-3 min-w-0">
              <Box className="sepela-subpanel">
                <Box className="sepela-subpanel-header">
                  <h4 className="sepela-section-title">{t("products.productCatalog")}</h4>
                  <p className="sepela-hint mt-1">{t("products.catalogHint")}</p>
                </Box>
                <Box className="max-h-[70vh] overflow-y-auto p-4">
                  <ul className="space-y-2">
                    {products.map((product) => {
                      const stockQty = sellableStockQuantity(product);
                      const inStock = hasSellableStock(product);
                      return (
                      <li
                        key={product.id}
                        className="sepela-card-item space-y-2"
                      >
                        <Box className="flex items-start justify-between gap-2">
                          <Box className="min-w-0 flex-1">
                            <p className="sepela-card-item__title">{product.name}</p>
                            {product.categoryId && categoryById.get(product.categoryId) ? (
                              <p className="sepela-card-item__meta text-amber-400">
                                {categoryById.get(product.categoryId).name}
                              </p>
                            ) : null}
                            <p className="sepela-card-item__meta font-mono">
                              {t("pos.lot")} {product.lotNumber}
                            </p>
                            <p className="text-sepela-accent text-base font-bold mt-1">
                              {currency.formatPrimary(product.price)}
                            </p>
                            <Box className="flex flex-wrap items-center gap-2 mt-2">
                              {inStock ? (
                                <ExpiryBadge
                                  expirationDate={product.expirationDate}
                                  alertDays={expiryAlertDays}
                                  stock={stockQty}
                                />
                              ) : null}
                              <span
                                className={`sepela-card-item__meta font-bold ${
                                  inStock && product.reorderStatus === "REORDER"
                                    ? "text-red-400"
                                    : stockQty <= 0
                                      ? "sepela-hint"
                                      : ""
                                }`}
                              >
                                {t("products.stockLabel", { count: stockQty })}
                                {inStock && product.reorderStatus === "REORDER"
                                  ? ` · ${t("products.reorder")}`
                                  : ""}
                              </span>
                            </Box>
                            {inStock ? (
                              <p className="sepela-hint mt-1">
                                {t("pos.exp")}: {formatExpiryDate(product.expirationDate)}
                              </p>
                            ) : null}
                          </Box>
                          <Box className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddForm(false);
                                setShowPurchaseForm(false);
                                setEditingId(product.id);
                              }}
                              className="sepela-icon-btn sepela-icon-btn--accent"
                              aria-label={`Edit ${product.name}`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(t("products.deleteConfirm", { name: product.name }))) {
                                  onDelete(product.id);
                                  if (editingId === product.id) setEditingId(null);
                                }
                              }}
                              className="sepela-icon-btn sepela-icon-btn--danger"
                              aria-label={`Delete ${product.name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </Box>
                        </Box>

                        {restockId === product.id ? (
                          <Box className="space-y-2 pt-2 sepela-divider">
                            <input
                              type="number"
                              min="1"
                              placeholder={t("products.qtyToAdd")}
                              className="sepela-input"
                              value={restockQty}
                              onChange={(e) => setRestockQty(e.target.value)}
                            />
                            <input
                              type="text"
                              placeholder={t("products.restockLot")}
                              className="sepela-input font-mono"
                              value={restockLot}
                              onChange={(e) => setRestockLot(e.target.value)}
                            />
                            <input
                              type="date"
                              className="sepela-input"
                              value={restockExpiry}
                              onChange={(e) => setRestockExpiry(e.target.value)}
                            />
                            <Box className="flex gap-2">
                              <button
                                type="button"
                                disabled={restockBusy}
                                onClick={() => submitRestock(product.id, product.name)}
                                className="sepela-btn-primary flex-1 !w-auto py-1.5 text-xs disabled:opacity-60"
                              >
                                {restockBusy ? t("products.saving") : t("products.confirmRestock")}
                              </button>
                              <button
                                type="button"
                                disabled={restockBusy}
                                onClick={() => {
                                  clearRestockForm();
                                  setRestockMessage("");
                                }}
                                className="px-3 sepela-text-secondary text-xs"
                              >
                                {t("common.cancel")}
                              </button>
                            </Box>
                          </Box>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRestock(product)}
                            className="sepela-link-btn text-green-500 hover:text-green-400"
                          >
                            {t("products.restockBatch")}
                          </button>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                </Box>
              </Box>
            </Box>
      </Box>
    </ManagementScreen>
  );
}
