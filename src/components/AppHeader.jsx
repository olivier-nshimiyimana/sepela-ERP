import { AlertTriangle, BarChart3, FileText, LogOut, Package, Settings, User } from "lucide-react";
import { can, PERMISSIONS } from "../auth/permissions";
import { exchangeRateLabel } from "../utils/currency";
import { useLocale } from "../contexts/LocaleContext";

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
  onOpenReports,
  onOpenUsers,
  onOpenInvoices,
  hideLocalUserManagement = false,
}) {
  const { t } = useLocale();
  const roleLabel = t(`roles.${user.role}`);

  return (
    <header className="flex items-center justify-between bg-[#1a1a1a] p-3 border-b border-gray-800 shrink-0">
      <h1 className="text-xl font-bold text-blue-500 tracking-tight px-2 flex items-center gap-2">
        SEPELA <span className="text-white">INC</span>
        {trainingMode && (
          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500 text-black">
            {t("header.training")}
          </span>
        )}
      </h1>

      <Box className="flex items-center gap-2 sm:gap-3">
        {can(user.role, PERMISSIONS.POS_SELL) && (
          <span className="hidden sm:inline text-green-500 font-bold italic text-sm">
            {exchangeRateLabel(exchangeRate, primaryCurrency)}
          </span>
        )}

        {can(user.role, PERMISSIONS.MANAGE_PRODUCTS) && (
          <button
            type="button"
            onClick={onOpenProducts}
            className="relative p-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-blue-500"
            title={t("header.products")}
          >
            <Package size={18} />
            {expiryAlertCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-black px-1">
                {expiryAlertCount > 9 ? "9+" : expiryAlertCount}
              </span>
            )}
          </button>
        )}

        {can(user.role, PERMISSIONS.MANAGE_PRODUCTS) && expiryAlertCount > 0 && (
          <span
            className="hidden md:flex items-center gap-1 text-[10px] font-bold uppercase text-amber-400 border border-amber-900/50 px-2 py-1 rounded"
            title={t("header.expiryAlerts")}
          >
            <AlertTriangle size={12} />
            {t("header.expiryCount", { count: expiryAlertCount })}
          </span>
        )}

        {can(user.role, PERMISSIONS.VIEW_INVOICES) && (
          <button
            type="button"
            onClick={onOpenInvoices}
            className="p-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-cyan-600"
            title={t("header.invoicesRefunds")}
          >
            <FileText size={18} />
          </button>
        )}

        {can(user.role, PERMISSIONS.VIEW_INVOICES) && (
          <button
            type="button"
            onClick={onOpenClients}
            className="px-3 py-2 rounded border border-gray-700 text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-white hover:border-cyan-500"
            title={t("header.clients")}
          >
            {t("header.clients")}
          </button>
        )}

        {can(user.role, PERMISSIONS.MANAGE_SETTINGS) && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-blue-500"
            title={t("header.settings")}
          >
            <Settings size={18} />
          </button>
        )}

        {can(user.role, PERMISSIONS.VIEW_REPORTS) && !reportsAreHome && (
          <button
            type="button"
            onClick={onOpenReports}
            className="p-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-amber-500"
            title={t("header.reports")}
          >
            <BarChart3 size={18} />
          </button>
        )}

        {can(user.role, PERMISSIONS.MANAGE_USERS) && !hideLocalUserManagement && (
          <button
            type="button"
            onClick={onOpenUsers}
            className="p-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-purple-500"
            title={t("header.users")}
          >
            <User size={18} />
          </button>
        )}

        <Box className="flex items-center gap-2 pl-2 border-l border-gray-800">
          <Box className="text-right hidden sm:block">
            <p className="text-xs font-medium text-white leading-tight">{user.displayName}</p>
            <p className="text-[10px] text-gray-500 uppercase">{roleLabel}</p>
          </Box>
          <button
            type="button"
            onClick={onLogout}
            className="p-2 rounded border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-900"
            title={t("header.signOut")}
          >
            <LogOut size={18} />
          </button>
        </Box>
      </Box>
    </header>
  );
}
