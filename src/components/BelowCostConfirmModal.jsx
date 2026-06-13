import { AlertTriangle } from "lucide-react";
import { useLocale } from "../contexts/LocaleContext";
import SepelaModal from "./SepelaModal";

const Box = "d" + "iv";

export default function BelowCostConfirmModal({ isOpen, itemNames = [], onConfirm, onCancel }) {
  const { t } = useLocale();
  if (!isOpen) return null;

  const list = itemNames.join(", ");

  return (
    <SepelaModal
      isOpen={isOpen}
      onClose={onCancel}
      title={t("pos.belowCostTitle")}
      icon={AlertTriangle}
      iconClassName="text-amber-400"
      maxWidth="max-w-lg"
      zClass="z-[120]"
      bodyClassName=""
    >
      <Box className="sepela-modal-body">
        <Box className="flex gap-4">
          <Box className="shrink-0 text-amber-400">
            <AlertTriangle size={36} />
          </Box>
          <Box className="space-y-2 min-w-0">
            <p className="text-sm text-white font-semibold leading-relaxed">
              {t("pos.belowCostMessage", { items: list })}
            </p>
            <p className="sepela-hint">{t("pos.belowCostConfirm")}</p>
          </Box>
        </Box>
      </Box>
      <Box className="sepela-modal-footer flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="sepela-btn-secondary">
          {t("common.no")}
        </button>
        <button type="button" onClick={onConfirm} className="sepela-btn-primary !w-auto px-5">
          {t("common.yes")}
        </button>
      </Box>
    </SepelaModal>
  );
}
