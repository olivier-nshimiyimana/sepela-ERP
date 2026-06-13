import { useEffect, useState } from "react";
import { Download, FileText, Mail, Printer, Receipt } from "lucide-react";
import { formatDualCurrency, formatSaleChange } from "../utils/currency";
import { useLocale } from "../contexts/LocaleContext";

const Box = "d" + "iv";

export default function SaleCompleteActions({
  sale,
  summary,
  exchangeRate,
  primaryCurrency,
  recording = false,
  recordError = "",
  actionBusy = "",
  onPrintReceipt,
  onPrintInvoice,
  onEmail,
  onSavePdf,
  onSaveNotes,
  onDone,
  doneBtnRef,
}) {
  const { t } = useLocale();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    if (!sale) {
      setNotesOpen(false);
      setNotesDraft("");
      return;
    }
    setNotesDraft(sale.notes ?? "");
  }, [sale?.id, sale?.notes]);

  const change = formatSaleChange(summary, exchangeRate, primaryCurrency);
  const total = formatDualCurrency(summary.totalUSD, exchangeRate, primaryCurrency);
  const showChange = summary.method === "cash" && change.changePrimary > 0;

  const handleNotesClick = () => {
    setNotesOpen((open) => !open);
  };

  const handleSaveNotes = async () => {
    if (!sale || !onSaveNotes) return;
    setNotesSaving(true);
    try {
      await onSaveNotes(notesDraft);
      setNotesOpen(false);
    } finally {
      setNotesSaving(false);
    }
  };

  const actions = [
    {
      id: "receipt",
      label: t("payment.printReceipt"),
      icon: Receipt,
      onClick: onPrintReceipt,
      shortcut: "R",
    },
    {
      id: "invoice",
      label: t("payment.printInvoice"),
      icon: Printer,
      onClick: onPrintInvoice,
      shortcut: "P",
    },
    {
      id: "email",
      label: t("invoiceModal.email"),
      icon: Mail,
      onClick: onEmail,
      shortcut: "E",
    },
    {
      id: "pdf",
      label: t("payment.savePdf"),
      icon: Download,
      onClick: onSavePdf,
      shortcut: "S",
    },
    {
      id: "notes",
      label: t("payment.saleNotes"),
      icon: FileText,
      onClick: handleNotesClick,
      active: notesOpen,
      hasValue: !!String(sale?.notes ?? "").trim(),
    },
  ];

  return (
    <Box className="sepela-sale-complete">
      <Box className="sepela-sale-complete__summary">
        <p className="sepela-sale-complete__label">{t("payment.saleComplete")}</p>
        <p className="sepela-sale-complete__total">{total.primary}</p>
        <p className="sepela-sale-complete__secondary">≈ {total.secondary}</p>
        <p className="sepela-sale-complete__meta">
          {summary.methodLabel}
          {" · "}
          {summary.customerName ?? t("payment.walkIn")}
        </p>
        {sale?.invoiceNumber ? (
          <p className="sepela-sale-complete__invoice">{sale.invoiceNumber}</p>
        ) : null}
      </Box>

      <Box className="sepela-sale-complete__actions">
        <Box className="sepela-sale-complete__actions-head">
          <h2 className="sepela-sale-complete__actions-title">{t("payment.actions")}</h2>
          {showChange ? (
            <Box className="sepela-sale-complete__change">
              <span className="sepela-sale-complete__change-label">{t("payment.change")}</span>
              <span className="sepela-sale-complete__change-value">{change.primary}</span>
              <span className="sepela-sale-complete__change-secondary">≈ {change.secondary}</span>
            </Box>
          ) : (
            <Box className="sepela-sale-complete__change sepela-sale-complete__change--exact">
              <span className="sepela-sale-complete__change-label">{t("payment.exactPayment")}</span>
            </Box>
          )}
        </Box>

        {recording ? (
          <p className="sepela-sale-complete__status">{t("payment.recordingSale")}</p>
        ) : null}
        {recordError ? (
          <p className="sepela-sale-complete__error">{recordError}</p>
        ) : null}

        <Box className="sepela-sale-complete__grid" role="group" aria-label={t("payment.actions")}>
          {actions.map((action) => {
            const Icon = action.icon;
            const busy = actionBusy === action.id;
            return (
              <button
                key={action.id}
                type="button"
                disabled={!sale || recording || !!recordError || busy}
                onClick={action.onClick ?? undefined}
                className={`sepela-sale-complete__action ${
                  busy ? "sepela-sale-complete__action--busy" : ""
                } ${action.active ? "sepela-sale-complete__action--active" : ""} ${
                  action.hasValue ? "sepela-sale-complete__action--has-note" : ""
                }`}
                title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ""}`}
              >
                <Icon size={22} className="sepela-sale-complete__action-icon" />
                <span className="sepela-sale-complete__action-label">{action.label}</span>
              </button>
            );
          })}
        </Box>

        {notesOpen ? (
          <Box className="sepela-sale-complete__notes">
            <label className="sepela-label" htmlFor="sale-notes-input">
              {t("payment.saleNotes")}
            </label>
            <textarea
              id="sale-notes-input"
              className="sepela-input sepela-sale-complete__notes-input"
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder={t("payment.saleNotesPlaceholder")}
              disabled={notesSaving}
            />
            <Box className="sepela-sale-complete__notes-actions">
              <button
                type="button"
                className="sepela-btn-secondary text-xs"
                onClick={() => {
                  setNotesDraft(sale?.notes ?? "");
                  setNotesOpen(false);
                }}
                disabled={notesSaving}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="sepela-btn-primary text-xs"
                onClick={() => void handleSaveNotes()}
                disabled={notesSaving || !sale}
              >
                {t("common.save")}
              </button>
            </Box>
          </Box>
        ) : null}

        <Box className="sepela-sale-complete__footer">
          <p className="sepela-sale-complete__hint">{t("payment.doneHint")}</p>
          <button
            ref={doneBtnRef}
            type="button"
            onClick={onDone}
            disabled={recording || !!recordError || !sale}
            className="sepela-btn-primary sepela-sale-complete__done"
          >
            {t("payment.done")}
          </button>
        </Box>
      </Box>
    </Box>
  );
}
