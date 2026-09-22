"""Colour maths for the app's lights, with no dependencies.

The Hue bridge speaks CIE 1931 xy for colour and mirek (1e6 / kelvin) for white temperature. Nanoleaf
speaks hue (0-360) and saturation (0-100) for colour and kelvin directly for white temperature. The
app speaks hex and kelvin throughout, and the two connectors convert at the boundary into one shared
shape (xy for colour, mirek for white); hsv_to_rgb and rgb_to_hsv are what Nanoleaf's hue/sat crosses
through on the way to and from that shape (hue.py and nanoleaf.py both go through xy from there).
This module converts between them the way Philips documents it: sRGB gamma, the Wide RGB D65 matrix,
and a clamp to the light's gamut triangle (a colour a lamp cannot make becomes the nearest one it
can). kelvin_to_hex paints a white tone for the app's discs; it is an approximation of a black body,
good enough for a swatch and never sent to a bridge or a Nanoleaf controller.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple

XY = Tuple[float, float]
Gamut = Dict[str, Sequence[float]]

# Gamut C, the one every current Hue colour lamp has; used when a light does not state its own.
GAMUT_C: Gamut = {"red": (0.6915, 0.3083), "green": (0.17, 0.7), "blue": (0.1532, 0.0475)}


# ----- hex -----
def hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    h = str(hex_str).strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError(f"not a colour: {hex_str!r}")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(r: float, g: float, b: float) -> str:
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(c)))) for c in (r, g, b))


# ----- gamut geometry -----
def _cross(p1: XY, p2: XY) -> float:
    return p1[0] * p2[1] - p1[1] * p2[0]


def _gamut_points(gamut: Optional[Gamut]) -> Tuple[XY, XY, XY]:
    g = gamut or GAMUT_C
    return (tuple(g["red"]), tuple(g["green"]), tuple(g["blue"]))  # type: ignore[return-value]


def in_gamut(xy: XY, gamut: Optional[Gamut] = None) -> bool:
    red, green, blue = _gamut_points(gamut)
    v1 = (green[0] - red[0], green[1] - red[1])
    v2 = (blue[0] - red[0], blue[1] - red[1])
    q = (xy[0] - red[0], xy[1] - red[1])
    denom = _cross(v1, v2)
    if abs(denom) < 1e-12:
        return False
    s = _cross(q, v2) / denom
    t = _cross(v1, q) / denom
    eps = 1e-4  # a point rounded to four decimals can sit a hair outside its own edge
    return s >= -eps and t >= -eps and s + t <= 1 + eps


def _closest_on_segment(a: XY, b: XY, p: XY) -> XY:
    ap = (p[0] - a[0], p[1] - a[1])
    ab = (b[0] - a[0], b[1] - a[1])
    ab2 = ab[0] ** 2 + ab[1] ** 2
    t = 0.0 if ab2 == 0 else max(0.0, min(1.0, (ap[0] * ab[0] + ap[1] * ab[1]) / ab2))
    return (a[0] + ab[0] * t, a[1] + ab[1] * t)


def clamp_to_gamut(xy: XY, gamut: Optional[Gamut] = None) -> XY:
    """The point itself when the lamp can make it, else the nearest point on the triangle's edge."""
    if in_gamut(xy, gamut):
        return (float(xy[0]), float(xy[1]))
    red, green, blue = _gamut_points(gamut)
    best: Optional[XY] = None
    best_d = float("inf")
    for a, b in ((red, green), (green, blue), (blue, red)):
        c = _closest_on_segment(a, b, xy)
        d = (c[0] - xy[0]) ** 2 + (c[1] - xy[1]) ** 2
        if d < best_d:
            best, best_d = c, d
    return best  # type: ignore[return-value]


# ----- sRGB <-> xy (Philips' documented conversion) -----
def _gamma_in(c: float) -> float:
    return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92


def _gamma_out(c: float) -> float:
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rgb_to_xy(r: float, g: float, b: float, gamut: Optional[Gamut] = None) -> XY:
    """r, g, b in 0..255 -> xy inside the gamut."""
    rl, gl, bl = (_gamma_in(max(0.0, min(1.0, c / 255.0))) for c in (r, g, b))
    x = rl * 0.664511 + gl * 0.154324 + bl * 0.162028
    y = rl * 0.283881 + gl * 0.668433 + bl * 0.047685
    z = rl * 0.000088 + gl * 0.072310 + bl * 0.986039
    total = x + y + z
    if total <= 0:
        # black has no chromaticity; the lamp's white is the honest answer
        return rgb_to_xy(255, 255, 255, gamut)
    cx, cy = clamp_to_gamut((x / total, y / total), gamut)
    return (round(cx, 4), round(cy, 4))


def hex_to_xy(hex_str: str, gamut: Optional[Gamut] = None) -> XY:
    return rgb_to_xy(*hex_to_rgb(hex_str), gamut=gamut)


def xy_to_rgb(x: float, y: float, bri: float = 1.0, gamut: Optional[Gamut] = None) -> Tuple[int, int, int]:
    """xy (clamped to the gamut) at brightness 0..1 -> r, g, b in 0..255, scaled so the brightest channel is full."""
    x, y = clamp_to_gamut((float(x), float(y)), gamut)
    if y <= 0:
        return (0, 0, 0)
    z = 1.0 - x - y
    Y = max(0.0, min(1.0, float(bri)))
    X = (Y / y) * x
    Z = (Y / y) * z
    r = X * 1.656492 - Y * 0.354851 - Z * 0.255038
    g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152
    b = X * 0.051713 - Y * 0.121364 + Z * 1.011530
    r, g, b = (max(0.0, c) for c in (r, g, b))
    top = max(r, g, b)
    if top > 1.0:
        r, g, b = r / top, g / top, b / top
    r, g, b = (_gamma_out(c) for c in (r, g, b))
    top = max(r, g, b)
    if Y >= 1.0 and top > 0:
        # the app paints chromaticity, not luminance: a colour at full brightness has one channel at 255
        r, g, b = r / top, g / top, b / top
    return tuple(int(round(max(0.0, min(1.0, c)) * 255)) for c in (r, g, b))  # type: ignore[return-value]


