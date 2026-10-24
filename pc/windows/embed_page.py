"""Turns pc/settings.html into a C header (the Windows app serves it from memory):
    python pc/windows/embed_page.py pc/settings.html pc/windows/page.h"""
import sys
from pathlib import Path

data = Path(sys.argv[1]).read_bytes()
rows = ",\n".join(", ".join(str(b) for b in data[i:i + 24]) for i in range(0, len(data), 24))
Path(sys.argv[2]).write_text(
    "// made by embed_page.py from pc/settings.html; not edited by hand\n#pragma once\n"
    f"static const unsigned char SETTINGS_HTML[] = {{\n{rows}\n}};\n"
    f"static const unsigned SETTINGS_HTML_LEN = {len(data)};\n", encoding="utf-8")
