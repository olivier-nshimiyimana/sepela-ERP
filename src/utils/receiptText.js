/** Fixed width for thermal/plain-text receipts (42 = common 80mm paper). */
export const RECEIPT_WIDTH = 42;

export function repeatChar(ch, width = RECEIPT_WIDTH) {
  return ch.repeat(Math.max(0, width));
}

export function padEnd(text, width, ch = " ") {
  const s = String(text ?? "");
  if (s.length >= width) return s.slice(0, width);
  return s + ch.repeat(width - s.length);
}

export function padStart(text, width, ch = " ") {
  const s = String(text ?? "");
  if (s.length >= width) return s.slice(-width);
  return ch.repeat(width - s.length) + s;
}

export function center(text, width = RECEIPT_WIDTH) {
  const s = String(text ?? "").trim();
  if (s.length >= width) return s.slice(0, width);
  const left = Math.floor((width - s.length) / 2);
  return " ".repeat(left) + s + " ".repeat(width - s.length - left);
}

/** Word-wrap paragraph to width; preserves explicit newlines. */
export function wrapLines(text, width = RECEIPT_WIDTH) {
  const out = [];
  const paragraphs = String(text ?? "").split(/\r?\n/);
  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length <= width) {
        line = next;
      } else {
        if (line) out.push(line);
        line = word.length > width ? word.slice(0, width) : word;
        while (line.length > width) {
          out.push(line.slice(0, width));
          line = line.slice(width);
        }
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** label left, value right on one line. */
export function labelValue(label, value, width = RECEIPT_WIDTH) {
  const l = String(label ?? "");
  const v = String(value ?? "");
  const gap = width - l.length - v.length;
  if (gap >= 1) return l + " ".repeat(gap) + v;
  return `${l.slice(0, Math.max(1, width - v.length - 1))} ${v}`.slice(0, width);
}

/** Qty | item name | line total (receipt line items). */
export function formatReceiptItemLine(qty, name, lineTotalUsd, width = RECEIPT_WIDTH) {
  const qtyCol = 4;
  const amtCol = 10;
  const nameCol = width - qtyCol - amtCol - 2;
  const qtyStr = padStart(String(qty), qtyCol);
  const amtStr = padStart(`$${Number(lineTotalUsd).toFixed(2)}`, amtCol);
  const nameStr = padEnd(String(name).slice(0, nameCol), nameCol);
  return `${qtyStr} ${nameStr} ${amtStr}`;
}

export function formatReceiptSubLine(text, width = RECEIPT_WIDTH) {
  return `   ${padEnd(String(text).slice(0, width - 3), width - 3)}`;
}
