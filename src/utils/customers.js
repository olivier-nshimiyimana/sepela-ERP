import { appError, DEFAULT_LOCALE } from "../i18n";

export function normalizeCustomerFields(fields = {}) {
  const name = String(fields.name ?? "").trim();
  const phoneRaw = String(fields.phone ?? "").trim();
  const addressRaw = String(fields.address ?? "").trim();
  const emailRaw = String(fields.email ?? "").trim();
  const taxNumberRaw = String(fields.taxNumber ?? "").trim();
  return {
    id: fields.id ?? null,
    name,
    phone: phoneRaw || null,
    address: addressRaw || null,
    email: emailRaw || null,
    taxNumber: taxNumberRaw || null,
  };
}

export function validateCustomerFields(fields = {}, locale = DEFAULT_LOCALE) {
  const data = normalizeCustomerFields(fields);
  if (!data.name) {
    return { ok: false, error: appError("clientNameRequired", locale) };
  }
  if (!data.phone) {
    return { ok: false, error: appError("clientPhoneRequired", locale) };
  }
  if (!data.taxNumber) {
    return { ok: false, error: appError("clientTaxRequired", locale) };
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { ok: false, error: appError("clientEmailInvalid", locale) };
  }
  return { ok: true, data };
}

export function customerNameKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

export function sortCustomers(customers = []) {
  return [...customers].sort((a, b) => {
    const nameCmp = customerNameKey(a.name).localeCompare(customerNameKey(b.name));
    if (nameCmp !== 0) return nameCmp;
    return String(a.phone ?? "").localeCompare(String(b.phone ?? ""));
  });
}

export function findMatchingCustomer(customers = [], fields = {}) {
  const data = normalizeCustomerFields(fields);
  if (data.id) {
    return customers.find((customer) => customer.id === data.id) ?? null;
  }

  if (data.taxNumber) {
    const taxMatch = customers.find(
      (customer) => String(customer.taxNumber ?? "").trim() === data.taxNumber
    );
    if (taxMatch) return taxMatch;
  }

  const key = customerNameKey(data.name);
  if (!key) return null;

  const exactPhoneMatch = customers.find(
    (customer) =>
      customerNameKey(customer.name) === key &&
      String(customer.phone ?? "") === String(data.phone ?? "")
  );
  if (exactPhoneMatch) return exactPhoneMatch;

  return customers.find((customer) => customerNameKey(customer.name) === key) ?? null;
}

export function saleBelongsToCustomer(sale = {}, customer = {}) {
  if (customer.id && sale.customerId && sale.customerId === customer.id) {
    return true;
  }

  if (customer.taxNumber && sale.customerTaxNumber) {
    if (String(customer.taxNumber).trim() === String(sale.customerTaxNumber).trim()) {
      return true;
    }
  }

  const customerName = customerNameKey(customer.name);
  const saleName = customerNameKey(sale.customerName);
  if (!customerName || !saleName || customerName !== saleName) {
    return false;
  }

  const customerPhone = String(customer.phone ?? "").trim();
  const salePhone = String(sale.customerPhone ?? "").trim();
  if (customerPhone && salePhone) {
    return customerPhone === salePhone;
  }

  return true;
}

export function salesForCustomer(sales = [], customer = {}) {
  return sales.filter((sale) => saleBelongsToCustomer(sale, customer));
}
