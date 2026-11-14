"""Gate CI: static-site build check for portfolio.

Fails if index.html references a local file that does not exist, if CNAME is
not cultivatedco.ca, or if the desktop side rail would show a visible
scrollbar / stop being sticky / leave the stills gallery outside the
page-layout content column (a recurring regression).
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


def main():
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    html = (root / "index.html").read_text(encoding="utf-8", errors="replace")
    errors = []
    errors.extend(check_local_refs_and_cname(root, html))
    errors.extend(check_side_rail(root, html))
    ok = not errors
    if errors:
        print("Site check failures:")
        print("\n".join(errors))
    print("site check:", "OK" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
