const EPSILON = 0.001;

export function roundMoney(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function computeCashPayment(received, totalUSD) {
  const receivedN = Number(received) || 0;
  const total = Number(totalUSD) || 0;
  const canPay = total > 0 && receivedN + EPSILON >= total;
  const changeDueUSD = canPay ? roundMoney(receivedN - total) : 0;
  const shortfallUSD = canPay ? 0 : roundMoney(Math.max(0, total - receivedN));

  return { receivedN, canPay, changeDueUSD, shortfallUSD };
}

/** Quick tender amounts for cashiers (exact + rounded-up common bills). */
export function quickTenderAmounts(totalUSD) {
  const total = roundMoney(totalUSD);
  const candidates = new Set([total]);
  for (const bill of [5, 10, 20, 50, 100]) {
    if (bill >= total - EPSILON) candidates.add(bill);
    else candidates.add(roundMoney(Math.ceil(total / bill) * bill));
  }
  return [...candidates].sort((a, b) => a - b).slice(0, 6);
}
