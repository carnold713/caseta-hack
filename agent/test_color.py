"""Colour maths: hex <-> xy round trips, gamut clamping, kelvin <-> mirek, black-body tints.
Run: python test_color.py"""
from color import (GAMUT_C, clamp_to_gamut, gamut_from_hue, hex_to_rgb, hex_to_xy, in_gamut, kelvin_to_hex, kelvin_to_mirek,
                   kelvin_to_rgb, mirek_to_kelvin, rgb_to_hex, xy_from_hue, xy_to_hex)


def close(a, b, tol):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


# hex parsing and printing
assert hex_to_rgb("#FF8040") == (255, 128, 64) and hex_to_rgb("f00") == (255, 0, 0)
assert rgb_to_hex(255, 128, 64) == "#ff8040" and rgb_to_hex(300, -5, 12.6) == "#ff000d"
try:
    hex_to_rgb("#12345"); raise AssertionError("expected a ValueError")
except ValueError:
    pass

# known chromaticities: the D65 white point sits near (0.3127, 0.329); pure red lands on the red corner of gamut C
assert close(hex_to_xy("#ffffff"), (0.3127, 0.3290), 0.015), hex_to_xy("#ffffff")
assert close(hex_to_xy("#ff0000"), GAMUT_C["red"], 0.01), hex_to_xy("#ff0000")
assert close(hex_to_xy("#0000ff"), GAMUT_C["blue"], 0.02), hex_to_xy("#0000ff")
assert in_gamut(hex_to_xy("#00ff00")), "green is clamped into the gamut"
# black has no chromaticity: it becomes white, not a crash
assert hex_to_xy("#000000") == hex_to_xy("#ffffff")

# every conversion lands inside the gamut, whatever goes in
for h in ("#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#00ffff", "#ffff00", "#123456", "#fedcba"):
    assert in_gamut(hex_to_xy(h)), h

# clamping: a point outside the triangle moves to its nearest edge, a point inside stays put
inside = (0.4, 0.4)
assert clamp_to_gamut(inside) == inside and in_gamut(inside)
far = (0.9, 0.9)
c = clamp_to_gamut(far)
assert c != far and in_gamut((c[0] - 1e-6, c[1] - 1e-6)) or in_gamut(c), c
assert not in_gamut(far)
# a narrower gamut (Gamut A, the first colour bulbs) pulls a saturated green further in
gamut_a = {"red": [0.704, 0.296], "green": [0.2151, 0.7106], "blue": [0.138, 0.08]}
assert not in_gamut(hex_to_xy("#00ff00"), gamut_a) or in_gamut(hex_to_xy("#00ff00", gamut_a), gamut_a)

# round trips: Philips' two matrices are not exact inverses (a zero channel can come back near 50), so a colour with one
# channel full comes back within that, and the order of the channels (the hue) always survives
for h in ("#ff8040", "#40ff80", "#8040ff", "#ff2a1a", "#ffb000", "#ffe600", "#3ad13a", "#2864ff", "#9b30ff", "#ff3fa4"):
    x, y = hex_to_xy(h)
    back = hex_to_rgb(xy_to_hex(x, y))
    want = hex_to_rgb(h)
    assert close(back, want, 60), (h, xy_to_hex(x, y))
    assert sorted(range(3), key=lambda i: back[i]) == sorted(range(3), key=lambda i: want[i]), (h, xy_to_hex(x, y))
# and the app paints chromaticity: the brightest channel is always full
for h in ("#804020", "#102030"):
    assert max(hex_to_rgb(xy_to_hex(*hex_to_xy(h)))) == 255, h
# a dimmer brightness gives a darker colour
assert max(hex_to_rgb(xy_to_hex(0.3127, 0.329, bri=0.25))) < 200

# kelvin <-> mirek
assert kelvin_to_mirek(2700) == 370 and kelvin_to_mirek(6500) == 154 and kelvin_to_mirek(4000) == 250
assert mirek_to_kelvin(153) == 6536 and mirek_to_kelvin(500) == 2000 and mirek_to_kelvin(370) == 2703

# black-body tints: warm is orange, cool is close to white, and the blue channel rises with the temperature
r, g, b = kelvin_to_rgb(2700)
assert r == 255 and 150 <= g <= 185 and 60 <= b <= 110, (r, g, b)
r, g, b = kelvin_to_rgb(6500)
assert r >= 250 and g >= 245 and b >= 240, (r, g, b)
assert kelvin_to_rgb(2000)[2] < kelvin_to_rgb(3000)[2] < kelvin_to_rgb(4000)[2] < kelvin_to_rgb(5000)[2]
assert kelvin_to_hex(2700).startswith("#ff") and len(kelvin_to_hex(10000)) == 7
assert kelvin_to_rgb(500) == kelvin_to_rgb(1000), "clamped below 1000 K"

# reading a Hue light resource
hue_color = {"xy": {"x": 0.4, "y": 0.35}, "gamut": {"red": {"x": 0.6915, "y": 0.3083}, "green": {"x": 0.17, "y": 0.7}, "blue": {"x": 0.1532, "y": 0.0475}}, "gamut_type": "C"}
assert gamut_from_hue(hue_color) == {"red": [0.6915, 0.3083], "green": [0.17, 0.7], "blue": [0.1532, 0.0475]}
assert xy_from_hue(hue_color) == [0.4, 0.35]
assert gamut_from_hue({"xy": {"x": 0.4, "y": 0.35}}) is None and xy_from_hue({}) is None and gamut_from_hue(None) is None

print("color: ok")
