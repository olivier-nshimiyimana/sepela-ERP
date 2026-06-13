import { useEffect, useState } from "react";
import { Gift, Tag } from "lucide-react";
import { useLocale } from "../contexts/LocaleContext";
import { useCurrency } from "../contexts/CurrencyContext";
import {
  CART_DISCOUNT_TYPE,
  buyXGetYFreeQty,
  cartLineManualDiscountUsd,
  cartLineSubtotalUsd,
  cartLineNetUsd,
  validateCartDiscountInput,
} from "../utils/cartDiscount";
import SepelaModal from "./SepelaModal";

const Box = "d" + "iv";

const DISCOUNT_OPTIONS = [
  { id: CART_DISCOUNT_TYPE.NONE, labelKey: "pos.discountNone" },
  { id: CART_DISCOUNT_TYPE.PERCENTAGE, labelKey: "pos.discountPercent" },
  { id: CART_DISCOUNT_TYPE.FIXED, labelKey: "pos.discountFixed" },
  { id: CART_DISCOUNT_TYPE.BUY_X_GET_Y, labelKey: "pos.discountBuyXGetY" },
];

export default function LineDiscountModal({ isOpen, line, onClose, onApply }) {
  const { t } = useLocale();
  const currency = useCurrency();
  const [discountType, setDiscountType] = useState(CART_DISCOUNT_TYPE.NONE);
  const [discountValue, setDiscountValue] = useState("");
  const [discountFreeQty, setDiscountFreeQty] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !line) return;
    setDiscountType(line.discountType ?? CART_DISCOUNT_TYPE.NONE);
    setDiscountValue(
      line.discountValue && line.discountType !== CART_DISCOUNT_TYPE.NONE
        ? String(line.discountValue)
        : ""
    );
    setDiscountFreeQty(
      line.discountFreeQty && line.discountType === CART_DISCOUNT_TYPE.BUY_X_GET_Y
        ? String(line.discountFreeQty)
        : ""
    );
    setError("");
  }, [isOpen, line]);

  if (!isOpen || !line) return null;

  const draftLine = {
    ...line,
    discountType,
    discountValue: discountValue === "" ? 0 : Number(discountValue),
    discountFreeQty: discountFreeQty === "" ? 0 : Number(discountFreeQty),
  };
  const subtotal = cartLineSubtotalUsd(draftLine);
  const discountPreview = cartLineManualDiscountUsd(draftLine);
  const net = cartLineNetUsd(draftLine);
  const buyX = Math.floor(Number(discountValue) || 0);
  const freeY = Math.floor(Number(discountFreeQty) || 0);
  const freeInCart =
    discountType === CART_DISCOUNT_TYPE.BUY_X_GET_Y
      ? buyXGetYFreeQty(line.qty, buyX, freeY)
      : 0;

  const handleApply = () => {
    setError("");
    const type =
      discountType === CART_DISCOUNT_TYPE.NONE ||
      (discountType === CART_DISCOUNT_TYPE.BUY_X_GET_Y
        ? !discountValue || !discountFreeQty
        : !discountValue)
        ? CART_DISCOUNT_TYPE.NONE
        : discountType;
    const result = validateCartDiscountInput(type, discountValue, line, {
      freeQty: discountFreeQty,
    });
    if (!result.ok) {
      setError(t(result.error));
      return;
    }
    onApply(line.id, result.data);
  };

  return (
    <SepelaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("pos.lineDiscountTitle")}
      icon={Tag}
      maxWidth="max-w-md"
      zClass="z-[110]"
      bodyClassName=""
    >
      <Box className="sepela-modal-body space-y-4">
        <p className="text-sm text-white font-bold">{line.name}</p>
        <p className="sepela-hint">
          {t("pos.lineSubtotal")}: {currency.formatPrimary(subtotal)} · {t("common.qty")}: {line.qty}
        </p>

        <Box className="sepela-choice-grid">
          {DISCOUNT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setDiscountType(option.id)}
              className={`sepela-choice flex items-center justify-center gap-1 text-[10px] ${
                discountType === option.id ? "sepela-choice--active" : ""
              }`}
            >
              {option.id === CART_DISCOUNT_TYPE.BUY_X_GET_Y ? <Gift size={12} /> : null}
              {t(option.labelKey)}
            </button>
          ))}
        </Box>

        {discountType === CART_DISCOUNT_TYPE.PERCENTAGE || discountType === CART_DISCOUNT_TYPE.FIXED ? (
          <input
            type="number"
            min="0"
            step={discountType === CART_DISCOUNT_TYPE.PERCENTAGE ? "1" : currency.inputStep}
            max={discountType === CART_DISCOUNT_TYPE.PERCENTAGE ? "100" : undefined}
            placeholder={
              discountType === CART_DISCOUNT_TYPE.PERCENTAGE
                ? t("pos.discountPercentPlaceholder")
                : t("pos.discountFixedPlaceholder")
            }
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className="sepela-input sepela-input-lg"
          />
        ) : null}

        {discountType === CART_DISCOUNT_TYPE.BUY_X_GET_Y ? (
          <Box className="space-y-3">
            <p className="sepela-hint">{t("pos.discountBuyXGetYHint", { bundle: buyX + freeY || "—", free: freeY || "—" })}</p>
            <Box className="grid grid-cols-2 gap-2">
              <Box className="sepela-field">
                <label className="sepela-label">{t("pos.discountBuyQty")}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t("pos.discountBuyQtyPlaceholder")}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="sepela-input sepela-input-lg"
                />
              </Box>
              <Box className="sepela-field">
                <label className="sepela-label">{t("pos.discountFreeQty")}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t("pos.discountFreeQtyPlaceholder")}
                  value={discountFreeQty}
                  onChange={(e) => setDiscountFreeQty(e.target.value)}
                  className="sepela-input sepela-input-lg"
                />
              </Box>
            </Box>
            {buyX > 0 && freeY > 0 ? (
              <p className="text-xs text-amber-400 font-semibold">
                {freeInCart > 0
                  ? t("pos.discountBuyXGetYPreview", { buy: buyX, free: freeY, count: freeInCart })
                  : t("pos.discountBuyXGetYRule", { buy: buyX, free: freeY })}
              </p>
            ) : null}
          </Box>
        ) : null}

        {discountPreview > 0.001 && (
          <Box className="sepela-panel text-xs space-y-1">
            <Box className="flex justify-between text-sepela-muted font-semibold">
              <span>{t("pos.discountAmount")}</span>
              <span className="text-amber-400">-{currency.formatPrimary(discountPreview)}</span>
            </Box>
            <Box className="flex justify-between text-white font-bold">
              <span>{t("common.total")}</span>
              <span>{currency.formatPrimary(net)}</span>
            </Box>
          </Box>
        )}

        {error ? <p className="text-xs text-red-400 font-semibold">{error}</p> : null}
      </Box>

      <Box className="sepela-modal-footer flex gap-2">
        <button type="button" onClick={onClose} className="sepela-btn-secondary flex-1">
          {t("common.cancel")}
        </button>
        <button type="button" onClick={handleApply} className="sepela-btn-primary flex-1">
          {t("common.save")}
        </button>
      </Box>
    </SepelaModal>
  );
}
