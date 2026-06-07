import { appError, DEFAULT_LOCALE } from "../i18n";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_DIM = 120;
const BLACK_THRESHOLD = 28;
const ALPHA_CUTOFF = 16;

export function isValidCompanyLogoDataUrl(value) {
  return typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(value);
}

export function sanitizeCompanyLogo(value) {
  return isValidCompanyLogoDataUrl(value) ? value : "";
}

/**
 * Resize, strip near-black padding to transparency, trim, export PNG.
 * @returns {Promise<{ ok: true, dataUrl: string } | { ok: false, error: string }>}
 */
export async function readCompanyLogoFile(file, locale = DEFAULT_LOCALE) {
  if (!file) {
    return { ok: false, error: appError("logoNoFile", locale) };
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return { ok: false, error: appError("logoBadType", locale) };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: appError("logoTooLarge", locale) };
  }

  let objectUrl = "";
  try {
    objectUrl = URL.createObjectURL(file);
    const image = await loadImage(objectUrl);
    const dataUrl = renderLogoDataUrl(image);
    return { ok: true, dataUrl };
  } catch {
    return { ok: false, error: appError("logoReadFailed", locale) };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Re-process a stored logo (e.g. old JPEG with solid black box) for transparent PNG display. */
export async function reprocessLogoDataUrl(dataUrl) {
  const safe = sanitizeCompanyLogo(dataUrl);
  if (!safe) return "";
  if (safe.startsWith("data:image/png")) return safe;
  try {
    const image = await loadImage(safe);
    return renderLogoDataUrl(image);
  } catch {
    return safe;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed"));
    img.src = src;
  });
}

function renderLogoDataUrl(image) {
  const scale = Math.min(1, MAX_OUTPUT_DIM / Math.max(image.width, image.height, 1));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("canvas unavailable");
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  let imageData = ctx.getImageData(0, 0, width, height);
  stripNearBlackToAlpha(imageData);
  const trimmed = trimToAlphaBounds(imageData, width, height);
  if (!trimmed) {
    return canvas.toDataURL("image/png");
  }

  const out = document.createElement("canvas");
  out.width = trimmed.width;
  out.height = trimmed.height;
  const outCtx = out.getContext("2d");
  if (!outCtx) {
    return canvas.toDataURL("image/png");
  }
  outCtx.putImageData(trimmed.imageData, 0, 0);
  return out.toDataURL("image/png");
}

function stripNearBlackToAlpha(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
}

function trimToAlphaBounds(imageData, width, height) {
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < ALPHA_CUTOFF) continue;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) return null;

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const cropped = new ImageData(cropW, cropH);
  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      const src = ((minY + y) * width + (minX + x)) * 4;
      const dst = (y * cropW + x) * 4;
      cropped.data[dst] = data[src];
      cropped.data[dst + 1] = data[src + 1];
      cropped.data[dst + 2] = data[src + 2];
      cropped.data[dst + 3] = data[src + 3];
    }
  }

  return { imageData: cropped, width: cropW, height: cropH };
}
