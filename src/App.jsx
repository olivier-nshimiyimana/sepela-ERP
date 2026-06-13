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
import PromotionManageModal from "./components/PromotionManageModal";
import UserManageModal from "./components/UserManageModal";
import { useAuth } from "./contexts/AuthContext";
import { useCart } from "./hooks/useCart";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import { LocaleProvider } from "./contexts/LocaleContext";
import { translate } from "./i18n";
import { useDatabase } from "./contexts/DatabaseContext";
import { buildAppBackup, validateAppBackup } from "./utils/backupFormat";
import { expandCartToSaleItems } from "./utils/fefo";
import { roundUsd, usdToCdf } from "./utils/currency";
import {
  receiptContextForCopy,
  receiptContextForProforma,
  receiptContextForRefund,
} from "./domain/receiptTransaction";
import { resolvePortalConnection } from "./config/portalDefaults";
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
    productCategories: queue.productCategories?.length ?? 0,
    promotions: queue.promotions?.length ?? 0,
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
    primaryCurrency,
    language,
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
    promotions,
    productCategories,
    evaluateCartPromotions,
    savePromotion,
    saveProductCategory,
    deletePromotion,
  } = db;

  const {
    cart,
    upsertLine,
    replaceCart,
    removeLine,
    clearCart,
    removeProductFromCart,
    totalUSD,
    grossTotalUSD,
    manualDiscountUSD,
  } = useCart();

  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isClientsOpen, setIsClientsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromotionsOpen, setIsPromotionsOpen] = useState(false);
  const [isUsersOpen, setIsUsersOpen] = useState(false);
  const [isInvoiceHistoryOpen, setIsInvoiceHistoryOpen] = useState(false);
  const [invoiceModalSale, setInvoiceModalSale] = useState(null);
  const [invoiceReceiptContext, setInvoiceReceiptContext] = useState(null);
  const [refundTargetSale, setRefundTargetSale] = useState(null);
  const [syncQueueSummary, setSyncQueueSummary] = useState(() => summarizeSyncQueue());
  const [sessionSalesUSD, setSessionSalesUSD] = useState(0);

  useEffect(() => {
    setSessionSalesUSD(0);
  }, [user?.id]);

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
    if (options.done) {
      clearCart();
      return true;
    }

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

    const customerForPromo =
      customer ??
      (summary.customerId ? customers.find((row) => row.id === summary.customerId) : null);
    const promoResult = evaluateCartPromotions
      ? evaluateCartPromotions({
          cart: cartItems,
          products,
          promotions: promotions ?? [],
          customer: customerForPromo,
        })
      : {
          totalAfterDiscountUSD: summary.totalUSD,
          totalDiscountUSD: summary.promotionDiscountUSD ?? 0,
          appliedPromotionIds: summary.appliedPromotionId ? [summary.appliedPromotionId] : [],
        };
    const finalTotalUSD = roundUsd(promoResult.totalAfterDiscountUSD);
    const finalTotalCDF = usdToCdf(finalTotalUSD, exchangeRate);

    const sale = await recordSale({
      ...summary,
      totalUSD: finalTotalUSD,
      totalCDF: finalTotalCDF,
      manualDiscountUSD: roundUsd(summary.manualDiscountUSD ?? manualDiscountUSD),
      promotionDiscountUSD: roundUsd(promoResult.totalDiscountUSD),
      appliedPromotionId: promoResult.appliedPromotionIds?.[0] ?? null,
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
      merchantCode: user.merchantCode,
      exchangeRate,
    });
    if (sale?.ok === false) {
      alert(sale.error ?? "Could not record sale.");
      return false;
    }
    await decrementStockForSale(saleItems);
    if (!trainingMode) {
      const amount = roundUsd(sale?.totalUSD ?? summary?.totalUSD ?? 0);
      if (amount > 0) {
        setSessionSalesUSD((prev) => roundUsd(prev + amount));
      }
    }

    if (options.recordOnly) {
      return sale;
    }

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
    const refundedTraining = result.sale?.receiptType === "TRAINING";
    if (!trainingMode && !refundedTraining) {
      const amount = Number(result.sale?.totalUSD ?? 0);
      if (amount > 0) {
        setSessionSalesUSD((prev) => Math.max(0, prev - amount));
      }
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
      <LocaleProvider locale={language}>
        <div className="min-h-screen flex items-center justify-center bg-sepela-bg">
          <div className="sepela-loading">
            <div className="sepela-loading__spinner" aria-hidden="true" />
            <span>{translate("common.loading", language)}</span>
          </div>
        </div>
      </LocaleProvider>
    );
  }

  if (!licenseAccepted) {
    return (
      <LocaleProvider locale={language}>
        <LicenseAgreementModal
          onAccept={async (locale) => {
            await acceptLicenseAgreement(locale);
          }}
        />
      </LocaleProvider>
    );
  }

  if (!isLoggedIn) {
    return (
      <LocaleProvider locale={language}>
        <LoginScreen onLogin={login} ready={ready} />
      </LocaleProvider>
    );
  }

  const portal = resolvePortalConnection(cloudSync);
  const showPos = canSell(user.role);
  const showReports = can(user.role, PERMISSIONS.VIEW_REPORTS);

  return (
    <LocaleProvider locale={language}>
    <CurrencyProvider exchangeRate={exchangeRate} primaryCurrency={primaryCurrency}>
    <div className="relative flex h-screen w-screen flex-col bg-sepela-bg text-white overflow-hidden font-sans text-[15px] font-semibold">
      <AppHeader
        user={user}
        exchangeRate={exchangeRate}
        primaryCurrency={primaryCurrency}
        expiryAlertCount={expiryAlertCount}
        reportsAreHome={showReports && !showPos}
        trainingMode={trainingMode}
        onLogout={logout}
        onOpenProducts={() => setIsProductsOpen(true)}
        onOpenClients={() => setIsClientsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenPromotions={() => setIsPromotionsOpen(true)}
        onOpenReports={() => {}}
        onOpenUsers={() => setIsUsersOpen(true)}
        hideLocalUserManagement={cloudConfigured}
        onOpenInvoices={() => setIsInvoiceHistoryOpen(true)}
      />

      {showPos && (
        <PosScreen
          user={user}
          merchantCode={user?.merchantCode ?? activeTenant?.merchantCode ?? authMerchantCode ?? "local"}
          sessionSalesUSD={sessionSalesUSD}
          products={products}
          customers={customers}
          exchangeRate={exchangeRate}
          primaryCurrency={primaryCurrency}
          expiryAlertDays={expiryAlertDays}
          cart={cart}
          totalUSD={totalUSD}
          grossTotalUSD={grossTotalUSD}
          manualDiscountUSD={manualDiscountUSD}
          upsertLine={upsertLine}
          replaceCart={replaceCart}
          removeLine={removeLine}
          clearCart={clearCart}
          onPaymentComplete={handlePaymentComplete}
          invoiceProfile={invoiceProfile}
          onOpenInvoice={(sale) => openInvoice(sale, null)}
          onProforma={handleProforma}
          onOpenProducts={() => setIsProductsOpen(true)}
          promotions={promotions}
          evaluateCartPromotions={evaluateCartPromotions}
        />
      )}

      {showReports && !showPos && (
        <ReportsScreen
          user={user}
          merchantCode={user?.merchantCode ?? activeTenant?.merchantCode ?? authMerchantCode ?? "local"}
          portalApiBaseUrl={portal.apiBaseUrl}
          portalApiToken={portal.apiToken}
          cloudConfigured={cloudConfigured}
          authMode={authMode}
          sales={sales}
          products={products}
          promotions={promotions ?? []}
          stockSnapshots={stockSnapshots}
          exchangeRate={exchangeRate}
          expiryAlertDays={expiryAlertDays}
        />
      )}

      <ProductManageModal
        isOpen={isProductsOpen}
        products={products}
        productCategories={productCategories ?? []}
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
        primaryCurrency={primaryCurrency}
        language={language}
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

      <PromotionManageModal
        isOpen={isPromotionsOpen}
        promotions={promotions ?? []}
        productCategories={productCategories ?? []}
        products={products}
        onClose={() => setIsPromotionsOpen(false)}
        onSave={savePromotion}
        onSaveCategory={saveProductCategory}
        onDelete={deletePromotion}
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
        promotions={promotions ?? []}
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
          promotions={promotions ?? []}
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
    </CurrencyProvider>
    </LocaleProvider>
  );
}
