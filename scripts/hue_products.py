"""Builds agent/hue_products.json, the connector's catalogue of Philips Hue lights: for every model id a Hue bridge
can report (its product_data.model_id, the light's own Zigbee model), the product's name and its form, which is what
the app turns into a kind of light (web/js/kinds.js, suggest).

The models and their names come from zigbee2mqtt's Philips list, the most complete public record of what each Hue
light calls itself; the form is read from the name by the rules below, first match wins. Run it again when Hue brings
out something new:

    python3 scripts/hue_products.py                    # fetches the list from GitHub
    python3 scripts/hue_products.py path/to/philips.ts # or reads one already fetched

A light that is not in the catalogue still gets a form from the archetype the bridge gives it (agent/hue_products.py).
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/Koenkk/zigbee-herdsman-converters/master/src/devices/philips.ts"
OUT = Path(__file__).resolve().parent.parent / "agent" / "hue_products.json"

# (pattern on the description, form). Forms are the shapes the app knows (agent/hue_products.py FORMS).
RULES = [
    (r"play\b.*light ?bar|play lightbar", "play-bar"),
    (r"play.*floor lamp", "play-floor"),
    (r"play.*table lamp", "play-table"),
    (r"play wall ?washer", "wallwasher"),
    (r"signe.*table", "signe-table"),
    (r"signe", "signe-floor"),
    (r"perifo.*tube|perifo.*light bar|perifo linear", "track"),
    (r"light ?tube", "tube"),
    (r"play gradient lightstrip for pc|lightstrip for pc", "strip-pc"),
    (r"play gradient lightstrip", "strip-tv"),
    (r"festavia.*outdoor|permanent outdoor string|outdoor string", "string-outdoor"),
    (r"festavia|light string|string lights?", "string"),
    (r"outdoor.*(light ?strip|strip ?light)|(light ?strip|strip ?light).*outdoor|lily.*strip|neon outdoor", "strip-outdoor"),
    (r"light ?strip|strip ?light|omniglow", "strip"),
    (r"\bgo\b", "go"),
    (r"\biris\b", "iris"),
    (r"\bbloom\b|livingcolors|\baura\b", "bloom"),
    (r"twilight|wake-?up", "bedside"),
    (r"par ?38", "flood"),  # an outdoor floodlight's bulb
    (r"br30|br40|par ?20|par ?16", "flood-bulb"),  # a can light's bulb, before the floodlights below
    (r"camera floodlight|flood ?light|discover|welcome", "flood"),
    (r"lily", "landscape"),
    (r"calla|pedestal|post light|bollard|fuzo outdoor floor|lucca pedestal", "path"),
    (r"outdoor|appear|econic|impress|resonate|nyro|inara|tuar|turaco|daylo|amarant|dymera|fuzo", "porch"),
    (r"mirror", "mirror"),
    (r"pendant|suspension|hanging|ensis|semeru|\bliane\b.*pendant", "pendant"),
    (r"perifo.*wall", "wall-track"),
    (r"wall (light|lamp)|\bsana\b|\bliane\b", "sconce"),
    (r"floor (light|lamp)", "floor"),
    (r"table (light|lamp)|wellness|\bwithin\b", "table"),
    (r"downlight|recessed|milliskin|\bakari\b|garnea|aphelion|centura", "downlight"),
    (r"spot|centris|runner|buckram|pillar|argenta|fugato|attract|xamento", "spots"),
    (r"ceiling|panel|\bbeing\b|datura|aurelle|surimu|infuse|flourish|enrave|\bfair\b|\bstill\b|struana|apogee|devote|"
     r"devere|tento|phoenix|muscari|\bcher\b|amaze|beyond|adore", "ceiling"),
    (r"\bflood\b", "flood-bulb"),
    (r"gu10|gu5\.3|mr16", "spot-bulb"),
    (r"candle|luster|\be12\b|^(?!.*e2[67]).*\be14\b", "candle"),
    (r"filament|edison|globe|g25|g40|g93|g125|st19|st64|st72|a19|a21|a60|a67|e26|e27|b22|bulb|lamp|\bwhite\b|ambiance", "bulb"),
]
BULBS = ("bulb", "candle", "flood-bulb", "spot-bulb")
# Names that read better than the list's own
NAMES = {
    "play-bar": "Hue Play light bar",
}


def tidy(desc: str) -> str:
    s = re.sub(r"\b(white|black)?\s*(and|&)\s*colou?r\s*ambi[ae]nce\b|\bwhite\s+ambi[ae]nce\b|\bwhite\s+(and|&)\s+colou?r\b", "", desc, flags=re.I)
    s = re.sub(r"\bwith bluetooth\b|\bbluetooth\b|^philips\s+|\bsignify\b", "", s, flags=re.I)
    s = re.sub(r"\(\s*\)", "", s)
    s = re.sub(r"\s+-\s*|\s*-\s+", " ", s)  # "Datura - Square": a spaced hyphen reads as a dash
    s = re.sub(r"\s+", " ", s).strip(" -,")
    if re.fullmatch(r"hue( and colou?r)?", s, re.I):
        return "Hue bulb"
    if not s.lower().startswith("hue"):
        s = "Hue " + s
    return s[:80]


def form_of(desc: str) -> str:
    d = desc.lower()
    for pat, form in RULES:
        if re.search(pat, d):
            return form
    return "bulb"


def entries(src: str):
    for b in re.split(r"\n    \{\n", src):
        m = re.search(r"zigbeeModel:\s*\[([^\]]*)\]", b)
        d = re.search(r"\n        description:\s*\"([^\"]+)\"", b)
        if not m or not d or "m.light" not in b:
            continue  # a switch, a sensor, a plug
        for zm in re.findall(r"\"([^\"]+)\"", m.group(1)):
            yield zm, d.group(1)
        for w in re.finditer(r"description:\s*\"([^\"]+)\",\s*fingerprint:\s*\[\{modelID:\s*\"([^\"]+)\"", b):
            yield w.group(2), w.group(1)


def main() -> None:
    if len(sys.argv) > 1:
        src = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(SOURCE, timeout=60) as r:  # noqa: S310
            src = r.read().decode("utf-8")
    out = {}
    for zm, desc in entries(src):
        if zm in out:
            continue
        form = form_of(desc)
        name = NAMES.get(form) or tidy(desc)
        if form in BULBS and not re.search(r"bulb|lamp|light", name, re.I):
            name += " bulb"
        out[zm] = [name, form]
    OUT.write_text(json.dumps(dict(sorted(out.items())), indent=0, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {}
    for _n, f in out.values():
        counts[f] = counts.get(f, 0) + 1
    print(f"{len(out)} models -> {OUT}")
    print(", ".join(f"{f} {n}" for f, n in sorted(counts.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    main()
