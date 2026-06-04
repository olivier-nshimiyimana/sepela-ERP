import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { can, canSell, PERMISSIONS } from "./auth/permissions";
import AppHeader from "./components/AppHeader";
import ClientManageModal from "./components/ClientManageModal";
import InvoiceHistoryModal from "./components/InvoiceHistoryModal";
import LicenseAgreementModal from "./components/LicenseAgreementModal";
import LoginScreen from "./components/LoginScreen";
import PosScreen from "./components/PosScreen";
import ProductManageModal from "./components/ProductManageModal";
import RefundConfirmModal from "./components/RefundConfirmModal";
import ReportsScreen from "./components/ReportsScreen";
import SettingsModal from "./components/SettingsModal";
import UserManageModal from "./components/UserManageModal";
import { useAuth } from "./contexts/AuthContext";
import { useCart } from "./hooks/useCart";
import { useDatabase } from "./contexts/DatabaseContext";
import { buildAppBackup, validateAppBackup } from "./utils/backupFormat";
import { expandCartToSaleItems } from "./utils/fefo";
import {
  receiptContextForCopy,
  receiptContextForProforma,
  receiptContextForRefund,
} from "./domain/receiptTransaction";
import { buildProformaFromCart } from "./utils/proformaSale";
import { getExpiryAlerts } from "./utils/productExpiry";

const InvoiceModal = lazy(() => import("./components/InvoiceModal"));

function summarizeSyncQueue(queue = {}) {
  const summary = {
    products: queue.products?.length ?? 0,
    customers: queue.customers?.length ?? 0,
    suppliers: queue.suppliers?.length ?? 0,
    sales: queue.sales?.length ?? 0,
    purchases: queue.purchases?.length ?? 0,
    settings: queue.settings?.length ?? 0,
    stockSnapshots: queue.stockSnapshots?.length ?? 0,
  };
  return {
    ...summary,
    total: Object.values(summary).reduce((sum, value) => sum + value, 0),
  };
}

