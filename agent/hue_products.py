"""What a Hue light is: its product's name and its form (a light bar, a slim floor lamp, a lightstrip behind a TV,
a bulb), from what the bridge says about it. The app turns the form into a kind of light (web/js/kinds.js, suggest),
so a new Hue light lands in the app as what it is without anyone picking it.

The bridge gives three things to go on, tried in this order:
  * the archetype the light was given in the Hue app ("Light type"), when it differs from its product's own: a bulb
    in a floor lamp, set to "floor shade" there, is a floor lamp here too
  * its model id, looked up in hue_products.json (built by scripts/hue_products.py from the full list of Hue models)
  * its product's own archetype, for a model newer than the catalogue
"""
import json
from pathlib import Path
from typing import Dict, Optional

_CATALOGUE: Optional[Dict[str, list]] = None


def catalogue() -> Dict[str, list]:
    global _CATALOGUE
    if _CATALOGUE is None:
        try:
            _CATALOGUE = json.loads((Path(__file__).resolve().parent / "hue_products.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _CATALOGUE = {}
    return _CATALOGUE


# The bridge's archetypes (CLIP v2) and the form each one is
ARCHETYPE_FORM = {
    "hue_play": "play-bar", "hue_signe": "signe-floor", "hue_tube": "tube", "hue_lightstrip_tv": "strip-tv",
    "hue_lightstrip_pc": "strip-pc", "hue_lightstrip": "strip", "hue_omniglow": "strip", "hue_neon": "strip-outdoor",
    "hue_play_wallwasher": "wallwasher", "wall_washer": "wallwasher", "hue_go": "go", "hue_iris": "iris",
    "hue_bloom": "bloom", "hue_centris": "spots", "single_spot": "spots", "double_spot": "spots", "pendant_spot": "spots",
    "string_light": "string", "string_globe": "string-outdoor", "string_permanent": "string-outdoor",
    "christmas_tree": "string", "pendant_round": "pendant", "pendant_long": "pendant", "ceiling_round": "ceiling",
    "ceiling_square": "ceiling", "ceiling_horizontal": "ceiling", "ceiling_tube": "ceiling", "recessed_ceiling": "downlight",
    "floor_shade": "floor", "floor_lantern": "floor", "table_shade": "table", "table_wash": "table",
    "wall_shade": "sconce", "up_and_down": "sconce", "up_and_down_up": "sconce", "up_and_down_down": "sconce",
    "wall_lantern": "porch", "wall_spot": "porch", "flexible_lamp": "task", "ground_spot": "landscape",
    "bollard": "path", "recessed_floor": "step", "hue_floodlight_camera": "flood", "twilight": "bedside",
    "twilight_front": "bedside", "twilight_back": "bedside", "classic_bulb": "bulb", "sultan_bulb": "bulb",
    "vintage_bulb": "bulb", "edison_bulb": "bulb", "ellipse_bulb": "bulb", "triangle_bulb": "bulb",
    "small_globe_bulb": "bulb", "large_globe_bulb": "bulb", "candle_bulb": "candle", "vintage_candle_bulb": "candle",
    "luster_bulb": "candle", "flood_bulb": "flood-bulb", "spot_bulb": "spot-bulb",
}
# The forms that stand up: a gradient one's colours run from its foot to its top
UPRIGHT = {"signe-floor", "signe-table", "play-floor", "play-table"}


def product_of(model_id: Optional[str], product_name: Optional[str] = None, product_archetype: Optional[str] = None,
               archetype: Optional[str] = None) -> dict:
    """{name, form, model} for one light; form is None when nothing says what it is."""
    known = catalogue().get(str(model_id or ""))
    form = None
    if archetype and archetype != product_archetype and archetype in ARCHETYPE_FORM:
        form = ARCHETYPE_FORM[archetype]  # changed in the Hue app: the person said what it is
    elif known:
        form = known[1]
    elif product_archetype in ARCHETYPE_FORM:
        form = ARCHETYPE_FORM[product_archetype]
        if form == "signe-floor" and "table" in str(product_name or "").lower():
            form = "signe-table"
    name = (known[0] if known else None) or (str(product_name).strip() if product_name else None) or "Hue light"
    return {"name": name[:80], "form": form, "model": str(model_id)[:40] if model_id else None}


__all__ = ["product_of", "catalogue", "UPRIGHT", "ARCHETYPE_FORM"]
