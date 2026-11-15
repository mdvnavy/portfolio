"""Gate CI: static-site build check for portfolio.

Fails if index.html references a local file that does not exist, if CNAME is
not cultivatedco.ca, or if the desktop side rail would show a visible
scrollbar / stop being sticky / leave the stills gallery outside the
page-layout content column (a recurring regression), or if the desktop
content column is capped with a fixed max-width.
"""
import re
import sys
import pathlib
import urllib.parse

# Side rail is a desktop TOC at this breakpoint and above (see index.html).
SIDE_RAIL_MIN_PX = 901


def check_local_refs_and_cname(root, html):
    missing = []
    for ref in set(re.findall(r'(?:src|href)\s*=\s*["\']([^"\'#?]+)', html)):
        if re.match(r'^(?:[a-z]+:|//|data:|mailto:|tel:|javascript:)', ref, re.I) or ref.startswith("{") or "${" in ref:
            continue
        p = root / urllib.parse.unquote(ref.lstrip("/"))
        if not p.exists():
            missing.append(ref)
    cname = (root / "CNAME").read_text().strip() if (root / "CNAME").exists() else ""
    errors = []
    if missing:
        errors.append("Missing local files referenced by index.html:")
        errors.extend(f"  - {m}" for m in sorted(missing))
    if cname != "cultivatedco.ca":
        errors.append(f"CNAME is {cname!r}, expected 'cultivatedco.ca'")
    return errors


def _strip_css_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def _media_applies_at_side_rail(query):
    """True if this @media can apply at a width where the side rail is shown."""
    q = " ".join(query.strip().lower().split())
    if not q:
        return True
    # Bare media types (and comma-separated lists): exclude print-like types only
    # when they are the only applicable types.
    types = re.findall(r"(?:^|[,])\s*(?:only\s+)?(all|screen|print|speech|aural|braille|embossed|tty|tv|projection|handheld)", q)
    if types and all(t not in ("all", "screen") for t in types) and not re.search(r"\b(min|max)-width\b|\bwidth\s*[:=<>]", q):
        return False
    if re.search(r"\bnot\s+all\b|\bnot\s+screen\b", q) and "min-width" not in q and "max-width" not in q:
        return False
    max_widths = [float(x) for x in re.findall(r"max-width\s*:\s*([0-9.]+)px", q)]
    min_widths = [float(x) for x in re.findall(r"min-width\s*:\s*([0-9.]+)px", q)]
    # Modern range syntax: width <= 900px / width < 901px
    max_widths += [float(x) for x in re.findall(r"width\s*<=\s*([0-9.]+)px", q)]
    max_widths += [float(x) - 0.001 for x in re.findall(r"width\s*<\s*([0-9.]+)px", q)]
    min_widths += [float(x) for x in re.findall(r"width\s*>=\s*([0-9.]+)px", q)]
    min_widths += [float(x) + 0.001 for x in re.findall(r"width\s*>\s*([0-9.]+)px", q)]
    lo = max(min_widths) if min_widths else 0.0
    hi = min(max_widths) if max_widths else 1e12
    return lo <= hi and hi >= SIDE_RAIL_MIN_PX