export default function App() {
  const {
    user,
    users,
    ready,
    login,
    logout,
    addUser,
    setUserActive,
    restoreUsers,
    isLoggedIn,
    cloudConfigured,
    merchantCode: authMerchantCode,
    authMode,
    lastAuthMessage,
  } = useAuth();
  const db = useDatabase();
  const {
    products,
    customers,
    suppliers,
    sales,
    purchases,
    stockSnapshots,
    backupHistory,
    cloudSync,
    activeTenant,
    exchangeRate,
    expiryAlertDays,
    invoiceProfile,
    trainingMode,
    setTrainingMode,
    recordSale,
    refundSale,
    incrementCopyIndex,
    addProduct,
    updateProduct,
    deleteProduct,
    importProducts,
    recordPurchase,
    saveCustomer,
    updateCustomer,
    deleteCustomer,
    restockProduct,
    decrementStockForSale,
    restoreStockForRefund,
    updateExchangeRate,
    updateExpiryAlertDays,
    updateInvoiceProfile,
    saveAllSettings,
    saveCloudSyncConfig,
    refreshCloudLeaseStatus,
    exportBackupData,
    restoreBackupData,
    pushPendingSync,
    listPendingSync,
    licenseAccepted,
    acceptLicenseAgreement,
  } = db;

  const {
    cart,
    upsertLine,
    replaceCart,
    removeLine,
    clearCart,
    removeProductFromCart,
    totalUSD,
  } = useCart();

  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isClientsOpen, setIsClientsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUsersOpen, setIsUsersOpen] = useState(false);
  const [isInvoiceHistoryOpen, setIsInvoiceHistoryOpen] = useState(false);
  const [invoiceModalSale, setInvoiceModalSale] = useState(null);
  const [invoiceReceiptContext, setInvoiceReceiptContext] = useState(null);
  const [refundTargetSale, setRefundTargetSale] = useState(null);
  const [syncQueueSummary, setSyncQueueSummary] = useState(() => summarizeSyncQueue());

  const expiryAlerts = useMemo(
    () => getExpiryAlerts(products, expiryAlertDays),
    [products, expiryAlertDays]
  );
  const expiryAlertCount =
    expiryAlerts.expiringSoon.length + expiryAlerts.expired.length;

  useEffect(() => {
    setInvoiceModalSale((prev) => {
      if (!prev || prev.status === "proforma") return prev;
      const fresh = sales.find((s) => s.id === prev.id);
      return fresh || prev;
    });
  }, [sales]);

  const loadSyncQueueSummary = async () => {
    if (!listPendingSync) return;
    const queue = await Promise.resolve(listPendingSync());
    setSyncQueueSummary(summarizeSyncQueue(queue));
  };

  useEffect(() => {
    if (isSettingsOpen) {
      loadSyncQueueSummary();
    }
  }, [isSettingsOpen]);

  const openInvoice = (sale, receiptContext = null) => {
    setInvoiceModalSale(sale);
    setInvoiceReceiptContext(receiptContext);
  };

  const handleDeleteProduct = (id) => {
    deleteProduct(id);
    removeProductFromCart(id);
  };

  const handlePaymentComplete = async (summary, cartItems, options = {}) => {
    const saleItems = expandCartToSaleItems(cartItems);
    let customer = null;
    if (summary.customerName?.trim() && (summary.customerId || summary.saveCustomer)) {
      const saved = await saveCustomer({
        id: summary.customerId ?? null,
        name: summary.customerName,
        phone: summary.customerPhone,
        address: summary.customerAddress,
        email: summary.customerEmail,
        taxNumber: summary.customerTaxNumber,
      });
      if (!saved.ok) {
        alert(saved.error);
        return false;
      }
      customer = saved.customer;
    }

    const sale = await recordSale({
      ...summary,
      customerId: customer?.id ?? summary.customerId ?? null,
      customerName: customer?.name ?? summary.customerName?.trim() ?? null,
      customerPhone: customer?.phone ?? summary.customerPhone?.trim() ?? null,
      customerAddress: customer?.address ?? summary.customerAddress?.trim() ?? null,
      customerEmail: customer?.email ?? summary.customerEmail?.trim() ?? null,
      customerTaxNumber: customer?.taxNumber ?? summary.customerTaxNumber?.trim() ?? null,
      invoicePrefix: invoiceProfile.invoicePrefix,
      items: saleItems,
      cashierId: user.id,
      cashierName: user.displayName,
      exchangeRate,
    });
    await decrementStockForSale(saleItems);
    clearCart();
    if (options.printNow) {
      openInvoice(sale, null);
    }
    return true;
  };

  const handleProforma = () => {
    if (cart.length === 0) return;
    const draft = buildProformaFromCart(cart, user, exchangeRate, totalUSD);
    openInvoice(draft, receiptContextForProforma());
  };

  const handleRefundConfirm = async ({ saleId, reason, restoreStock }) => {
    const result = await refundSale(saleId, {
      reason,
      restoreStock,
      byUserId: user.id,
      byUserName: user.displayName,
    });
    if (!result.ok) {
      alert(result.error);
      return;
    }
    if (restoreStock && result.sale?.items) {
      await restoreStockForRefund(result.sale.items);
    }
    setRefundTargetSale(null);
    const fresh = {
      ...result.sale,
      status: "refunded",
      refund: {
        at: new Date().toISOString(),
        reason: (reason && reason.trim()) || "—",
        restoreStock: !!restoreStock,
        byUserId: user.id,
        byUserName: user.displayName,
      },
    };
    const refundCtx = receiptContextForRefund(fresh, { trainingMode });
    if (window.confirm("Refund recorded. Open refund receipt for print/copy?")) {
      openInvoice(fresh, refundCtx);
    } else {
      alert("Refund recorded. Return cash to the customer manually if applicable.");
    }
  };

  const handleViewInvoiceCopy = async (sale) => {
    const updated = (await incrementCopyIndex(sale.id)) ?? sale;
    const ctx = receiptContextForCopy(updated);
    openInvoice(updated, ctx);
    setIsInvoiceHistoryOpen(false);
  };

  const handleViewClientInvoice = async (sale) => {
    setIsClientsOpen(false);
    await handleViewInvoiceCopy(sale);
  };

  const handleExportBackup = async () => {
    const data = await exportBackupData();
    return buildAppBackup({ users, data });
  };

  const handleRestoreBackup = async (payload) => {
    const validated = validateAppBackup(payload);
    if (!validated.ok) return validated;

    const dbResult = await restoreBackupData(validated.data);
    if (!dbResult.ok) return dbResult;

    const authResult = restoreUsers(validated.data.users);
    if (!authResult.ok) return authResult;

    logout();
    return { ok: true };
  };

  const handleSaveCloudSyncConfig = async (config) => {
    const result = await saveCloudSyncConfig(config);
    if (result?.ok) {
      await loadSyncQueueSummary();
    }
    return result;
  };

  const handlePushPendingSync = async () => {
    const result = await pushPendingSync();
    await loadSyncQueueSummary();
    return result;
  };

  if (!ready || !db.ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-gray-500">
        Loading…
      </div>
    );
  }

  if (!licenseAccepted) {
    return (
      <LicenseAgreementModal
        onAccept={async () => {
          await acceptLicenseAgreement();
        }}
      />
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen onLogin={login} ready={ready} />;
  }

  const showPos = canSell(user.role);
  const showReports = can(user.role, PERMISSIONS.VIEW_REPORTS);

  return (
    <div className="relative flex h-screen w-screen flex-col bg-[#0a0a0a] text-white overflow-hidden font-sans">
      <AppHeader
        user={user}
        exchangeRate={exchangeRate}
        expiryAlertCount={expiryAlertCount}
        reportsAreHome={showReports && !showPos}
        trainingMode={trainingMode}
        onLogout={logout}
        onOpenProducts={() => setIsProductsOpen(true)}
        onOpenClients={() => setIsClientsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReports={() => {}}
        onOpenUsers={() => setIsUsersOpen(true)}
        hideLocalUserManagement={cloudConfigured}
        onOpenInvoices={() => setIsInvoiceHistoryOpen(true)}
      />

      {showPos && (
        <PosScreen
          user={user}
          products={products}
          customers={customers}
          exchangeRate={exchangeRate}
          expiryAlertDays={expiryAlertDays}
          cart={cart}
          totalUSD={totalUSD}
        upsertLine={upsertLine}
        replaceCart={replaceCart}
          removeLine={removeLine}
          clearCart={clearCart}
          onPaymentComplete={handlePaymentComplete}
          onProforma={handleProforma}
          onOpenProducts={() => setIsProductsOpen(true)}
        />
      )}

      {showReports && !showPos && (
        <ReportsScreen
          sales={sales}
          products={products}
          stockSnapshots={stockSnapshots}
          exchangeRate={exchangeRate}
          expiryAlertDays={expiryAlertDays}
        />
      )}

      <ProductManageModal
        isOpen={isProductsOpen}
        products={products}
        suppliers={suppliers}
        purchases={purchases}
        expiryAlertDays={expiryAlertDays}
        currentUser={user}
        onClose={() => setIsProductsOpen(false)}
        onAdd={addProduct}
        onUpdate={updateProduct}
        onDelete={handleDeleteProduct}
        onImport={importProducts}
        onPurchase={recordPurchase}
        onRestock={restockProduct}
      />

      <ClientManageModal
        isOpen={isClientsOpen}
        customers={customers}
        sales={sales}
        invoiceProfile={invoiceProfile}
        onClose={() => setIsClientsOpen(false)}
        onAdd={saveCustomer}
        onUpdate={updateCustomer}
        onDelete={deleteCustomer}
        onViewInvoice={handleViewClientInvoice}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        exchangeRate={exchangeRate}
        expiryAlertDays={expiryAlertDays}
        invoiceProfile={invoiceProfile}
        backupHistory={backupHistory}
        cloudSync={cloudSync}
        activeTenant={activeTenant}
        sessionUser={user}
        syncQueueSummary={syncQueueSummary}
        trainingMode={trainingMode}
        onClose={() => setIsSettingsOpen(false)}
        onSaveRate={updateExchangeRate}
        onSaveExpiryDays={updateExpiryAlertDays}
        onSaveInvoiceProfile={updateInvoiceProfile}
        onSaveTrainingMode={setTrainingMode}
        onSaveAllSettings={saveAllSettings}
        onSaveCloudSyncConfig={handleSaveCloudSyncConfig}
        onRefreshCloudLeaseStatus={refreshCloudLeaseStatus}
        onPushPendingSync={handlePushPendingSync}
        onRefreshSyncQueue={loadSyncQueueSummary}
        onExportBackup={handleExportBackup}
        onRestoreBackup={handleRestoreBackup}
      />

      <UserManageModal
        isOpen={isUsersOpen}
        users={users}
        currentUserId={user.id}
        onClose={() => setIsUsersOpen(false)}
        onAdd={addUser}
        onSetActive={setUserActive}
      />

      <InvoiceHistoryModal
        isOpen={isInvoiceHistoryOpen}
        onClose={() => setIsInvoiceHistoryOpen(false)}
        sales={sales}
        user={user}
        onViewInvoice={handleViewInvoiceCopy}
        onRefund={(sale) => setRefundTargetSale(sale)}
      />

      <Suspense fallback={null}>
        <InvoiceModal
          isOpen={!!invoiceModalSale}
          sale={invoiceModalSale}
          invoiceProfile={invoiceProfile}
          receiptContext={invoiceReceiptContext}
          onClose={() => {
            setInvoiceModalSale(null);
            setInvoiceReceiptContext(null);
          }}
        />
      </Suspense>

      <RefundConfirmModal
        isOpen={!!refundTargetSale}
        sale={refundTargetSale}
        onClose={() => setRefundTargetSale(null)}
        onConfirm={handleRefundConfirm}
      />
    </div>
  );
}
