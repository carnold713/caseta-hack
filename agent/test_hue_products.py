"""What a Hue light is (hue_products.py): the catalogue, the archetype a person set in the Hue app, and the bridge's
own archetype for a model the catalogue does not have. Run: python agent/test_hue_products.py"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hue_products import ARCHETYPE_FORM, catalogue, product_of  # noqa: E402

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ("" if ok else f" (wanted {want!r})"))
    if not ok:
        FAILS.append(name)


cat = catalogue()
check("the catalogue holds every Hue model", len(cat) > 900, True)
check("every entry is a name and a form", all(isinstance(n, str) and n and isinstance(f, str) for n, f in cat.values()), True)
forms = {f for _n, f in cat.values()} | set(ARCHETYPE_FORM.values())
# the forms the app turns into kinds: the keys of FORMS in web/js/kinds.js
kinds_js = (Path(__file__).resolve().parent.parent / "web" / "js" / "kinds.js").read_text(encoding="utf-8")
block = kinds_js[kinds_js.index("const FORMS = {"):]
block = block[:block.index("\n  };")]
known = set(re.findall(r"(?:'([a-z-]+)'|\b([a-z]+)):\s*(?:r|\(\))", block))
known = {a or b for a, b in known}
check("every form is one the app knows (web/js/kinds.js FORMS)", sorted(forms - known), [])

check("a Play light bar", product_of("LCT024", "Hue play", "hue_play"), {"name": "Hue Play light bar", "form": "play-bar", "model": "LCT024"})
check("a gradient Signe floor lamp", product_of("915005987601")["form"], "signe-floor")
check("a gradient Signe table lamp", product_of("915005986901")["form"], "signe-table")
check("a Play gradient lightstrip for a TV", product_of("LCX002")["form"], "strip-tv")
check("one for a PC", product_of("LCX005")["form"], "strip-pc")
check("a gradient light tube", product_of("915005988101")["form"], "tube")
check("a plain lightstrip", product_of("LCL001")["form"], "strip")
check("a colour bulb", product_of("LCT015")["form"], "bulb")
check("a BR30 is a can light's bulb", product_of("LCT011")["form"], "flood-bulb")
check("a GU10 is a spot's", product_of("LCG002")["form"], "spot-bulb")
check("an Iris", product_of("LLC010")["form"], "iris")
check("a bulb set to 'floor shade' in the Hue app is a floor lamp",
      product_of("LCT015", "Hue color lamp", "sultan_bulb", "floor_shade")["form"], "floor")
check("the archetype it came with changes nothing", product_of("LCT024", None, "hue_play", "hue_play")["form"], "play-bar")
check("a model newer than the catalogue goes by its archetype", product_of("NEW123", "Hue Signe table", "hue_signe"),
      {"name": "Hue Signe table", "form": "signe-table", "model": "NEW123"})
check("and one with nothing to go on is just a Hue light", product_of(None), {"name": "Hue light", "form": None, "model": None})

print("ALL OK" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