def xy_to_hex(x: float, y: float, bri: float = 1.0, gamut: Optional[Gamut] = None) -> str:
    return rgb_to_hex(*xy_to_rgb(x, y, bri, gamut))


# ----- HSV <-> RGB (Nanoleaf speaks hue 0-360 and saturation 0-100 natively, not xy) -----
def hsv_to_rgb(h: float, s: float, v: float = 100.0) -> Tuple[int, int, int]:
    """h in 0..360, s and v in 0..100 -> r, g, b in 0..255."""
    hh = float(h) % 360.0
    ss = max(0.0, min(100.0, float(s))) / 100.0
    vv = max(0.0, min(100.0, float(v))) / 100.0
    c = vv * ss
    x = c * (1 - abs((hh / 60.0) % 2 - 1))
    m = vv - c
    if hh < 60:
        r, g, b = c, x, 0.0
    elif hh < 120:
        r, g, b = x, c, 0.0
    elif hh < 180:
        r, g, b = 0.0, c, x
    elif hh < 240:
        r, g, b = 0.0, x, c
    elif hh < 300:
        r, g, b = x, 0.0, c
    else:
        r, g, b = c, 0.0, x
    return tuple(int(round((ch + m) * 255)) for ch in (r, g, b))  # type: ignore[return-value]


def rgb_to_hsv(r: float, g: float, b: float) -> Tuple[float, float, float]:
    """r, g, b in 0..255 -> h in 0..360, s and v in 0..100."""
    rr, gg, bb = r / 255.0, g / 255.0, b / 255.0
    mx, mn = max(rr, gg, bb), min(rr, gg, bb)
    d = mx - mn
    if d == 0:
        hh = 0.0
    elif mx == rr:
        hh = 60.0 * (((gg - bb) / d) % 6)
    elif mx == gg:
        hh = 60.0 * (((bb - rr) / d) + 2)
    else:
        hh = 60.0 * (((rr - gg) / d) + 4)
    ss = 0.0 if mx == 0 else d / mx
    return (round(hh % 360.0, 1), round(ss * 100, 1), round(mx * 100, 1))


# ----- white temperature -----
def kelvin_to_mirek(kelvin: float) -> int:
    return int(round(1_000_000 / max(1.0, float(kelvin))))


def mirek_to_kelvin(mirek: float) -> int:
    return int(round(1_000_000 / max(1.0, float(mirek))))


def kelvin_to_rgb(kelvin: float) -> Tuple[int, int, int]:
    """A rough black-body tint for painting a white tone (Tanner Helland's fit), 1000..40000 K."""
    t = max(1000.0, min(40000.0, float(kelvin))) / 100.0
    if t <= 66:
        r = 255.0
        g = 99.4708025861 * math.log(t) - 161.1195681661
        b = 0.0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307
    else:
        r = 329.698727446 * ((t - 60) ** -0.1332047592)
        g = 288.1221695283 * ((t - 60) ** -0.0755148492)
        b = 255.0
    return tuple(int(round(max(0.0, min(255.0, c)))) for c in (r, g, b))  # type: ignore[return-value]


def kelvin_to_hex(kelvin: float) -> str:
    return rgb_to_hex(*kelvin_to_rgb(kelvin))


def gamut_from_hue(color: Optional[dict]) -> Optional[Gamut]:
    """The gamut in a Hue light resource ({"red": {"x", "y"}, ...}) as {"red": [x, y], ...}, or None."""
    g = (color or {}).get("gamut") or {}
    try:
        out: Gamut = {k: [float(g[k]["x"]), float(g[k]["y"])] for k in ("red", "green", "blue")}
    except (KeyError, TypeError, ValueError):
        return None
    return out


def xy_from_hue(color: Optional[dict]) -> Optional[List[float]]:
    xy = (color or {}).get("xy") or {}
    try:
        return [float(xy["x"]), float(xy["y"])]
    except (KeyError, TypeError, ValueError):
        return None


# What a lamp is showing, from the dict any backend keeps for it. It reads the shape and nothing else,
# so it answers for a Hue bulb, a Nanoleaf panel or anything later that keeps `ct` and `color` the same
# way, and both the app and the connector's own memory of "how was this light" go through it.
def color_state(d: dict) -> Optional[dict]:
    """What the app shows for a lamp: {"mode", "kelvin", "xy", "hex"}, or None for a lamp with neither."""
    ct, color = d.get("ct"), d.get("color")
    if not ct and not color:
        return None
    mode = d.get("color_mode")
    kelvin = mirek_to_kelvin(ct["mirek"]) if ct and ct.get("mirek") else None
    xy = list(color["xy"]) if color and color.get("xy") else None
    if mode == "xy" and xy:
        hex_str: Optional[str] = xy_to_hex(xy[0], xy[1], 1.0, color.get("gamut") or GAMUT_C)
    elif kelvin:
        hex_str = kelvin_to_hex(kelvin)
    elif xy:
        hex_str = xy_to_hex(xy[0], xy[1], 1.0, color.get("gamut") or GAMUT_C)
    else:
        hex_str = None
    return {"mode": mode, "kelvin": kelvin, "xy": xy, "hex": hex_str}
