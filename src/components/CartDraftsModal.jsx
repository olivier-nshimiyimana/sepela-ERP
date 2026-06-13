import { useEffect, useMemo, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { deleteCartDraft, listCartDrafts, saveCartDraft } from "../utils/cartDrafts";
import SepelaModal from "./SepelaModal";

const Box = "d" + "iv";

function formatDraftTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function CartDraftsModal({
  isOpen,
  merchantCode,
  operatorId,
  operatorName,
  cart,
  onClose,
  onLoadDraft,
  onDraftSaved,
}) {
  const currency = useCurrency();
  const { t, tError } = useLocale();
  const [drafts, setDrafts] = useState([]);
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("neutral");

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + (Number(line.price) || 0) * (Number(line.qty) || 0), 0),
    [cart]
  );

  const refreshDrafts = () => {
    setDrafts(listCartDrafts(merchantCode, operatorId));
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshDrafts();
    setMessage("");
    setMessageTone("neutral");
  }, [isOpen, merchantCode, operatorId]);

  const handleSave = () => {
    const result = saveCartDraft({
      merchantCode,
      operatorId,
      operatorName,
      label,
      cart,
    });
    if (!result.ok) {
      setMessageTone("error");
      setMessage(tError(result.error));
      return;
    }
    setLabel("");
    refreshDrafts();
    setMessageTone("success");
    setMessage(
      t("drafts.draftSaved", {
        items: result.draft.itemCount,
        total: currency.formatPrimary(result.draft.totalUSD),
      })
    );
    onDraftSaved?.(result.draft);
  };

  const handleLoad = (draft) => {
    onLoadDraft(draft.cart);
    setMessageTone("success");
    setMessage(t("drafts.draftLoaded", { label: draft.label }));
    onClose();
  };

  const handleDelete = (draft) => {
    if (!window.confirm(t("drafts.deleteDraftConfirm", { label: draft.label }))) return;
    deleteCartDraft(merchantCode, operatorId, draft.id);
    refreshDrafts();
    setMessageTone("success");
    setMessage(t("drafts.deleted"));
  };

  return (
    <SepelaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("drafts.title")}
      icon={FileText}
      subtitle={t("drafts.subtitle")}
      maxWidth="max-w-lg"
    >
      <Box className="space-y-4">
        <Box className="sepela-panel space-y-3">
          <p className="sepela-label">{t("drafts.saveCurrent")}</p>
          <p className="text-sm text-white font-semibold">
            {cart.length === 0
              ? t("drafts.cartEmpty")
              : t("drafts.cartSummary", {
                  lines: cart.length,
                  items: cart.reduce((s, l) => s + l.qty, 0),
                  total: currency.formatPrimary(cartTotal),
                })}
          </p>
          <input
            type="text"
            placeholder={t("drafts.labelPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="sepela-input"
          />
          <button type="button" disabled={cart.length === 0} onClick={handleSave} className="sepela-btn-primary">
            {t("drafts.saveDraft")}
          </button>
        </Box>

        {message ? (
          <p className={`text-xs font-semibold ${messageTone === "success" ? "text-green-400" : "text-red-400"}`}>
            {message}
          </p>
        ) : null}

        <Box>
          <p className="sepela-label mb-2">
            {t("drafts.savedDrafts")} ({drafts.length})
          </p>
          {drafts.length === 0 ? (
            <p className="text-sm text-sepela-muted font-semibold">{t("drafts.noDrafts")}</p>
          ) : (
            <ul className="space-y-1">
              {drafts.map((draft) => (
                <li
                  key={draft.id}
                  className="sepela-list-item flex items-start justify-between gap-3 rounded-sm"
                >
                  <Box className="min-w-0">
                    <p className="text-sm font-bold truncate">{draft.label}</p>
                    <p className="text-[10px] text-sepela-muted mt-1 font-semibold">
                      {t("drafts.draftMeta", {
                        items: draft.itemCount,
                        total: currency.formatPrimary(draft.totalUSD),
                        time: formatDraftTime(draft.savedAt),
                      })}
                    </p>
                  </Box>
                  <Box className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => handleLoad(draft)} className="sepela-btn-secondary text-[10px]">
                      {t("drafts.load")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(draft)}
                      className="sepela-toolbar-btn text-red-400 hover:!bg-red-950/40"
                      aria-label={t("drafts.deleteDraftAria", { label: draft.label })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </Box>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </Box>
    </SepelaModal>
  );
}
