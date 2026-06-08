import { useMemo, useState } from "react";
import { Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import {
  PROMOTION_DISCOUNT_TYPE,
  PROMOTION_TARGET_SCOPE,
} from "../db/promotions";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { isPromotionLive } from "../utils/promotionEngine";
import {
  validateProductCategoryFields,
  validatePromotionFields,
} from "../utils/validators/promotions";

const Box = "d" + "iv";

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultPromotionStartLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
}

function defaultPromotionEndLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
}

function fromDatetimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function promotionStatusKey(promotion) {
  if (!promotion.isActive) return "inactive";
  const now = new Date();
  const start = new Date(promotion.startDate);
  const end = new Date(promotion.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "inactive";
  if (now < start) return "scheduled";
  if (now > end) return "expired";
  return isPromotionLive(promotion, now) ? "live" : "expired";
}

function usdToPromotionMoneyInput(usd, currency) {
  const value = currency.usdToInput(usd);
  return value === "" ? "" : value;
}

function fieldsFromPromotion(initial, currency) {
  const discountType = initial?.discountType ?? PROMOTION_DISCOUNT_TYPE.PERCENTAGE;
  return {
    id: initial?.id ?? null,
    name: initial?.name ?? "",
    targetScope: initial?.targetScope ?? PROMOTION_TARGET_SCOPE.ALL_PRODUCTS,
    categoryId: initial?.categoryId ?? "",
    productId: initial?.productId ?? "",
    discountType,
    discountValue:
      discountType === PROMOTION_DISCOUNT_TYPE.FIXED_AMOUNT
        ? usdToPromotionMoneyInput(initial?.discountValue, currency)
        : initial?.discountValue?.toString() ?? "",
    clientTier: initial?.clientTier ?? "",
    minOrderAmount: usdToPromotionMoneyInput(initial?.minOrderAmount, currency),
    startDate: initial?.startDate
      ? toDatetimeLocalValue(initial.startDate)
      : defaultPromotionStartLocal(),
    endDate: initial?.endDate
      ? toDatetimeLocalValue(initial.endDate)
      : defaultPromotionEndLocal(),
    isActive: initial?.isActive !== false,
  };
}

function CategoryForm({ onSave, onCancel }) {
  const { t, tError, locale } = useLocale();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validated = validateProductCategoryFields({ name, code }, locale);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    const result = await onSave(validated.data);
    if (!result.ok) {
      setError(result.error ?? t("promotions.saveFailed"));
      return;
    }
    setName("");
    setCode("");
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-[#0f0f0f] rounded-lg border border-gray-800 space-y-2">
      <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">{t("promotions.addCategory")}</p>
      <Box className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder={t("promotions.categoryName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
        />
        <input
          type="text"
          placeholder={t("promotions.categoryCode")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:border-amber-500 outline-none"
        />
      </Box>
      {error && <p className="text-red-400 text-xs">{tError(error)}</p>}
      <Box className="flex gap-2">
        <button type="submit" className="flex-1 bg-amber-700 hover:bg-amber-600 py-2 rounded text-xs font-bold uppercase">
          {t("common.save")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-2 text-xs border border-gray-700 rounded text-gray-400">
            {t("common.cancel")}
          </button>
        )}
      </Box>
    </form>
  );
}

function PromotionForm({ initial, productCategories, products, onSave, onCancel, saveLabel }) {
  const { t, tError, locale } = useLocale();
  const currency = useCurrency();
  const [fields, setFields] = useState(() => fieldsFromPromotion(initial, currency));
  const [error, setError] = useState("");
  const isFixedDiscount = fields.discountType === PROMOTION_DISCOUNT_TYPE.FIXED_AMOUNT;

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const minOrderUsd =
      fields.minOrderAmount === "" ? null : currency.inputToUsd(fields.minOrderAmount);
    const discountValue =
      fields.discountType === PROMOTION_DISCOUNT_TYPE.FIXED_AMOUNT
        ? currency.inputToUsd(fields.discountValue)
        : Number(fields.discountValue);
    const validated = validatePromotionFields(
      {
        ...fields,
        id: initial?.id ?? fields.id,
        startDate: fromDatetimeLocalValue(fields.startDate),
        endDate: fromDatetimeLocalValue(fields.endDate),
        minOrderAmount: minOrderUsd,
        discountValue,
      },
      locale
    );
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    const result = await onSave({ ...validated.data, id: initial?.id ?? undefined });
    if (!result.ok) {
      setError(result.error ?? t("promotions.saveFailed"));
      return;
    }
    if (!initial) setFields(fieldsFromPromotion(null, currency));
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-[#0f0f0f] rounded-lg border border-gray-800">
      <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">{saveLabel}</p>
      <input
        type="text"
        placeholder={t("promotions.name")}
        value={fields.name}
        onChange={set("name")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
      />
      <select
        value={fields.targetScope}
        onChange={set("targetScope")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
      >
        <option value={PROMOTION_TARGET_SCOPE.ALL_PRODUCTS}>{t("promotions.scopeAllProducts")}</option>
        <option value={PROMOTION_TARGET_SCOPE.SPECIFIC_CATEGORY}>{t("promotions.scopeCategory")}</option>
        <option value={PROMOTION_TARGET_SCOPE.SPECIFIC_PRODUCT}>{t("promotions.scopeProduct")}</option>
      </select>
      {fields.targetScope === PROMOTION_TARGET_SCOPE.SPECIFIC_CATEGORY && (
        <select
          value={fields.categoryId}
          onChange={set("categoryId")}
          className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
        >
          <option value="">{t("promotions.selectCategory")}</option>
          {productCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name} ({cat.code})
            </option>
          ))}
        </select>
      )}
      {fields.targetScope === PROMOTION_TARGET_SCOPE.SPECIFIC_PRODUCT && (
        <select
          value={fields.productId}
          onChange={set("productId")}
          className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
        >
          <option value="">{t("promotions.selectProduct")}</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.lotNumber
                ? `${product.name} — ${product.lotNumber}`
                : product.name}
            </option>
          ))}
        </select>
      )}
      <Box className="grid grid-cols-2 gap-2">
        <select
          value={fields.discountType}
          onChange={(e) => {
            setFields((prev) => ({
              ...prev,
              discountType: e.target.value,
              discountValue: "",
            }));
          }}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
        >
          <option value={PROMOTION_DISCOUNT_TYPE.PERCENTAGE}>{t("promotions.discountPercentage")}</option>
          <option value={PROMOTION_DISCOUNT_TYPE.FIXED_AMOUNT}>{t("promotions.discountFixed")}</option>
        </select>
        <input
          type="number"
          min="0"
          max={isFixedDiscount ? undefined : "100"}
          step={isFixedDiscount ? currency.inputStep : "0.01"}
          placeholder={
            isFixedDiscount
              ? currency.fieldLabel(t("promotions.discountFixed"))
              : t("promotions.discountValuePercent")
          }
          value={fields.discountValue}
          onChange={set("discountValue")}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
        />
      </Box>
      <Box className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder={t("promotions.clientTierOptional")}
          value={fields.clientTier}
          onChange={set("clientTier")}
          className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
        />
        <Box>
          <input
            type="number"
            min="0"
            step={currency.inputStep}
            placeholder={currency.fieldLabel(t("promotions.minOrderAmount"))}
            value={fields.minOrderAmount}
            onChange={set("minOrderAmount")}
            className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none"
          />
          <p className="text-[10px] text-gray-600 mt-1">{t("promotions.minOrderHint")}</p>
        </Box>
      </Box>
      <Box className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-400">
          {t("promotions.startDate")}
          <input
            type="datetime-local"
            value={fields.startDate}
            onChange={set("startDate")}
            className="mt-1 w-full bg-[#1a1a1a] border border-gray-700 rounded px-2 py-2 text-sm focus:border-amber-500 outline-none"
          />
        </label>
        <label className="text-xs text-gray-400">
          {t("promotions.endDate")}
          <input
            type="datetime-local"
            value={fields.endDate}
            onChange={set("endDate")}
            className="mt-1 w-full bg-[#1a1a1a] border border-gray-700 rounded px-2 py-2 text-sm focus:border-amber-500 outline-none"
          />
        </label>
      </Box>
      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
        <input type="checkbox" checked={fields.isActive} onChange={set("isActive")} className="rounded border-gray-600" />
        {t("promotions.isActive")}
      </label>
      {error && <p className="text-red-400 text-xs">{tError(error)}</p>}
      <Box className="flex gap-2">
        <button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 py-2 rounded text-sm font-bold uppercase">
          {t("common.save")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded text-sm border border-gray-700 text-gray-400 hover:text-white">
            {t("common.cancel")}
          </button>
        )}
      </Box>
    </form>
  );
}

