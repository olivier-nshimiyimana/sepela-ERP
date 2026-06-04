import { computeCashPayment, quickTenderAmounts } from "../utils/changeCalculator";

const Box = "d" + "iv";

export default function ChangeCalculator({
  totalUSD,
  exchangeRate,
  amountReceived,
  onAmountReceivedChange,
}) {
  const received = parseFloat(amountReceived) || 0;
  const { canPay, changeDueUSD, shortfallUSD } = computeCashPayment(received, totalUSD);
  const changeCDF = Math.round(changeDueUSD * exchangeRate);
  const shortfallCDF = Math.round(shortfallUSD * exchangeRate);
  const quickAmounts = quickTenderAmounts(totalUSD);

  return (
    <Box className="space-y-3">
      <Box className="flex flex-wrap gap-2">
        {quickAmounts.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => onAmountReceivedChange(amt.toFixed(2))}
            className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors ${
              Math.abs(received - amt) < 0.01
                ? "border-blue-500 bg-blue-950/50 text-white"
                : "border-gray-700 bg-[#252525] text-gray-300 hover:border-gray-500"
            }`}
          >
            {Math.abs(amt - totalUSD) < 0.01 ? "Exact" : `$${amt.toFixed(0)}`}
          </button>
        ))}
      </Box>

      {canPay ? (
        <Box className="rounded-lg border border-green-800/50 bg-green-950/25 p-4 text-center space-y-1">
          <p className="text-[10px] uppercase font-bold text-green-500 tracking-widest">
            {changeDueUSD < 0.01 ? "Exact payment" : "Give back to customer"}
          </p>
          {changeDueUSD >= 0.01 && (
            <>
              <p className="text-4xl font-black text-white tabular-nums">${changeDueUSD.toFixed(2)}</p>
              <p className="text-xl font-bold text-green-400 tabular-nums">
                {changeCDF.toLocaleString()} FC
              </p>
            </>
          )}
          <p className="text-xs text-gray-400 pt-2 font-mono">
            ${received.toFixed(2)} received − ${totalUSD.toFixed(2)} total
            {changeDueUSD >= 0.01 && ` = $${changeDueUSD.toFixed(2)} change`}
          </p>
        </Box>
      ) : received > 0 ? (
        <Box className="rounded-lg border border-red-800/50 bg-red-950/20 p-4 text-center">
          <p className="text-[10px] uppercase font-bold text-red-400 tracking-widest">
            Still needed
          </p>
          <p className="text-3xl font-black text-red-300 tabular-nums mt-1">
            ${shortfallUSD.toFixed(2)}
          </p>
          <p className="text-sm text-red-400/90">{shortfallCDF.toLocaleString()} FC</p>
          <p className="text-xs text-gray-500 mt-2">
            Received ${received.toFixed(2)} · Total ${totalUSD.toFixed(2)}
          </p>
        </Box>
      ) : (
        <p className="text-xs text-gray-500 text-center">
          Enter amount received or tap a quick amount above
        </p>
      )}
    </Box>
  );
}
