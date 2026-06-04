import { useMemo, useRef, useState } from "react";
import { Download, Package, Pencil, Plus, ShoppingCart, Trash2, Truck, Upload, X } from "lucide-react";
import ExpiryBadge from "./ExpiryBadge";
import { formatExpiryDate } from "../utils/productExpiry";
import {
  buildProductImportCsv,
  parseProductImportCsv,
  PRODUCT_IMPORT_COLUMNS,
} from "../utils/productImport";

const Box = "d" + "iv";

function fieldsFromProduct(initial) {
  return {
    name: initial?.name ?? "",
    lotNumber: initial?.lotNumber ?? "",
    expirationDate: initial?.expirationDate ?? "",
    price: initial?.price?.toString() ?? "",
    stock: initial?.stock?.toString() ?? "0",
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

function formatPurchaseTime(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function ProductForm({ initial, onSave, onCancel, saveLabel }) {
  const [fields, setFields] = useState(fieldsFromProduct(initial));
  const [error, setError] = useState("");

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = onSave(fields);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!initial) setFields(fieldsFromProduct(null));
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-[#0f0f0f] rounded-lg border border-gray-800">
      <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">{saveLabel}</p>
      <input
        type="text"
        placeholder="Product name *"
        value={fields.name}
        onChange={set("name")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
      />
      <input
        type="text"
        placeholder="Lot number *"
        value={fields.lotNumber}
        onChange={set("lotNumber")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:border-blue-500 outline-none"
      />
      <Box>
        <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
          Expiration date *
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
        step="0.01"
        placeholder="Price (USD) *"
        value={fields.price}
        onChange={set("price")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
      />
      <input
        type="number"
        min="0"
        step="1"
        placeholder="Stock quantity *"
        value={fields.stock}
        onChange={set("stock")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <Box className="flex gap-2">
        <button
          type="submit"
          className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded text-sm font-bold uppercase"
        >
          Save
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded text-sm border border-gray-700 text-gray-400 hover:text-white"
          >
            Cancel
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
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [restockId, setRestockId] = useState(null);
  const [restockQty, setRestockQty] = useState("");
  const [restockLot, setRestockLot] = useState("");
  const [restockExpiry, setRestockExpiry] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [supplierFields, setSupplierFields] = useState(() => fieldsFromSupplier(null));
  const [purchaseReference, setPurchaseReference] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseLines, setPurchaseLines] = useState(() => [emptyPurchaseLine(products)]);
  const fileInputRef = useRef(null);

  const editingProduct = products.find((p) => p.id === editingId);
  const recentPurchases = useMemo(() => purchases.slice(0, 8), [purchases]);
  const purchaseTotal = useMemo(
    () =>
      purchaseLines.reduce((sum, line) => {
        const qty = parseInt(line.qty, 10);
        const unitCost = parseFloat(line.unitCost);
        return sum + (Number.isNaN(qty) ? 0 : qty) * (Number.isNaN(unitCost) ? 0 : unitCost);
      }, 0),
    [purchaseLines]
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
    resetPurchaseForm();
    onClose();
  };

  const startRestock = (product) => {
    setRestockId(product.id);
    setRestockQty("");
    setRestockLot(product.lotNumber);
    setRestockExpiry(product.expirationDate);
  };

  const startPurchase = () => {
    setShowAddForm(false);
    setEditingId(null);
    setRestockId(null);
    setPurchaseMessage("");
    setShowPurchaseForm(true);
    setPurchaseLines((prev) => (prev.length > 0 ? prev : [emptyPurchaseLine(products)]));
  };

  const submitRestock = (productId) => {
    const result = onRestock(productId, restockQty, restockLot, restockExpiry);
    if (result.ok) {
      setRestockId(null);
      setRestockQty("");
      setRestockLot("");
      setRestockExpiry("");
    } else {
      alert(result.error);
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
      const parsed = parseProductImportCsv(text);
      if (!parsed.ok) {
        setImportMessage(parsed.error);
        return;
      }

      const result = await onImport(parsed.rows);
      if (!result.ok) {
        setImportMessage(result.error);
        return;
      }

      setImportMessage(
        `Imported ${result.count} row(s): ${result.created} created, ${result.updated} updated.`
      );
      setEditingId(null);
      setShowAddForm(false);
      setShowPurchaseForm(false);
      setRestockId(null);
    } catch (err) {
      setImportMessage(`Could not import file: ${err?.message ?? err}`);
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
          unitCost: line.unitCost,
          lotNumber: line.lotNumber,
          expirationDate: line.expirationDate,
        };
      }),
    };
    const result = await onPurchase(payload);
    if (!result.ok) {
      setPurchaseMessage(result.error);
      return;
    }
    resetPurchaseForm();
    setShowPurchaseForm(false);
    setPurchaseMessage("Purchase saved and stock updated.");
  };

  return (
    <Box className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-6xl max-h-[92vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <Box>
            <h3 className="font-bold flex items-center gap-2">
              <Package className="text-blue-500" size={20} />
              Product & purchasing
            </h3>
            <p className="text-[10px] text-gray-500 mt-1">
              Products, supplier purchases, restock, and CSV import
            </p>
          </Box>
          <button type="button" onClick={handleClose} aria-label="Close">
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
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white hover:border-blue-500"
                  >
                    <Plus size={16} />
                    Add product
                  </button>
                )}
                <button
                  type="button"
                  onClick={startPurchase}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-amber-500"
                >
                  <Truck size={16} />
                  Record purchase
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-green-500"
                >
                  <Upload size={16} />
                  Import CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-cyan-500"
                >
                  <Download size={16} />
                  Export format
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
                Import CSV header must be exactly:{" "}
                <span className="font-mono text-gray-400">{PRODUCT_IMPORT_COLUMNS.join(", ")}</span>
              </p>
              <p className="text-[10px] text-gray-600">
                Matching batch rows add imported <span className="font-mono">stock</span>. A different lot or expiry
                creates a separate batch instead of overwriting the old one.
              </p>

              {importMessage && (
                <p
                  className={`text-xs ${
                    importMessage.startsWith("Imported") ? "text-green-400" : "text-amber-400"
                  }`}
                >
                  {importMessage}
                </p>
              )}

              {purchaseMessage && (
                <p
                  className={`text-xs ${
                    purchaseMessage.startsWith("Purchase saved") ? "text-green-400" : "text-amber-400"
                  }`}
                >
                  {purchaseMessage}
                </p>
              )}

              {showPurchaseForm && (
                <form
                  onSubmit={submitPurchase}
                  className="space-y-4 p-4 bg-[#101010] rounded-xl border border-gray-800"
                >
                  <Box className="flex items-start justify-between gap-3">
                    <Box>
                      <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                        New purchase
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Record incoming stock from a supplier and keep each lot as its own batch.
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
                      placeholder="Supplier name *"
                      value={supplierFields.name}
                      onChange={(e) => handleSupplierNameChange(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Supplier phone"
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
                      placeholder="Reference / receipt number"
                      value={purchaseReference}
                      onChange={(e) => setPurchaseReference(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                    />
                    <textarea
                      rows={2}
                      placeholder="Supplier address"
                      value={supplierFields.address}
                      onChange={(e) =>
                        setSupplierFields((prev) => ({ ...prev, address: e.target.value }))
                      }
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                    />
                  </Box>

                  <textarea
                    rows={2}
                    placeholder="Notes about this purchase"
                    value={purchaseNotes}
                    onChange={(e) => setPurchaseNotes(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
                  />

                  <Box className="space-y-2">
                    <Box className="flex items-center justify-between gap-3">
                      <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                        Purchase items
                      </p>
                      <button
                        type="button"
                        onClick={addPurchaseLine}
                        className="text-[10px] font-bold uppercase text-amber-400 hover:text-amber-300"
                      >
                        + Add line
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
                          <option value="">Select product</option>
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
                          placeholder="Qty"
                          value={line.qty}
                          onChange={(e) => updatePurchaseLine(index, "qty", e.target.value)}
                          className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Unit cost"
                          value={line.unitCost}
                          onChange={(e) => updatePurchaseLine(index, "unitCost", e.target.value)}
                          className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Lot number"
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
                      <span className="text-gray-500">Purchase total</span>{" "}
                      <span className="font-mono text-amber-400">${purchaseTotal.toFixed(2)}</span>
                    </Box>
                    <Box className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-sm font-bold uppercase"
                      >
                        Save purchase
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPurchaseForm(false);
                          setPurchaseMessage("");
                          resetPurchaseForm();
                        }}
                        className="px-4 py-2 rounded text-sm border border-gray-700 text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </Box>
                  </Box>
                </form>
              )}

              {showAddForm && (
                <ProductForm
                  saveLabel="New product"
                  onSave={(fields) => {
                    const result = onAdd(fields);
                    if (result.ok) setShowAddForm(false);
                    return result;
                  }}
                  onCancel={() => setShowAddForm(false)}
                />
              )}

              {editingId && editingProduct && (
                <ProductForm
                  key={editingId}
                  initial={editingProduct}
                  saveLabel="Edit product"
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
                    Recent purchases
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Latest supplier deliveries and stock entries.
                  </p>
                </Box>
                {recentPurchases.length === 0 ? (
                  <p className="p-4 text-sm text-gray-600">No purchases recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-900 max-h-104 overflow-y-auto">
                    {recentPurchases.map((purchase) => (
                      <li key={purchase.id} className="p-4 space-y-2">
                        <Box className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <Box>
                            <p className="text-sm font-semibold text-gray-200">{purchase.supplierName}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {formatPurchaseTime(purchase.timestamp)}
                              {purchase.reference ? ` · Ref ${purchase.reference}` : ""}
                            </p>
                          </Box>
                          <Box className="text-right">
                            <p className="font-mono text-amber-400">
                              ${Number(purchase.totalCost ?? 0).toFixed(2)}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {purchase.items?.length ?? 0} line(s)
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
                              <span className="font-mono">@ ${Number(item.unitCost ?? 0).toFixed(2)}</span>
                              {item.lotNumber && (
                                <span className="font-mono text-gray-500">Lot {item.lotNumber}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {purchase.createdByUserName && (
                          <p className="text-[10px] text-gray-600">
                            Recorded by {purchase.createdByUserName}
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
                    Product catalog
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Name, lot, expiry, selling price, and live stock.
                  </p>
                </Box>
                <Box className="max-h-[70vh] overflow-y-auto p-4">
                  <ul className="space-y-2">
                    {products.map((product) => (
                      <li
                        key={product.id}
                        className="p-3 bg-[#252525] rounded-lg border border-gray-800 space-y-2"
                      >
                        <Box className="flex items-start justify-between gap-2">
                          <Box className="min-w-0 flex-1">
                            <p className="font-medium text-gray-200">{product.name}</p>
                            <p className="text-[10px] font-mono text-gray-500 mt-0.5">Lot {product.lotNumber}</p>
                            <p className="text-blue-400 text-sm mt-1">${product.price.toFixed(2)}</p>
                            <Box className="flex flex-wrap items-center gap-2 mt-2">
                              <ExpiryBadge
                                expirationDate={product.expirationDate}
                                alertDays={expiryAlertDays}
                              />
                              <span
                                className={`text-[10px] font-bold ${
                                  product.stock <= 5 ? "text-red-400" : "text-gray-500"
                                }`}
                              >
                                Stock: {product.stock}
                              </span>
                            </Box>
                            <p className="text-[10px] text-gray-600 mt-1">
                              Exp: {formatExpiryDate(product.expirationDate)}
                            </p>
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
                                if (window.confirm(`Delete "${product.name}"?`)) {
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
                              placeholder="Quantity to add"
                              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-2 py-1.5 text-sm"
                              value={restockQty}
                              onChange={(e) => setRestockQty(e.target.value)}
                            />
                            <input
                              type="text"
                              placeholder="Lot number (updates batch)"
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
                                onClick={() => submitRestock(product.id)}
                                className="flex-1 py-1.5 bg-green-700 rounded text-xs font-bold uppercase"
                              >
                                Confirm restock
                              </button>
                              <button
                                type="button"
                                onClick={() => setRestockId(null)}
                                className="px-3 text-gray-500 text-xs"
                              >
                                Cancel
                              </button>
                            </Box>
                          </Box>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRestock(product)}
                            className="text-[10px] font-bold uppercase text-green-500 hover:text-green-400"
                          >
                            + Restock / new batch
                          </button>
                        )}
                      </li>
                    ))}
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
