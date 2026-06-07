import { newEntityId } from "./ids";

const STORAGE_PREFIX = "sepela-cart-drafts";
const MAX_DRAFTS = 30;

function storageKey(merchantCode, operatorId) {
  return `${STORAGE_PREFIX}:${merchantCode || "local"}:${operatorId || "anonymous"}`;
}

function readDrafts(merchantCode, operatorId) {
  try {
    const raw = localStorage.getItem(storageKey(merchantCode, operatorId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDrafts(merchantCode, operatorId, drafts) {
  localStorage.setItem(storageKey(merchantCode, operatorId), JSON.stringify(drafts));
}

function draftTotalUSD(cart = []) {
  return cart.reduce((sum, line) => sum + (Number(line.price) || 0) * (Number(line.qty) || 0), 0);
}

function lineCount(cart = []) {
  return cart.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
}

export function listCartDrafts(merchantCode, operatorId) {
  return readDrafts(merchantCode, operatorId).sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
}

export function saveCartDraft({
  merchantCode,
  operatorId,
  operatorName,
  label,
  cart,
}) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return { ok: false, error: "Add items to the cart before saving a draft." };
  }

  const trimmedLabel = String(label ?? "").trim();
  const draft = {
    id: newEntityId("draft"),
    label: trimmedLabel || `Draft ${new Date().toLocaleString()}`,
    cart: JSON.parse(JSON.stringify(cart)),
    totalUSD: draftTotalUSD(cart),
    itemCount: lineCount(cart),
    savedAt: new Date().toISOString(),
    savedBy: operatorName ?? "",
  };

  const drafts = readDrafts(merchantCode, operatorId);
  drafts.unshift(draft);
  writeDrafts(merchantCode, operatorId, drafts.slice(0, MAX_DRAFTS));

  return { ok: true, draft };
}

export function deleteCartDraft(merchantCode, operatorId, draftId) {
  const drafts = readDrafts(merchantCode, operatorId).filter((draft) => draft.id !== draftId);
  writeDrafts(merchantCode, operatorId, drafts);
  return { ok: true };
}

export function getCartDraft(merchantCode, operatorId, draftId) {
  const draft = readDrafts(merchantCode, operatorId).find((entry) => entry.id === draftId);
  if (!draft) {
    return { ok: false, error: "Draft not found." };
  }
  return {
    ok: true,
    draft: {
      ...draft,
      cart: JSON.parse(JSON.stringify(draft.cart ?? [])),
    },
  };
}
