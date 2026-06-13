import { useMemo, useState } from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import ManagementScreen from "./ManagementScreen";
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
    discountFreeQty:
      discountType === PROMOTION_DISCOUNT_TYPE.BUY_X_GET_Y
        ? initial?.discountFreeQty?.toString() ?? ""
        : "",
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
    <form onSubmit={handleSubmit} className="sepela-panel space-y-2">
      <p className="sepela-label">{t("promotions.addCategory")}</p>
      <Box className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder={t("promotions.categoryName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="sepela-input"
        />
        <input
          type="text"
          placeholder={t("promotions.categoryCode")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="sepela-input font-mono"
        />
      </Box>
      {error && <p className="text-red-400 text-xs">{tError(error)}</p>}
      <Box className="flex gap-2">
        <button type="submit" className="sepela-btn-primary flex-1 text-xs">
          {t("common.save")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="sepela-btn-secondary text-xs">
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
  const isBuyXGetY = fields.discountType === PROMOTION_DISCOUNT_TYPE.BUY_X_GET_Y;

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
    const discountFreeQty =
      fields.discountType === PROMOTION_DISCOUNT_TYPE.BUY_X_GET_Y
        ? Number(fields.discountFreeQty)
        : null;
    const validated = validatePromotionFields(
      {
        ...fields,
        id: initial?.id ?? fields.id,
        startDate: fromDatetimeLocalValue(fields.startDate),
        endDate: fromDatetimeLocalValue(fields.endDate),
        minOrderAmount: minOrderUsd,
        discountValue,
        discountFreeQty,
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
    <form onSubmit={handleSubmit} className="space-y-3 sepela-panel">
      <p className="sepela-label">{saveLabel}</p>
      <input
        type="text"
        placeholder={t("promotions.name")}
        value={fields.name}
        onChange={set("name")}
        className="sepela-input"
      />
      <select
        value={fields.targetScope}
        onChange={set("targetScope")}
        className="sepela-input"
      >
        <option value={PROMOTION_TARGET_SCOPE.ALL_PRODUCTS}>{t("promotions.scopeAllProducts")}</option>
        <option value={PROMOTION_TARGET_SCOPE.SPECIFIC_CATEGORY}>{t("promotions.scopeCategory")}</option>
        <option value={PROMOTION_TARGET_SCOPE.SPECIFIC_PRODUCT}>{t("promotions.scopeProduct")}</option>
      </select>
      {fields.targetScope === PROMOTION_TARGET_SCOPE.SPECIFIC_CATEGORY && (
        <select
          value={fields.categoryId}
          onChange={set("categoryId")}
          className="sepela-input"
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
          className="sepela-input"
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
      <select
        value={fields.discountType}
        onChange={(e) => {
          setFields((prev) => ({
            ...prev,
            discountType: e.target.value,
            discountValue: "",
            discountFreeQty: "",
          }));
        }}
        className="sepela-input"
      >
        <option value={PROMOTION_DISCOUNT_TYPE.PERCENTAGE}>{t("promotions.discountPercentage")}</option>
        <option value={PROMOTION_DISCOUNT_TYPE.FIXED_AMOUNT}>{t("promotions.discountFixed")}</option>
        <option value={PROMOTION_DISCOUNT_TYPE.BUY_X_GET_Y}>{t("promotions.discountBuyXGetY")}</option>
      </select>
      {isBuyXGetY ? (
        <Box className="space-y-2">
          <p className="text-[10px] sepela-text-secondary">{t("promotions.buyXGetYHint")}</p>
          <Box className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="1"
              step="1"
              placeholder={t("promotions.buyQtyPlaceholder")}
              value={fields.discountValue}
              onChange={set("discountValue")}
              className="sepela-input"
            />
            <input
              type="number"
              min="1"
              step="1"
              placeholder={t("promotions.freeQtyPlaceholder")}
              value={fields.discountFreeQty}
              onChange={set("discountFreeQty")}
              className="sepela-input"
            />
          </Box>
        </Box>
      ) : (
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
          className="sepela-input"
        />
      )}
      <Box className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder={t("promotions.clientTierOptional")}
          value={fields.clientTier}
          onChange={set("clientTier")}
          className="sepela-input"
        />
        <Box>
          <input
            type="number"
            min="0"
            step={currency.inputStep}
            placeholder={currency.fieldLabel(t("promotions.minOrderAmount"))}
            value={fields.minOrderAmount}
            onChange={set("minOrderAmount")}
            className="sepela-input"
          />
          <p className="text-[10px] sepela-hint mt-1">{t("promotions.minOrderHint")}</p>
        </Box>
      </Box>
      <Box className="grid grid-cols-2 gap-2">
        <label className="text-xs sepela-text-muted">
          {t("promotions.startDate")}
          <input
            type="datetime-local"
            value={fields.startDate}
            onChange={set("startDate")}
            className="mt-1 sepela-input"
          />
        </label>
        <label className="text-xs sepela-text-muted">
          {t("promotions.endDate")}
          <input
            type="datetime-local"
            value={fields.endDate}
            onChange={set("endDate")}
            className="mt-1 sepela-input"
          />
        </label>
      </Box>
      <label className="flex items-center gap-2 text-sm sepela-text-muted cursor-pointer">
        <input type="checkbox" checked={fields.isActive} onChange={set("isActive")} className="sepela-checkbox" />
        {t("promotions.isActive")}
      </label>
      {error && <p className="text-red-400 text-xs">{tError(error)}</p>}
      <Box className="flex gap-2">
        <button type="submit" className="sepela-btn-primary flex-1">
          {t("common.save")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="sepela-btn-secondary">
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
    live: "bg-emerald-900/40 text-emerald-400",
    scheduled: "bg-sepela-accent/20 text-sepela-accent",
    expired: "bg-sepela-elevated text-sepela-muted",
    inactive: "bg-sepela-elevated text-sepela-muted",
  };
  return (
    <span className={`sepela-badge px-2 py-0.5 ${colors[key] ?? colors.inactive}`}>
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
    <ManagementScreen
      isOpen={isOpen}
      onClose={handleClose}
      title={t("promotions.title")}
      icon={Tag}
      subtitle={t("promotions.subtitle")}
    >
      <Box className="space-y-4">
          <Box className="space-y-2">
            <Box className="flex items-center justify-between">
              <p className="sepela-label">{t("promotions.categoriesTitle")}</p>
              {!showCategoryForm && (
                <button
                  type="button"
                  onClick={() => setShowCategoryForm(true)}
                  className="sepela-btn-secondary text-[10px]"
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
                  <span key={cat.id} className="sepela-chip">
                    {cat.name} <span className="sepela-text-secondary font-mono">({cat.code})</span>
                  </span>
                ))}
              </Box>
            ) : (
              <p className="text-xs sepela-hint">{t("promotions.noCategories")}</p>
            )}
          </Box>

          {!showAddForm && !editingId && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="sepela-dashed-btn"
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
            <p className="sepela-label">
              {t("promotions.activeRules", { count: sortedPromotions.length })}
            </p>
            {sortedPromotions.length === 0 ? (
              <p className="text-sm sepela-hint py-4 text-center">{t("promotions.noPromotions")}</p>
            ) : (
              sortedPromotions.map((promotion) => (
                <Box
                  key={promotion.id}
                  className="sepela-card-item flex items-start justify-between gap-3"
                >
                  <Box className="min-w-0">
                    <Box className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-sm text-white truncate">{promotion.name}</p>
                      <StatusBadge promotion={promotion} t={t} />
                    </Box>
                    <p className="text-xs sepela-text-secondary mt-1">
                      {promotion.discountType === PROMOTION_DISCOUNT_TYPE.BUY_X_GET_Y
                        ? t("promotions.buyXGetYLabel", {
                            buy: promotion.discountValue,
                            free: promotion.discountFreeQty ?? 0,
                          })
                        : promotion.discountType === PROMOTION_DISCOUNT_TYPE.PERCENTAGE
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
                      className="sepela-icon-btn sepela-icon-btn--accent"
                      title={t("promotions.editPromotion")}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(promotion)}
                      className="sepela-icon-btn sepela-icon-btn--danger"
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
    </ManagementScreen>
  );
}
