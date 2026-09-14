#!/usr/bin/env python3
"""Remove a flat (white or light) studio background from a product photo.

    python scripts/strip_bg.py in.jpg web/img/picos/PJ2-3BRL.png [--tolerance 18] [--pad 6]

Flood-fills from the image corners so only background connected to the edges
goes transparent; the white body of a Pico stays because its bevel/shadow
outline stops the fill. Edges are softened, then the result is cropped tight
to the remaining pixels with a little padding.
"""
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    tol = 18
    pad = 6
    args = sys.argv[3:]
    if "--tolerance" in args:
        tol = int(args[args.index("--tolerance") + 1])
    if "--pad" in args:
        pad = int(args[args.index("--pad") + 1])

    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    corners = [a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]]
    bg = np.median(np.stack(corners), axis=0)
    dist = np.abs(a - bg).max(axis=2)  # per-pixel max channel difference from the background colour
    near = dist <= tol

    # flood fill from every edge pixel that is near the background colour
    mask = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not mask[y, x]:
                mask[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not mask[y, x]:
                mask[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True
                q.append((ny, nx))

    alpha = np.where(mask, 0, 255).astype(np.uint8)
    # soften the cut by one pixel so the edge is not jagged
    alpha_im = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8))
    out = Image.fromarray(np.asarray(im).astype(np.uint8)).convert("RGBA")
    out.putalpha(alpha_im)

    bbox = alpha_im.point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        l, t, r, b = bbox
        out = out.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))
    out.save(dst, "PNG", optimize=True)
    kept = int((np.asarray(alpha_im) > 8).sum())
    print(f"wrote {dst}: {out.size[0]}x{out.size[1]}, background colour {tuple(int(v) for v in bg)}, kept {kept * 100 // (h * w)}% of pixels")
    return 0


if __name__ == "__main__":
    sys.exit(main())
