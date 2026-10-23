"""Builds dist/espaltherma-card.js from src/espaltherma-card.js, with the card's texts translated by the ESPAltherma
web page translations (web/i18n/<lang>.json) so the drawing reads the same in Home Assistant.

    python build.py                       # translations downloaded from the ESPAltherma repository
    python build.py ../ESPAltherma        # translations of a local ESPAltherma checkout
"""
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LANGS = ["fr", "de", "it", "es", "nl"]
I18N_URL = "https://raw.githubusercontent.com/raomin/ESPAltherma/beta/web/i18n/%s.json"


def translations(lang):
    if len(sys.argv) > 1:
        return json.load(open(os.path.join(sys.argv[1], "web", "i18n", lang + ".json"), encoding="utf-8"))
    with urllib.request.urlopen(I18N_URL % lang, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


src = open(os.path.join(HERE, "src", "espaltherma-card.js"), encoding="utf-8").read()
# Texts of the card: data-t attributes, tag labels and tr(hass, "...") calls
texts = set(re.findall(r'data-t="([^"]+)"', src)) | set(re.findall(r'tr\(hass, "([^"]+)"', src))
texts |= {t for t in re.findall(r'\["([^"]+)", "\w+", \d+, \d+, \d+\]', src)}
texts = {t for t in texts if "${" not in t}
# The card's own translations (OWN) cover the texts the web page does not have
own = set(re.findall(r'"([^"]+)": "', re.search(r"const OWN = \{(.*?)\n\};", src, re.S).group(1)))
i18n, missing = {}, {}
for lang in LANGS:
    d = translations(lang)
    i18n[lang] = {t: d[t] for t in sorted(texts) if d.get(t)}
    missing[lang] = sorted(t for t in texts if not d.get(t) and t not in own)
out = src.replace("/*I18N*/{}", json.dumps(i18n, ensure_ascii=False, separators=(",", ":")))
os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
open(os.path.join(HERE, "dist", "espaltherma-card.js"), "w", encoding="utf-8", newline="\n").write(out)
print("%d texts; missing translations: %s" % (len(texts), {k: v for k, v in missing.items() if v}))
