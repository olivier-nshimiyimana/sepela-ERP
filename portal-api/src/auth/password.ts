import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";

const ITERATIONS = 100_000;

export function createSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256").toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const derived = hashPassword(password, salt);
  try {
    return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(expectedHash, "hex"));
  } catch {
    return false;
  }
}
