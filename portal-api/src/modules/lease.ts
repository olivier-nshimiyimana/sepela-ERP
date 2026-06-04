import crypto from "node:crypto";
import { config } from "../config.js";

export type OfflineLeasePayload = {
  merchantCode: string;
  branchCode: string;
  deviceCode: string;
  activationCode: string;
  validFrom: string;
  validUntil: string;
};

export function signOfflineLease(payload: OfflineLeasePayload): { leaseToken: string; signedPayload: string } {
  const raw = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", config.LEASE_SIGNING_SECRET)
    .update(raw)
    .digest("hex");

  return {
    leaseToken: crypto.randomUUID(),
    signedPayload: Buffer.from(
      JSON.stringify({
        payload,
        signature,
        algorithm: "HMAC-SHA256",
      })
    ).toString("base64url"),
  };
}
