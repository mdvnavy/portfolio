"""Gate CI: static-site build check for portfolio. Fails if index.html references a
local file that does not exist, or if CNAME is not cultivatedco.ca."""
import re, sys, pathlib, urllib.parse
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
html = (root / "index.html").read_text(encoding="utf-8", errors="replace")
missing = []
for ref in set(re.findall(r'(?:src|href)\s*=\s*["\']([^"\'#?]+)', html)):
    if re.match(r'^(?:[a-z]+:|//|data:|mailto:|tel:|javascript:)', ref, re.I) or ref.startswith("{") or "${" in ref:
        continue
    p = root / urllib.parse.unquote(ref.lstrip("/"))
    if not p.exists():
        missing.append(ref)
cname = (root / "CNAME").read_text().strip() if (root / "CNAME").exists() else ""
ok = True
if missing:
    ok = False; print("Missing local files referenced by index.html:"); [print("  -", m) for m in sorted(missing)]
if cname != "cultivatedco.ca":
    ok = False; print(f"CNAME is {cname!r}, expected 'cultivatedco.ca'")
print("site check:", "OK" if ok else "FAILED")
sys.exit(0 if ok else 1)