def _read_balanced_block(css, open_idx):
    """open_idx points at '{'. Returns (inner, index_after_closing_brace)."""
    assert css[open_idx] == "{"
    depth = 0
    i = open_idx
    n = len(css)
    while i < n:
        c = css[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return css[open_idx + 1:i], i + 1
        elif c in ('"', "'"):
            i += 1
            while i < n and css[i] != c:
                if css[i] == "\\":
                    i += 1
                i += 1
        i += 1
    return css[open_idx + 1:], n


def iter_style_rules(css, media=""):
    """Yield (media, selector, declarations_text) for style rules in css."""
    css = _strip_css_comments(css)
    i = 0
    n = len(css)
    while i < n:
        while i < n and css[i].isspace():
            i += 1
        if i >= n:
            break
        if css.startswith("@", i):
            m = re.match(r"@([a-zA-Z-]+)", css[i:])
            if not m:
                i += 1
                continue
            at = m.group(1).lower()
            j = i + m.end()
            # prelude until { or ;
            while j < n and css[j] not in "{;":
                if css[j] in ('"', "'"):
                    q = css[j]
                    j += 1
                    while j < n and css[j] != q:
                        if css[j] == "\\":
                            j += 1
                        j += 1
                j += 1
            prelude = css[i + m.end():j].strip()
            if j < n and css[j] == ";":
                i = j + 1
                continue
            if j >= n or css[j] != "{":
                break
            block, i = _read_balanced_block(css, j)
            if at == "media":
                combined = f"{media} and {prelude}" if media else prelude
                yield from iter_style_rules(block, combined)
            elif at == "supports":
                yield from iter_style_rules(block, media)
            # skip @keyframes, @font-face, @layer blocks, etc.
            continue
        # style rule: selector { decls }
        j = i
        while j < n and css[j] != "{":
            if css[j] in ('"', "'"):
                q = css[j]
                j += 1
                while j < n and css[j] != q:
                    if css[j] == "\\":
                        j += 1
                    j += 1
            elif css[j] == "}":
                # stray close
                break
            j += 1
        if j >= n or css[j] != "{":
            break
        selector = css[i:j].strip()
        decls, i = _read_balanced_block(css, j)
        if selector:
            yield media, selector, decls


def _parse_decls(decls):
    props = {}
    for part in decls.split(";"):
        if ":" not in part:
            continue
        name, val = part.split(":", 1)
        name, val = name.strip().lower(), val.strip()
        if name:
            # last declaration of a property wins within the rule
            props[name] = val
    return props


def _selector_parts(selector):
    return [p.strip() for p in selector.split(",") if p.strip()]


def _is_rail_element_selector(part):
    """True if this compound selector targets .rail itself (not .rail-links)."""
    # Strip trailing pseudo-elements/classes for the "is this the rail?" test,
    # but keep them for webkit-scrollbar matching elsewhere.
    core = re.sub(r"::[-a-zA-Z]+.*$", "", part).strip()
    # The right-most element in the compound must include class rail, not rail-*
    # Take the last combinator-separated chunk.
    chunk = re.split(r"[\s>+~]", core)[-1]
    return bool(re.search(r"(^|[^a-zA-Z0-9_-])\.rail($|[^a-zA-Z0-9_-])", chunk))


def _is_rail_webkit_scrollbar(part):
    if not re.search(r"::(?:-webkit-)?scrollbar(?![a-zA-Z-])", part):
        return False
    core = re.sub(r"::[-a-zA-Z]+.*$", "", part).strip()
    chunk = re.split(r"[\s>+~]", core)[-1] if core else ""
    return bool(re.search(r"(^|[^a-zA-Z0-9_-])\.rail($|[^a-zA-Z0-9_-])", chunk))


def collect_document_css(root, html):
    """Return CSS in cascade order: in-document <style>, then local stylesheets."""
    chunks = []
    for m in re.finditer(r"<style\b[^>]*>(.*?)</style>", html, flags=re.I | re.S):
        chunks.append(m.group(1))
    for m in re.finditer(
        r"""<link\b[^>]*rel\s*=\s*['"]stylesheet['"][^>]*>""",
        html,
        flags=re.I,
    ):
        tag = m.group(0)
        href_m = re.search(r"""href\s*=\s*['"]([^'"]+)['"]""", tag, flags=re.I)
        if not href_m:
            continue
        href = href_m.group(1)
        if re.match(r"^(?:[a-z]+:|//)", href, re.I):
            continue
        path = root / urllib.parse.unquote(href.split("?")[0].lstrip("/"))
        if path.exists():
            chunks.append(path.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(chunks)



def _is_class_element_selector(part, class_name):
    """True if this compound selector's subject is .class_name itself."""
    core = re.sub(r"::[-a-zA-Z]+.*$", "", part).strip()
    chunk = re.split(r"[\s>+~]", core)[-1]
    return bool(re.search(rf"(^|[^a-zA-Z0-9_-])\.{re.escape(class_name)}($|[^a-zA-Z0-9_-])", chunk))


def _is_capped_max_width(value):
    if not value:
        return False
    v = value.split("!")[0].strip().lower()
    if v in ("none", "unset", "initial", "inherit", "auto", "100%", "100vw", "100dvw"):
        return False
    return bool(re.search(r"[0-9.]+\s*(px|rem|em|ch)", v))


def check_fluid_width(root, html):
    """Desktop .wrap / .page-content / .page-layout must not use a fixed max-width cap."""
    errors = []
    css = collect_document_css(root, html)
    winning = {"wrap": None, "page-content": None, "page-layout": None}
    for media, selector, decls in iter_style_rules(css):
        if not _media_applies_at_side_rail(media):
            continue
        props = _parse_decls(decls)
        if "max-width" not in props:
            continue
        for part in _selector_parts(selector):
            for name in winning:
                if _is_class_element_selector(part, name):
                    winning[name] = props["max-width"]
    if _is_capped_max_width(winning["wrap"]):
        errors.append(
            f"Desktop .wrap max-width is {winning['wrap']!r}; expected none "
            "(or no fixed px/rem cap) so the layout can use the full viewport."
        )
    for name in ("page-content", "page-layout"):
        if _is_capped_max_width(winning[name]):
            errors.append(
                f"Desktop .{name} max-width is {winning[name]!r}; expected no "
                "fixed cap so the content column can fill the space beside the rail."
            )
    return errors


def check_side_rail(root, html):
    errors = []

    # Layout: stills/hero (.cc-top) must live inside .page-layout so the rail
    # can stay sticky beside a bounded content column for the whole page.
    if not re.search(
        r'<div class="page-layout">[\s\S]*class="cc-top"[\s\S]*</div>',
        html,
    ):
        errors.append(
            "Side rail layout: .cc-top (hero / stills gallery) is not inside "
            ".page-layout; the rail cannot stay a full-page TOC without "
            "overlapping the gallery."
        )

    css = collect_document_css(root, html)
    position = None
    overflow_y = None
    scrollbar_width = None
    webkit_scrollbar_display = None

    for media, selector, decls in iter_style_rules(css):
        if not _media_applies_at_side_rail(media):
            continue
        props = _parse_decls(decls)
        for part in _selector_parts(selector):
            if _is_rail_webkit_scrollbar(part):
                if "display" in props:
                    webkit_scrollbar_display = props["display"]
            if _is_rail_element_selector(part):
                if "position" in props:
                    position = props["position"]
                if "overflow-y" in props:
                    overflow_y = props["overflow-y"]
                elif "overflow" in props:
                    overflow_y = props["overflow"]
                if "scrollbar-width" in props:
                    scrollbar_width = props["scrollbar-width"]

    if position != "sticky":
        errors.append(
            f"Desktop .rail position is {position!r}, expected 'sticky' so the "
            "rail stays visible as a table of contents for the whole page."
        )

    overflow_y_norm = (overflow_y or "visible").split()[0]
    if overflow_y_norm not in ("auto", "scroll"):
        errors.append(
            f"Desktop .rail overflow-y is {overflow_y!r}; expected auto (or "
            "scroll) so overflowing TOC content stays scrollable."
        )
    else:
        hidden = (scrollbar_width == "none") and (
            webkit_scrollbar_display == "none"
        )
        if not hidden:
            errors.append(
                "Desktop .rail would show a visible scrollbar: overflow-y is "
                f"{overflow_y_norm} but scrollbar-width is {scrollbar_width!r} "
                f"and .rail::-webkit-scrollbar display is {webkit_scrollbar_display!r}. "
                "Require scrollbar-width:none and .rail::-webkit-scrollbar{display:none}."
            )
    return errors



def check_audit_live(root, html):
    """Checks for the Nov 2026 live audit items: SEO files, no inlined fonts,
    rates in the contact block, and Bespoke leading the case-studies TOC."""
    errors = []
    required = [
        "favicon.ico",
        "favicon.svg",
        "apple-touch-icon.png",
        "robots.txt",
        "sitemap.xml",
        "assets/og-image.png",
        "assets/business-card/front-v17-thumb.jpg",
        "fonts/archivo-normal-400_900.woff2",
        "fonts/cormorantgaramond-normal-500.woff2",
        "fonts/cormorantgaramond-italic-400.woff2",
    ]
    missing = [rel for rel in required if not (root / rel).exists()]
    if missing:
        errors.append("Missing required site files:")
        errors.extend(f"  - {m}" for m in missing)

    robots = (root / "robots.txt").read_text(encoding="utf-8", errors="replace") if (root / "robots.txt").exists() else ""
    if "Sitemap: https://cultivatedco.ca/sitemap.xml" not in robots:
        errors.append("robots.txt must allow crawling and point at https://cultivatedco.ca/sitemap.xml")
    sitemap = (root / "sitemap.xml").read_text(encoding="utf-8", errors="replace") if (root / "sitemap.xml").exists() else ""
    if "https://cultivatedco.ca/" not in sitemap:
        errors.append("sitemap.xml must include https://cultivatedco.ca/")

    if "data:font" in html or "data:application/font" in html:
        errors.append("index.html still inlines font files as data: URLs; serve fonts/*.woff2 instead.")
    if 'rel="canonical"' not in html or "https://cultivatedco.ca/" not in html:
        errors.append("index.html is missing a canonical link to https://cultivatedco.ca/")
    if 'name="description"' not in html:
        errors.append("index.html is missing a meta description")
    if 'property="og:image"' not in html or "assets/og-image.png" not in html:
        errors.append("index.html is missing an Open Graph image tag")
    if "intro-pending" in html:
        errors.append("index.html still gates first paint with intro-pending")

    contact = ""
    m = re.search(r'<section[^>]*id="contact"[^>]*>[\s\S]*?</section>', html)
    if not m:
        errors.append("Contact section #contact is missing")
    else:
        contact = m.group(0)
        for needle in ("Consultation $75", "Project $155", "Advanced technical $215", "CAD/hr", "navy@bashsystems.net"):
            if needle not in contact:
                errors.append(f"Contact section is missing {needle!r}")

    # Bespoke must precede DIA in the Case Studies TOC (the #work subtree).
    toc = re.search(
        r'<a class="dir" href="#work">[\s\S]*?</a><ul>([\s\S]*?)</ul>\s*</li>',
        html,
    )
    if not toc:
        errors.append("Could not find the Case Studies & Builds TOC subtree")
    else:
        hrefs = re.findall(r'href="#([^"]+)"', toc.group(1))
        # ignore the GitHub icon link which is an absolute URL, not a hash
        if "bespoke-case" not in hrefs or "dia" not in hrefs:
            errors.append(f"Case Studies TOC should list #bespoke-case and #dia, got {hrefs}")
        elif hrefs.index("bespoke-case") > hrefs.index("dia"):
            errors.append("Case Studies TOC must list Bespoke before DIA")

    # Long-form case studies in #work: first project article should be Bespoke.
    work = re.search(r'<section id="work"[^>]*>([\s\S]*?)</section>', html)
    if not work:
        errors.append("Missing #work section")
    else:
        ids = re.findall(r'<article\b[^>]*id="([^"]+)"', work.group(1))
        if not ids or ids[0] != "bespoke-case":
            errors.append(f"First long-form case study in #work should be #bespoke-case, got {ids[:3]}")

    return errors


def main():
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    html = (root / "index.html").read_text(encoding="utf-8", errors="replace")
    errors = []
    errors.extend(check_local_refs_and_cname(root, html))
    errors.extend(check_side_rail(root, html))
    errors.extend(check_fluid_width(root, html))
    errors.extend(check_audit_live(root, html))
    ok = not errors
    if errors:
        print("Site check failures:")
        print("\n".join(errors))
    print("site check:", "OK" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
