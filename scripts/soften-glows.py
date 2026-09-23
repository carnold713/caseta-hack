"""Run: python3 scripts/soften-glows.py web/ui/*.css web/ui/v7/*.css  (idempotent)

Soften every radial glow in the app's CSS: a fade to transparent becomes an eased falloff (full at the centre,
easing out, reaching nothing with no slope), so no glow has an edge or a knee the eye can find.

Only gradients that END transparent are touched (glows); solid shading (beads, knobs, discs) is left alone.
A same-colour midpoint inside a glow (a knee) is dropped; a midpoint in a different colour is kept, and only the
last segment, the one that fades out, is eased."""
import math, re, sys

STEPS = 16
def f(t):  # 1 at the centre, falling off like light, reaching 0 at the edge with no slope (so no edge shows)
    return (0.5 + 0.5 * math.cos(math.pi * t)) ** 1.4

def split_top(s):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur.strip()); cur = ''
        else:
            cur += ch
    out.append(cur.strip())
    return out

def split_color_pos(stop):
    # the colour is the first token (may contain parentheses); positions follow
    depth, i = 0, 0
    for i, ch in enumerate(stop):
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        elif ch == ' ' and depth == 0:
            return stop[:i], stop[i + 1:].strip()
    return stop, ''

def is_color(tok):
    return bool(re.match(r'^(#|rgba?\(|var\(|transparent$|color-mix\()', tok))

def parse_rgba(c):
    m = re.match(r'^rgba?\((.*)\)$', c)
    if not m:
        return None
    parts = split_top(m.group(1))
    if len(parts) == 4:
        return parts[:3], parts[3]
    if len(parts) == 2 and parts[0].startswith('var('):   # rgba(var(--bead), .35)
        return [parts[0]], parts[1]
    if len(parts) == 3:
        return parts, '1'
    return None

def hex_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(x * 2 for x in h)
    return [str(int(h[i:i + 2], 16)) for i in (0, 2, 4)]

def transparent(c):
    if c == 'transparent':
        return True
    p = parse_rgba(c)
    return bool(p) and re.fullmatch(r'0*\.?0*', p[1].strip()) is not None

def rgb_key(c):
    if c.startswith('#'):
        return ','.join(hex_rgb(c))
    p = parse_rgba(c)
    return ','.join(x.strip() for x in p[0]) if p else c

def scaled(c, k):
    """The colour c at k of its own alpha."""
    if k >= 0.9999:
        return c
    if c.startswith('#'):
        return f"rgba({', '.join(hex_rgb(c))}, {k:.3f})"
    p = parse_rgba(c)
    if p:
        rgb, a = p
        a = a.strip()
        try:
            return f"rgba({', '.join(x.strip() for x in rgb)}, {float(a) * k:.3f})"
        except ValueError:
            inner = a[5:-1] if a.startswith('calc(') else a
            return f"rgba({', '.join(x.strip() for x in rgb)}, calc({inner} * {k:.3f}))"
    return f"color-mix(in srgb, {c} {k * 100:.1f}%, transparent)"

def pct(pos, default):
    m = re.match(r'^(-?[\d.]+)%$', pos.strip()) if pos else None
    return float(m.group(1)) if m else default

def soften(args):
    parts = split_top(args)
    head = [] if is_color(split_color_pos(parts[0])[0]) else [parts.pop(0)]
    stops = [split_color_pos(p) for p in parts]
    if len(stops) < 2 or not transparent(stops[-1][0]) or transparent(stops[0][0]):
        return None
    if len(stops) > STEPS // 2:
        return None                            # already eased (this is what makes a second run change nothing)
    if any(not re.fullmatch(r'(-?[\d.]+%)?', p.strip()) for _, p in stops):
        return None                            # positions in px or two-position stops: leave it
    end = pct(stops[-1][1], 100.0)
    # a same-colour midpoint is a knee inside the glow: drop it; a different colour stays, and only the fade eases
    keep = [stops[0]] + [s for s in stops[1:-1] if rgb_key(s[0]) != rgb_key(stops[0][0])]
    last_c, last_p = keep[-1][0], pct(keep[-1][1], 0.0 if len(keep) == 1 else None)
    if last_p is None:
        return None
    out = [f"{c}{(' ' + p) if p else ''}" for c, p in keep[:-1]]
    for i in range(STEPS + 1):
        t = i / STEPS
        pos = last_p + (end - last_p) * t
        col = 'transparent' if i == STEPS else scaled(last_c, f(t))
        out.append(f"{col} {pos:.1f}%".replace('.0%', '%'))
    return ', '.join(head + out)

def rewrite(text):
    res, i, n = [], 0, 0
    while True:
        j = text.find('radial-gradient(', i)
        if j < 0:
            res.append(text[i:]); break
        k, depth = j + len('radial-gradient('), 1
        while depth:
            depth += {'(': 1, ')': -1}.get(text[k], 0); k += 1
        inner = text[j + len('radial-gradient('):k - 1]
        new = soften(inner)
        res.append(text[i:j])
        if new is None:
            res.append(text[j:k])
        else:
            res.append(f'radial-gradient({new})'); n += 1
        i = k
    return ''.join(res), n

if __name__ == '__main__':
    for path in sys.argv[1:]:
        t = open(path).read()
        t2, n = rewrite(t)
        if n:
            open(path, 'w').write(t2)
        print(f'{path}: {n} softened')
