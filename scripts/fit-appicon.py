"""
Prepare app icon for Windows/macOS: transparent background, logo scaled to fill ~92% of canvas.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "appicon.png"
SIZE = 1024
MARGIN_RATIO = 0.04
BLACK_THRESHOLD = 28


def resolve_source() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    original = ROOT / "appicon-original.png"
    if original.is_file():
        return original
    return ROOT / "appicon.png"


def content_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    rgba = im.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    min_x, min_y = w, h
    max_x, max_y = 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            if r <= BLACK_THRESHOLD and g <= BLACK_THRESHOLD and b <= BLACK_THRESHOLD:
                continue
            found = True
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    if not found:
        return 0, 0, w, h
    return min_x, min_y, max_x + 1, max_y + 1


def strip_black_to_alpha(im: Image.Image) -> Image.Image:
    rgba = im.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            if r <= BLACK_THRESHOLD and g <= BLACK_THRESHOLD and b <= BLACK_THRESHOLD:
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def fit_icon(src: Path, dest: Path, size: int = SIZE, margin_ratio: float = MARGIN_RATIO) -> None:
    im = strip_black_to_alpha(Image.open(src))
    bbox = content_bbox(im)
    cropped = strip_black_to_alpha(im.crop(bbox))
    inner = max(1, int(size * (1 - 2 * margin_ratio)))
    cw, ch = cropped.size
    scale = min(inner / cw, inner / ch)
    nw = max(1, int(cw * scale))
    nh = max(1, int(ch * scale))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, optimize=True)


def main() -> int:
    src = resolve_source()
    if not src.is_file():
        print(f"Missing source image: {src}", file=sys.stderr)
        return 1
    backup = ROOT / "appicon-original.png"
    if not backup.exists() and src.resolve() != backup.resolve():
        shutil.copy2(src, backup)
        print(f"Backed up source to {backup.name}")
    fit_icon(src, OUT)
    for rel in ("public/appicon.png", "portal-admin/public/appicon.png"):
        shutil.copy2(OUT, ROOT / rel)
    print(f"Wrote transparent {SIZE}x{SIZE} icon (no black square) from {src.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
