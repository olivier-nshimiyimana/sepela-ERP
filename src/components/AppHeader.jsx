import { AlertTriangle, BarChart3, FileText, LogOut, Package, Settings, Tag, User, UserCircle } from "lucide-react";
import { can, PERMISSIONS } from "../auth/permissions";
import { exchangeRateLabel } from "../utils/currency";
import { useLocale } from "../contexts/LocaleContext";
import IdleMusicControl from "./IdleMusicControl";

const Box = "d" + "iv";

export default function AppHeader({
  user,
  exchangeRate,
  primaryCurrency,
  expiryAlertCount = 0,
  trainingMode = false,
  reportsAreHome = false,
  onOpenClients,
  onLogout,
  onOpenProducts,
  onOpenSettings,
  onOpenPromotions,
  onOpenReports,
  onOpenUsers,
  onOpenInvoices,
  hideLocalUserManagement = false,
}) {
  const { t } = useLocale();
  const roleLabel = t(`roles.${user.role}`);

  return (
    <header className="flex items-center justify-end gap-1.5 bg-sepela-toolbar px-4 py-2 shrink-0">
      {trainingMode && (
        <span className="mr-auto text-[9px] font-bold px-2 py-0.5 rounded-sm bg-amber-500 text-black">
          {t("header.training")}
        </span>
      )}

      {can(user.role, PERMISSIONS.POS_SELL) && (
        <span className="hidden sm:inline text-white text-sm font-bold mr-1">
          {exchangeRateLabel(exchangeRate, primaryCurrency)}
        </span>
      )}

      {can(user.role, PERMISSIONS.MANAGE_PRODUCTS) && (
        <button
          type="button"
          onClick={onOpenProducts}
          className="sepela-toolbar-btn relative"
          title={t("header.products")}
        >
          <Package size={18} />
          {expiryAlertCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-sm bg-sepela-accent text-[10px] font-bold text-white px-1">
              {expiryAlertCount > 9 ? "9+" : expiryAlertCount}
            </span>
          )}
        </button>
      )}

      {can(user.role, PERMISSIONS.MANAGE_PRODUCTS) && expiryAlertCount > 0 && (
        <span
          className="hidden md:flex items-center gap-1 text-[10px] font-bold text-sepela-muted px-2 py-1 rounded-sm bg-sepela-elevated"
          title={t("header.expiryAlerts")}
        >
          <AlertTriangle size={12} />
          {t("header.expiryCount", { count: expiryAlertCount })}
        </span>
      )}

      {can(user.role, PERMISSIONS.VIEW_INVOICES) && (
        <button type="button" onClick={onOpenInvoices} className="sepela-toolbar-btn" title={t("header.invoicesRefunds")}>
          <FileText size={18} />
        </button>
      )}

      {can(user.role, PERMISSIONS.VIEW_INVOICES) && (
        <button type="button" onClick={onOpenClients} className="sepela-toolbar-btn" title={t("header.clients")}>
          <UserCircle size={18} />
        </button>
      )}

      {can(user.role, PERMISSIONS.MANAGE_SETTINGS) && onOpenPromotions && (
        <button type="button" onClick={onOpenPromotions} className="sepela-toolbar-btn" title={t("header.promotions")}>
          <Tag size={18} />
        </button>
      )}

      {can(user.role, PERMISSIONS.MANAGE_SETTINGS) && (
        <button type="button" onClick={onOpenSettings} className="sepela-toolbar-btn" title={t("header.settings")}>
          <Settings size={18} />
        </button>
      )}

      {can(user.role, PERMISSIONS.VIEW_REPORTS) && !reportsAreHome && (
        <button type="button" onClick={onOpenReports} className="sepela-toolbar-btn" title={t("header.reports")}>
          <BarChart3 size={18} />
        </button>
      )}

      {can(user.role, PERMISSIONS.MANAGE_USERS) && !hideLocalUserManagement && (
        <button type="button" onClick={onOpenUsers} className="sepela-toolbar-btn" title={t("header.users")}>
          <User size={18} />
        </button>
      )}

      <IdleMusicControl active />

      <Box className="flex items-center gap-2 pl-2 ml-1 shadow-[inset_1px_0_0_#383838]">
        <Box className="text-right hidden sm:block">
          <p className="text-xs font-bold text-white leading-tight">{user.displayName}</p>
          <p className="text-[10px] font-bold text-sepela-muted">{roleLabel}</p>
        </Box>
        <button
          type="button"
          onClick={onLogout}
          className="sepela-toolbar-btn hover:!bg-red-950/40 hover:!text-red-400"
          title={t("header.signOut")}
        >
          <LogOut size={18} />
        </button>
      </Box>
    </header>
  );
}
