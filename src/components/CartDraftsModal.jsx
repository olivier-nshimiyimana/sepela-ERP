import { useEffect, useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { deleteCartDraft, listCartDrafts, saveCartDraft } from "../utils/cartDrafts";

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

  if (!isOpen) return null;

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
    <Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-lg max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <Box className="flex items-center justify-between p-4 border-b border-gray-800">
          <Box>
            <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">{t("drafts.title")}</p>
            <p className="text-sm text-gray-400 mt-1">{t("drafts.subtitle")}</p>
          </Box>
          <button type="button" onClick={onClose} aria-label={t("common.close")}>
            <X size={20} />
          </button>
        </Box>

        <Box className="p-4 space-y-4 overflow-auto flex-1">
          <Box className="p-3 rounded-lg border border-gray-800 bg-[#111111] space-y-3">
            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">{t("drafts.saveCurrent")}</p>
            <p className="text-sm text-gray-300">
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
              className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
            />
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleSave}
              className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-sm font-bold uppercase"
            >
              {t("drafts.saveDraft")}
            </button>
          </Box>

          {message ? (
            <p className={`text-xs ${messageTone === "success" ? "text-green-400" : "text-red-400"}`}>
              {message}
            </p>
          ) : null}

          <Box>
            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">
              {t("drafts.savedDrafts")} ({drafts.length})
            </p>
            {drafts.length === 0 ? (
              <p className="text-sm text-gray-600">{t("drafts.noDrafts")}</p>
            ) : (
              <ul className="space-y-2">
                {drafts.map((draft) => (
                  <li
                    key={draft.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-800 bg-[#0f0f0f]"
                  >
                    <Box className="min-w-0">
                      <p className="text-sm font-semibold text-gray-200 truncate">{draft.label}</p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {t("drafts.draftMeta", {
                          items: draft.itemCount,
                          total: currency.formatPrimary(draft.totalUSD),
                          time: formatDraftTime(draft.savedAt),
                        })}
                      </p>
                    </Box>
                    <Box className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoad(draft)}
                        className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-green-700 hover:bg-green-600"
                      >
                        {t("drafts.load")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(draft)}
                        className="p-1.5 rounded text-red-400 hover:bg-red-950/40"
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
      </Box>
    </Box>
  );
}
