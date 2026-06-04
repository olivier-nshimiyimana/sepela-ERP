/** Live POS search over in-memory products (loaded from SQLite in Tauri). */

export function tokenizeSearchQuery(query) {
  return String(query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function productHaystack(product) {
  return [
    product.name,
    product.lotNumber,
    product.id,
    product.price != null ? String(product.price) : "",
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
}

/** Every token must appear somewhere on the product (name, lot, id, or price). */
export function productMatchesSearch(product, tokens) {
  if (!tokens.length) return true;
  const haystack = productHaystack(product);
  return tokens.every((t) => haystack.includes(t));
}

export function filterProductsBySearch(products, searchTerm) {
  const tokens = tokenizeSearchQuery(searchTerm);
  if (!tokens.length) return products;
  return products.filter((p) => productMatchesSearch(p, tokens));
}

export function hasActiveProductSearch(searchTerm) {
  return tokenizeSearchQuery(searchTerm).length > 0;
}
