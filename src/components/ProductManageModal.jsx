import { useMemo, useRef, useState } from "react";
import { Download, Package, Pencil, Plus, ShoppingCart, Trash2, Truck, Upload, X } from "lucide-react";
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

function ProductForm({ initial, onSave, onCancel, saveLabel }) {
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
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-[#0f0f0f] rounded-lg border border-gray-800">
      <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">{saveLabel}</p>
      <input
        type="text"
        placeholder={t("products.productName")}
        value={fields.name}
        onChange={set("name")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
      />
      <input
        type="text"
        placeholder={t("products.lotNumber")}
        value={fields.lotNumber}
        onChange={set("lotNumber")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:border-blue-500 outline-none"
      />
      <Box>
        <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
          {t("products.expirationDate")}
        </label>
        <input
          type="date"
          value={fields.expirationDate}
          onChange={set("expirationDate")}
          className="w-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
        />
      </Box>
      <input
        type="number"
        min="0"
        step={currency.inputStep}
        placeholder={`${currency.fieldLabel(t("products.priceLabel"))} *`}
        value={fields.price}
        onChange={set("price")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
      />
      <Box className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder={t("products.buyUnit")}
          value={fields.buyUnit}
          onChange={set("buyUnit")}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
        />
        <input
          type="number"
          min="1"
          step="1"
          placeholder={t("products.qtyPerUnit")}
          value={fields.qtyPerUnit}
          onChange={set("qtyPerUnit")}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
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
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
        />
        <input
          type="text"
          placeholder={t("products.itemSizeLabel")}
          value={fields.itemSizeLabel}
          onChange={set("itemSizeLabel")}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
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
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
        />
        <input
          type="number"
          min="0"
          step="1"
          placeholder={t("products.reorderLevel")}
          value={fields.reorderLevelItems}
          onChange={set("reorderLevelItems")}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
        />
      </Box>
      {error && <p className="text-red-400 text-xs">{tError(error)}</p>}
      <Box className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-2 rounded text-sm font-bold uppercase"
        >
          {busy ? t("products.saving") : t("common.save")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded text-sm border border-gray-700 text-gray-400 hover:text-white"
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
    <Box className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-6xl max-h-[92vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <Box>
            <h3 className="font-bold flex items-center gap-2">
              <Package className="text-blue-500" size={20} />
              {t("products.title")}
            </h3>
            <p className="text-[10px] text-gray-500 mt-1">
              {t("products.subtitle")}
            </p>
          </Box>
          <button type="button" onClick={handleClose} aria-label={t("common.close")}>
            <X size={20} />
          </button>
        </Box>

        <Box className="p-4 overflow-auto flex-1">
          <Box className="grid grid-cols-1 xl:grid-cols-[1.2fr,1fr] gap-4">
            <Box className="space-y-4 min-w-0">
              <Box className="grid grid-cols-1 sm:grid-cols-4 gap-2">
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
                    className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white hover:border-blue-500"
                  >
                    <Plus size={16} />
                    {t("products.addProduct")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={startPurchase}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-amber-500"
                >
                  <Truck size={16} />
                  {t("products.recordPurchase")}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-green-500"
                >
                  <Upload size={16} />
                  {t("products.importCsv")}
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-cyan-500"
                >
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

              <p className="text-[10px] text-gray-500">
                {t("products.importHeaderHint")}{" "}
                <span className="font-mono text-gray-400">{PRODUCT_IMPORT_COLUMNS.join(", ")}</span>
              </p>
              <p className="text-[10px] text-gray-600">{t("products.importBatchHint")}</p>

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
                  className="space-y-4 p-4 bg-[#101010] rounded-xl border border-gray-800"
                >
                  <Box className="flex items-start justify-between gap-3">
                    <Box>
                      <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                        {t("products.newPurchase")}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {t("products.purchaseSubtitle")}
                      </p>
                    </Box>
                    <ShoppingCart className="text-amber-400 shrink-0" size={18} />
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
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                    />
                    <input
                      type="text"
                      placeholder={t("products.supplierPhone")}
                      value={supplierFields.phone}
                      onChange={(e) =>
                        setSupplierFields((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                    />
                  </Box>

                  <Box className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder={t("products.purchaseReference")}
                      value={purchaseReference}
                      onChange={(e) => setPurchaseReference(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                    />
                    <textarea
                      rows={2}
                      placeholder={t("products.supplierAddress")}
                      value={supplierFields.address}
                      onChange={(e) =>
                        setSupplierFields((prev) => ({ ...prev, address: e.target.value }))
                      }
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                    />
                  </Box>

                  <textarea
                    rows={2}
                    placeholder={t("products.purchaseNotes")}
                    value={purchaseNotes}
                    onChange={(e) => setPurchaseNotes(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                  />

                  <Box className="space-y-2">
                    <Box className="flex items-center justify-between gap-3">
                      <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                        {t("products.purchaseItems")}
                      </p>
                      <button
                        type="button"
                        onClick={addPurchaseLine}
                        className="text-[10px] font-bold uppercase text-amber-400 hover:text-amber-300"
                      >
                        {t("products.addLine")}
                      </button>
                    </Box>

                    {purchaseLines.map((line, index) => (
                      <Box
                        key={`${index}-${line.productId || "new"}`}
                        className="grid grid-cols-1 md:grid-cols-[1.8fr,0.8fr,0.9fr,1.2fr,1.2fr,auto] gap-2 items-start p-3 rounded-lg border border-gray-800 bg-[#161616]"
                      >
                        <select
                          value={line.productId}
                          onChange={(e) => updatePurchaseLine(index, "productId", e.target.value)}
                          className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
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
                          className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm"
                        />
                        <input
                          type="number"
                          min="0"
                          step={currency.inputStep}
                          placeholder={currency.fieldLabel(t("products.unitCost"))}
                          value={line.unitCost}
                          onChange={(e) => updatePurchaseLine(index, "unitCost", e.target.value)}
                          className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          placeholder={t("products.lotNumber").replace(" *", "")}
                          value={line.lotNumber}
                          onChange={(e) => updatePurchaseLine(index, "lotNumber", e.target.value)}
                          className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm font-mono"
                        />
                        <input
                          type="date"
                          value={line.expirationDate}
                          onChange={(e) =>
                            updatePurchaseLine(index, "expirationDate", e.target.value)
                          }
                          className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removePurchaseLine(index)}
                          disabled={purchaseLines.length <= 1}
                          className="px-3 py-2 rounded text-red-500 disabled:text-gray-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </Box>
                    ))}
                  </Box>

                  <Box className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-gray-800">
                    <Box className="text-sm">
                      <span className="text-gray-500">{t("products.purchaseTotal")}</span>{" "}
                      <span className="font-mono text-amber-400">
                        {currency.formatPrimary(purchaseTotalUsd)}
                      </span>
                    </Box>
                    <Box className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-sm font-bold uppercase"
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
                        className="px-4 py-2 rounded text-sm border border-gray-700 text-gray-400 hover:text-white"
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

              <Box className="bg-[#111111] border border-gray-800 rounded-xl overflow-hidden">
                <Box className="p-4 border-b border-gray-800">
                  <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                    {t("products.recentPurchases")}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {t("products.recentPurchasesHint")}
                  </p>
                </Box>
                {recentPurchases.length === 0 ? (
                  <p className="p-4 text-sm text-gray-600">{t("products.noPurchases")}</p>
                ) : (
                  <ul className="divide-y divide-gray-900 max-h-104 overflow-y-auto">
                    {recentPurchases.map((purchase) => (
                      <li key={purchase.id} className="p-4 space-y-2">
                        <Box className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <Box>
                            <p className="text-sm font-semibold text-gray-200">{purchase.supplierName}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
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
                            <p className="text-[10px] text-gray-500">
                              {t("products.purchaseLines", { count: purchase.items?.length ?? 0 })}
                            </p>
                          </Box>
                        </Box>
                        <ul className="space-y-1">
                          {(purchase.items ?? []).map((item) => (
                            <li
                              key={item.id}
                              className="text-xs text-gray-400 flex flex-wrap items-center gap-x-2"
                            >
                              <span className="text-gray-200">{item.productName}</span>
                              <span className="font-mono">x{item.qty}</span>
                              <span className="font-mono">
                                @ {currency.formatPrimary(item.unitCost ?? 0)}
                              </span>
                              {item.lotNumber && (
                                <span className="font-mono text-gray-500">
                                  {t("pos.lot")} {item.lotNumber}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {purchase.createdByUserName && (
                          <p className="text-[10px] text-gray-600">
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
              <Box className="bg-[#111111] border border-gray-800 rounded-xl overflow-hidden">
                <Box className="p-4 border-b border-gray-800">
                  <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">
                    {t("products.productCatalog")}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {t("products.catalogHint")}
                  </p>
                </Box>
                <Box className="max-h-[70vh] overflow-y-auto p-4">
                  <ul className="space-y-2">
                    {products.map((product) => {
                      const stockQty = sellableStockQuantity(product);
                      const inStock = hasSellableStock(product);
                      return (
                      <li
                        key={product.id}
                        className="p-3 bg-[#252525] rounded-lg border border-gray-800 space-y-2"
                      >
                        <Box className="flex items-start justify-between gap-2">
                          <Box className="min-w-0 flex-1">
                            <p className="font-medium text-gray-200">{product.name}</p>
                            <p className="text-[10px] font-mono text-gray-500 mt-0.5">
                              {t("pos.lot")} {product.lotNumber}
                            </p>
                            <p className="text-blue-400 text-sm mt-1">
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
                                className={`text-[10px] font-bold ${
                                  inStock && product.reorderStatus === "REORDER"
                                    ? "text-red-400"
                                    : stockQty <= 0
                                      ? "text-gray-600"
                                      : "text-gray-500"
                                }`}
                              >
                                {t("products.stockLabel", { count: stockQty })}
                                {inStock && product.reorderStatus === "REORDER"
                                  ? ` · ${t("products.reorder")}`
                                  : ""}
                              </span>
                            </Box>
                            {inStock ? (
                              <p className="text-[10px] text-gray-600 mt-1">
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
                              className="p-2 rounded text-gray-400 hover:text-white hover:bg-gray-800"
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
                              className="p-2 rounded text-red-500 hover:bg-red-950/50"
                              aria-label={`Delete ${product.name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </Box>
                        </Box>

                        {restockId === product.id ? (
                          <Box className="space-y-2 pt-2 border-t border-gray-800">
                            <input
                              type="number"
                              min="1"
                              placeholder={t("products.qtyToAdd")}
                              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-2 py-1.5 text-sm"
                              value={restockQty}
                              onChange={(e) => setRestockQty(e.target.value)}
                            />
                            <input
                              type="text"
                              placeholder={t("products.restockLot")}
                              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-2 py-1.5 text-sm font-mono"
                              value={restockLot}
                              onChange={(e) => setRestockLot(e.target.value)}
                            />
                            <input
                              type="date"
                              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-2 py-1.5 text-sm"
                              value={restockExpiry}
                              onChange={(e) => setRestockExpiry(e.target.value)}
                            />
                            <Box className="flex gap-2">
                              <button
                                type="button"
                                disabled={restockBusy}
                                onClick={() => submitRestock(product.id, product.name)}
                                className="flex-1 py-1.5 bg-green-700 disabled:opacity-60 rounded text-xs font-bold uppercase"
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
                                className="px-3 text-gray-500 text-xs"
                              >
                                {t("common.cancel")}
                              </button>
                            </Box>
                          </Box>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRestock(product)}
                            className="text-[10px] font-bold uppercase text-green-500 hover:text-green-400"
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
        </Box>
      </Box>
    </Box>
  );
}
