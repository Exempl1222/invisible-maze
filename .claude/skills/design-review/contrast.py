#!/usr/bin/env python3
"""WCAG contrast for the site's colour tokens, read from assets/css/site.css :root.

  python3 .claude/skills/design-review/contrast.py            standard pairs, pass or fail
  python3 .claude/skills/design-review/contrast.py --pair chalk page 4.5   one extra pair (token names or #hex)
  python3 .claude/skills/design-review/contrast.py --uses     every CSS line that uses a legend colour (rule 6)

Run from the repo root. Exit code 1 if a text pair fails (UI pairs known to rely on an outline are marked, not failed).
"""
import pathlib, re, sys

ROOT = pathlib.Path.cwd()
CSS = ROOT / "assets/css/site.css"

def tokens():
    s = CSS.read_text()
    block = re.search(r":root\s*\{(.*?)\n\}", s, re.S).group(1)
    return {m[0]: m[1].lower() for m in re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", block)}

def lum(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def ratio(a, b):
    hi, lo = sorted([lum(a), lum(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)

# (foreground, background, minimum, what it is, outlined): outlined UI parts get a 2px outline, so a low
# fill ratio is noted, not failed.
PAIRS = [
    ("chalk", "page", 4.5, "body text on the page", False),
    ("chalk", "panel", 4.5, "text on cards and dialogs", False),
    ("muted", "page", 4.5, "secondary text on the page", False),
    ("muted", "panel", 4.5, "secondary text on cards", False),
    ("#ffffff", "robot", 4.5, "white text on primary buttons", False),
    ("#ffffff", "robot-deep", 4.5, "white text on pressed primary", False),
    ("panel", "sign", 4.5, "cream text on wooden signs", False),
    ("#ffffff", "sign-deep", 4.5, "white text on the current sign", False),
    ("teleporter-ink", "panel", 4.5, "teleporter text on cream", False),
    ("outline", "page", 3, "focus ring and outlines", False),
    ("robot", "page", 3, "primary button against the page", False),
    ("gold", "panel", 3, "stars and hint fill", True),
    ("grid", "page", 3, "card borders", True),
]

LEGEND = {  # rule 6: colour means something
    "robot": "hat red: gnome, house, primary actions only",
    "robot-deep": "hat red pressed state",
    "beacon": "the house",
    "wall": "player fences (never text)",
    "gold": "hint ribbon, stars",
    "teleporter": "teleporter (glow = magic)",
    "teleporter-ink": "teleporter text",
    "river": "river", "bridge": "bridge", "rock": "rock",
}
RAW = {"#c94a32": "hat red", "#c48a52": "timber", "#e9b949": "gold", "#5ff0d8": "teal pair 1",
       "#c79bff": "violet pair 2", "#ffcf5a": "amber pair 3", "#d8f26a": "lime magic", "#f4ffc4": "lime core"}

def colour(t, name):
    return name if name.startswith("#") else t[name]

def main(argv):
    t = tokens()
    if "--uses" in argv:
        for f in sorted((ROOT / "assets/css").glob("*.css")):
            for n, line in enumerate(f.read_text().splitlines(), 1):
                if line.strip().startswith("--"):
                    continue  # the token definitions themselves
                hits = [k for k in LEGEND if re.search(rf"var\(--{re.escape(k)}\)", line)]
                hits += [v for k, v in RAW.items() if k in line.lower()]
                if hits:
                    print(f"{f.relative_to(ROOT)}:{n}: [{', '.join(hits)}] {line.strip()[:110]}")
        return 0
    pairs = list(PAIRS)
    if "--pair" in argv:
        i = argv.index("--pair")
        fg, bg, mn = argv[i + 1], argv[i + 2], float(argv[i + 3])
        pairs = [(fg, bg, mn, "custom pair", False)]
    failed = False
    for fg, bg, mn, what, outlined in pairs:
        r = ratio(colour(t, fg), colour(t, bg))
        ok = r >= mn
        tag = "ok" if ok else ("low, has outline" if outlined else "FAIL")
        failed |= not ok and not outlined
        print(f"{fg:>15} on {bg:<11} {r:5.2f}:1  need {mn:<3}  {tag:<16} {what}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
