const ITERATIONS = 100_000;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes);
}

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return toHex(bits);
}

export async function verifyPassword(password, salt, expectedHash) {
  const hash = await hashPassword(password, salt);
  return hash === expectedHash;
}