function StatusBadge({ promotion, t }) {
  const key = promotionStatusKey(promotion);
  const colors = {
    live: "bg-green-900/50 text-green-400 border-green-800",
    scheduled: "bg-blue-900/50 text-blue-400 border-blue-800",
    expired: "bg-gray-800 text-gray-500 border-gray-700",
    inactive: "bg-gray-800 text-gray-500 border-gray-700",
  };
  return (
    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${colors[key] ?? colors.inactive}`}>
      {t(`promotions.status.${key}`)}
    </span>
  );
}

export default function PromotionManageModal({
  isOpen,
  promotions = [],
  productCategories = [],
  products = [],
  onClose,
  onSave,
  onSaveCategory,
  onDelete,
}) {
  const { t } = useLocale();
  const currency = useCurrency();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const sortedPromotions = useMemo(
    () => [...promotions].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))),
    [promotions]
  );

  const handleClose = () => {
    setShowAddForm(false);
    setShowCategoryForm(false);
    setEditingId(null);
    onClose();
  };

  const handleDelete = async (promotion) => {
    if (!window.confirm(t("promotions.deleteConfirm", { name: promotion.name }))) return;
    await onDelete(promotion.id);
  };

  if (!isOpen) return null;

  const editingPromotion = editingId ? promotions.find((p) => p.id === editingId) : null;

  return (
    <Box className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-2xl rounded-xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <Box>
            <h2 className="font-bold flex items-center gap-2 text-amber-400">
              <Tag size={20} />
              {t("promotions.title")}
            </h2>
            <p className="text-xs text-gray-500 mt-1">{t("promotions.subtitle")}</p>
          </Box>
          <button type="button" onClick={handleClose} aria-label={t("common.close")}>
            <X size={20} />
          </button>
        </Box>

        <Box className="flex-1 overflow-y-auto p-4 space-y-4">
          <Box className="space-y-2">
            <Box className="flex items-center justify-between">
              <p className="text-xs font-bold text-amber-500/80 uppercase tracking-widest">{t("promotions.categoriesTitle")}</p>
              {!showCategoryForm && (
                <button
                  type="button"
                  onClick={() => setShowCategoryForm(true)}
                  className="text-[10px] font-bold uppercase text-amber-400 border border-amber-900 px-2 py-1 rounded hover:bg-amber-950/40"
                >
                  + {t("promotions.addCategory")}
                </button>
              )}
            </Box>
            {showCategoryForm && (
              <CategoryForm
                onSave={onSaveCategory}
                onCancel={() => setShowCategoryForm(false)}
              />
            )}
            {productCategories.length > 0 ? (
              <Box className="flex flex-wrap gap-2">
                {productCategories.map((cat) => (
                  <span key={cat.id} className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300">
                    {cat.name} <span className="text-gray-500 font-mono">({cat.code})</span>
                  </span>
                ))}
              </Box>
            ) : (
              <p className="text-xs text-gray-600">{t("promotions.noCategories")}</p>
            )}
          </Box>

          {!showAddForm && !editingId && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="w-full border border-dashed border-amber-800 text-amber-400 py-3 rounded-lg text-sm font-bold uppercase flex items-center justify-center gap-2 hover:bg-amber-950/30"
            >
              <Plus size={16} />
              {t("promotions.addPromotion")}
            </button>
          )}

          {showAddForm && (
            <PromotionForm
              productCategories={productCategories}
              products={products}
              onSave={async (fields) => {
                const result = await onSave(fields);
                if (result.ok) setShowAddForm(false);
                return result;
              }}
              onCancel={() => setShowAddForm(false)}
              saveLabel={t("promotions.newPromotion")}
            />
          )}

          {editingPromotion && (
            <PromotionForm
              key={editingPromotion.id}
              initial={editingPromotion}
              productCategories={productCategories}
              products={products}
              onSave={async (fields) => {
                const result = await onSave({ ...fields, id: editingPromotion.id });
                if (result.ok) setEditingId(null);
                return result;
              }}
              onCancel={() => setEditingId(null)}
              saveLabel={t("promotions.editPromotion")}
            />
          )}

          <Box className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              {t("promotions.activeRules", { count: sortedPromotions.length })}
            </p>
            {sortedPromotions.length === 0 ? (
              <p className="text-sm text-gray-600 py-4 text-center">{t("promotions.noPromotions")}</p>
            ) : (
              sortedPromotions.map((promotion) => (
                <Box
                  key={promotion.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-800 bg-[#0f0f0f]"
                >
                  <Box className="min-w-0">
                    <Box className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-sm text-white truncate">{promotion.name}</p>
                      <StatusBadge promotion={promotion} t={t} />
                    </Box>
                    <p className="text-xs text-gray-500 mt-1">
                      {promotion.discountType === PROMOTION_DISCOUNT_TYPE.PERCENTAGE
                        ? `${promotion.discountValue}%`
                        : currency.formatPrimary(promotion.discountValue)}{" "}
                      · {t(`promotions.scope.${promotion.targetScope}`)}
                      {promotion.clientTier ? ` · ${promotion.clientTier}` : ""}
                      {promotion.minOrderAmount
                        ? ` · min ${currency.formatPrimary(promotion.minOrderAmount)}`
                        : ""}
                    </p>
                  </Box>
                  <Box className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingId(promotion.id);
                      }}
                      className="p-2 text-gray-500 hover:text-amber-400"
                      title={t("promotions.editPromotion")}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(promotion)}
                      className="p-2 text-gray-500 hover:text-red-400"
                      title={t("common.clear")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
