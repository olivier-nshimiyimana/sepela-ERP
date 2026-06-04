/** UUIDv4 entity id with optional prefix (e.g. inv_8f3b2a1c). */
export function newEntityId(prefix) {
  const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return prefix ? `${prefix}_${hex}` : crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}
