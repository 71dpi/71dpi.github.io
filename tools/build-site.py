#!/usr/bin/env python3
"""Build the deployable site into _site/ (the HTML in the repo is never modified).

What it does, in order:
  1. Copies every tracked/untracked-but-not-ignored file into _site/.
  2. Inlines components (header/footer) into every page that uses w3-include-html, and drops includeHTML().
  3. Images: makes resized WebP variants, rewrites <picture> sources to srcset + sizes, adds width/height,
     lazy-loads everything below the first content image, and turns big animated GIFs into animated WebP.
  4. Minifies style.css, tokens.css and js/*.js with esbuild (skipped with a warning if npx is missing).

Usage (from anywhere):   python3 tools/build-site.py [--out _site] [--no-minify]
Preview:                 python3 -m http.server -d _site
Needs:                   Pillow (pip install pillow), and Node/npx for minifying.

Generated images are cached in .cache/img (keyed by source bytes + settings), so repeat builds only
re-encode images that changed.
"""
import argparse, glob, hashlib, os, re, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

try:
    from PIL import Image, ImageOps, ImageSequence
except ImportError:
    sys.exit('Pillow is required: pip install pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache', 'img')
ESBUILD = 'esbuild@0.25.10'

# never copied into the deployed site
EXCLUDE_TOP = {'tools', '.github', '_site', '.cache', 'components', 'README.md', '.gitignore', '.gitattributes',
               'PROJECT-DAMOCLES.md', '.DS_Store'}
SKIP_PAGES = {'pull-my-face.html'}          # standalone experiment page: copied as-is, not processed

WIDTHS = (480, 960, 1440, 1920)             # resized variants; the original is the top rung when it fits
MAX_W = 1920
WEBP_QUALITY = 80
ANIM_QUALITY = 70
GIF_MIN_BYTES = 100_000
CACHE_VERSION = 'v1'                        # bump to invalidate every cached image

# `sizes` per CSS class: what the layout actually renders (see style.css). Mobile is full width.
# Override on one image with data-sizes="..." (removed from the output).
SIZES = [
    ('big-picture-hd',        '100vw'),
    ('little-picture-inline', '(min-width: 768px) 40vw, 100vw'),
    ('little-tile',           '(min-width: 768px) 20vw, 50vw'),   # .tile is 50% wide, .little-tile 25% of the 80% mosaic
    ('pic-tile',              '(min-width: 768px) 40vw, 50vw'),
    ('project-logo',          '(min-width: 768px) 50vw, 100vw'),
    ('pic-inline',            '(min-width: 768px) 50vw, 100vw'),
]
SIZES_DEFAULT = '(min-width: 768px) 80vw, 100vw'
NO_RESIZE_CLASSES = {'site-logo', 'footer-social'}   # tiny UI images: dimensions + lazy only

stats = {'webp_variants': 0, 'cache_hits': 0, 'pictures': 0, 'imgs': 0, 'gifs': 0, 'warnings': []}


def warn(msg):
    stats['warnings'].append(msg)


# ---------------------------------------------------------------- files

def source_files():
    try:
        out = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=ROOT, check=True,
                             capture_output=True).stdout.decode('utf-8')
        files = [f for f in out.split('\0') if f and os.path.exists(os.path.join(ROOT, f))]
    except Exception:
        files = []
        for dp, dn, fn in os.walk(ROOT):
            dn[:] = [d for d in dn if d != '.git']
            files += [os.path.relpath(os.path.join(dp, f), ROOT) for f in fn]
    return [f for f in files if f.split('/')[0] not in EXCLUDE_TOP and os.path.basename(f) != '.DS_Store']


# ---------------------------------------------------------------- includes

INCLUDE_RE = re.compile(r'(<div\b[^>]*?)\s+w3-include-html="([^"]+)"([^>]*>)</div>')
INCLUDE_FN_RE = re.compile(r'[ \t]*<script>\s*function includeHTML\(\)\s*\{.*?</script>[ \t]*\n?', re.S)
INCLUDE_CALL_RE = re.compile(r'[ \t]*<script>\s*includeHTML\(\);?\s*</script>[ \t]*\n?')


def load_fragment(path):
    s = open(os.path.join(ROOT, path.lstrip('/')), encoding='utf-8').read()
    # a fragment is dropped into a <div>, where the browser ignores these; a string splice must do the same
    s = re.sub(r'</?(?:body|html)\b[^>]*>', '', s, flags=re.I)
    return s.strip('\n')


def inline_includes(html, rel):
    def sub(m):
        return m.group(1) + m.group(3) + '\n' + load_fragment(m.group(2)) + '\n</div>'
    html = INCLUDE_RE.sub(sub, html)
    if 'w3-include-html="' in html:
        warn('%s: w3-include-html left in place (pattern not matched)' % rel)
    else:
        html = INCLUDE_FN_RE.sub('', html)
        html = INCLUDE_CALL_RE.sub('', html)
    return html


# ---------------------------------------------------------------- tag helpers

ATTR_RE = re.compile(r'([^\s=/>"\']+)(?:\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>"\']+))?')


def parse_tag(tag):
    m = re.match(r'<(\w+)\s*(.*?)\s*(/?)>$', tag, re.S)
    name, rest, slash = m.group(1), m.group(2), m.group(3)
    attrs = []
    for am in ATTR_RE.finditer(rest):
        v = am.group(2)
        if v is not None and v[0] in '"\'':
            v = v[1:-1]
        attrs.append([am.group(1), v])
    return name, attrs, slash


def build_tag(name, attrs, slash=''):
    parts = []
    for k, v in attrs:
        parts.append(k if v is None else '%s="%s"' % (k, v.replace('"', '&quot;')))
    return '<%s%s%s>' % (name, (' ' + ' '.join(parts)) if parts else '', (' ' + slash) if slash else '')


def get(attrs, key):
    for k, v in attrs:
        if k.lower() == key:
            return v
    return None


def put(attrs, key, value, after=None):
    for a in attrs:
        if a[0].lower() == key:
            a[1] = value
            return
    attrs.append([key, value])


def drop(attrs, key):
    attrs[:] = [a for a in attrs if a[0].lower() != key]


# ---------------------------------------------------------------- images

_dims = {}


def resolve(url, page_rel):
    """Disk path (in ROOT) for a local image URL, or None."""
    if not url or url.startswith(('http:', 'https:', '//', 'data:')):
        return None
    url = url.split('?')[0].split('#')[0]
    path = url.lstrip('/') if url.startswith('/') else os.path.normpath(os.path.join(os.path.dirname(page_rel), url))
    full = os.path.join(ROOT, path)
    return path if os.path.isfile(full) else None


def info(path):
    """(width, height, animated) for a raster file, cached."""
    if path not in _dims:
        try:
            with Image.open(os.path.join(ROOT, path)) as im:
                _dims[path] = (im.width, im.height, bool(getattr(im, 'is_animated', False)))
        except Exception as e:
            warn('cannot read %s: %s' % (path, e))
            _dims[path] = None
    return _dims[path]


def cached(key_parts, out_ext):
    h = hashlib.sha1(('|'.join(map(str, key_parts)) + CACHE_VERSION).encode()).hexdigest()
    os.makedirs(CACHE, exist_ok=True)
    return os.path.join(CACHE, h + out_ext)


def make_variant(master, width):
    """Resized WebP of `master` at `width`. Returns path to the (cached) file."""
    src = os.path.join(ROOT, master)
    key = [hashlib.sha1(open(src, 'rb').read()).hexdigest(), width, WEBP_QUALITY]
    out = cached(key, '.webp')
    if os.path.exists(out):
        stats['cache_hits'] += 1
        return out
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        im = im.convert('RGBA' if ('A' in im.getbands() or im.mode == 'P' and 'transparency' in im.info) else 'RGB')
        h = max(1, round(im.height * width / im.width))
        im = im.resize((width, h), Image.LANCZOS)
        im.save(out, 'WEBP', quality=WEBP_QUALITY, method=4)
    stats['webp_variants'] += 1
    return out


def make_animated_webp(gif):
    src = os.path.join(ROOT, gif)
    key = [hashlib.sha1(open(src, 'rb').read()).hexdigest(), 'anim', ANIM_QUALITY]
    out = cached(key, '.webp')
    if not os.path.exists(out):
        with Image.open(src) as im:
            frames, durs = [], []
            for fr in ImageSequence.Iterator(im):
                durs.append(fr.info.get('duration', 100) or 100)
                frames.append(fr.convert('RGBA'))
            frames[0].save(out, 'WEBP', save_all=True, append_images=frames[1:], duration=durs, loop=0,
                           quality=ANIM_QUALITY, method=4)
    return out


class Output:
    """Generated files to add to the output, as {url path (no leading slash): cache file}."""
    def __init__(self):
        self.files = {}


def variant_url(master_path, width):
    stem, _ = os.path.splitext(master_path)
    return '%s-%dw.webp' % (stem, width)


def responsive_source(webp_path, master_path, out):
    """srcset string for one <source>, or None if no resizing helps. webp_path is the existing WebP."""
    wi = info(webp_path)
    if not wi or wi[2]:
        return None
    ww = wi[0]
    mi = info(master_path)
    if not mi or mi[2]:
        return None
    entries = []
    for w in WIDTHS:
        if w < min(ww, MAX_W) and w < mi[0]:
            url = variant_url(webp_path, w)
            out.files[url] = ('variant', master_path, w)
            entries.append((w, '/' + url))
    if ww <= MAX_W:
        # re-encode the top rung too when that is clearly smaller (never from a WebP master: no generation loss)
        url, use = webp_path, False
        if not master_path.lower().endswith('.webp') and mi[0] == ww:
            cand = make_variant(master_path, ww)
            use = os.path.getsize(cand) < 0.85 * os.path.getsize(os.path.join(ROOT, webp_path))
        if use:
            url = variant_url(webp_path, ww)
            out.files[url] = ('variant', master_path, ww)
        entries.append((ww, '/' + url))
    else:
        url = variant_url(webp_path, MAX_W)
        out.files[url] = ('variant', master_path, MAX_W)
        entries.append((MAX_W, '/' + url))
    if len(entries) < 2:
        return None
    return ', '.join('%s %dw' % (u, w) for w, u in entries)


def sizes_for(classes, override):
    if override:
        return override
    for cls, sz in SIZES:
        if cls in classes:
            return sz
    return SIZES_DEFAULT


def convert_gif(url, page_rel, out):
    """Swap a big animated GIF URL for an animated WebP. Returns the new URL (or the old one)."""
    path = resolve(url, page_rel)
    if not path or not path.lower().endswith('.gif'):
        return url
    if os.path.getsize(os.path.join(ROOT, path)) < GIF_MIN_BYTES:
        return url
    new = os.path.splitext(path)[0] + '.webp'
    if os.path.exists(os.path.join(ROOT, new)):
        # an animated WebP made by hand already sits next to the GIF: use it if it is smaller
        ni = info(new)
        if ni and ni[2] and os.path.getsize(os.path.join(ROOT, new)) < os.path.getsize(os.path.join(ROOT, path)):
            stats['gifs'] += 1
            return url[:-4] + '.webp'
        warn('%s: %s exists but is not an animated, smaller WebP; GIF kept' % (page_rel, new))
        return url
    out.files[new] = ('anim', path, 0)
    stats['gifs'] += 1
    return url[:-4] + '.webp'


class PageImages:
    def __init__(self, rel, out):
        self.rel, self.out, self.n = rel, out, 0
        self.preloads = {}      # master webp url -> (srcset, sizes) of the first source, for <link rel=preload>

    def eager(self):
        return self.n <= 1      # [0] is the header logo, [1] the first content image

    def finish_img(self, attrs, dims_ok, w, h):
        """Common <img> attributes: dimensions, lazy/eager, decoding, cleanup."""
        if dims_ok and get(attrs, 'width') is None and get(attrs, 'height') is None and w:
            put(attrs, 'width', str(w))
            put(attrs, 'height', str(h))
        if get(attrs, 'loading') is None and not self.eager():
            put(attrs, 'loading', 'lazy')
        if get(attrs, 'decoding') is None and not self.eager():
            put(attrs, 'decoding', 'async')
        drop(attrs, 'data-sizes')

    # <img> outside any <picture>
    def img(self, tag):
        name, attrs, slash = parse_tag(tag)
        stats['imgs'] += 1
        src = get(attrs, 'src')
        new = convert_gif(src, self.rel, self.out) if src else src
        if new != src:
            put(attrs, 'src', new)
            ss = get(attrs, 'srcset')
            if ss:
                put(attrs, 'srcset', new)
        if get(attrs, 'sizes') == '(min-width: 768px)':
            drop(attrs, 'sizes')            # invalid sizes value, ignored by browsers anyway
        dims = None
        path = resolve(src, self.rel) if src else None     # the file on disk (the original GIF if converted)
        if path and path.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')):
            dims = info(path)
        self.finish_img(attrs, bool(dims), dims[0] if dims else 0, dims[1] if dims else 0)
        self.n += 1
        return build_tag(name, attrs, slash)

    # <picture> ... </picture>
    def picture(self, block):
        m = re.match(r'(<picture\b[^>]*>)(.*)(</picture>)$', block, re.S)
        open_tag, inner, close_tag = m.groups()
        tags = list(re.finditer(r'<(source|img)\b[^>]*>', inner))
        img_m = next((t for t in tags if t.group(1) == 'img'), None)
        if not img_m:
            return block
        stats['pictures'] += 1
        iname, iattrs, islash = parse_tag(img_m.group(0))
        classes = set((get(iattrs, 'class') or '').split())
        override = get(iattrs, 'data-sizes')
        isrc = get(iattrs, 'src')
        ipath = resolve(isrc, self.rel) if isrc else None

        # GIF inside a picture: just treat it like a standalone image
        if ipath and ipath.lower().endswith('.gif'):
            return open_tag + self._rebuild(inner, tags, {img_m.start(): self.img(img_m.group(0))}) + close_tag

        raster = ipath and ipath.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))
        resize = raster and not (classes & NO_RESIZE_CLASSES)
        replacements = {}
        ratios = []
        sizes = sizes_for(classes, override)

        for t in tags:
            if t.group(1) != 'source':
                continue
            sname, sattrs, sslash = parse_tag(t.group(0))
            ss = get(sattrs, 'srcset')
            if not ss or ',' in ss or ' ' in ss.strip():
                continue
            spath = resolve(ss, self.rel)
            if not spath or not spath.lower().endswith(('.webp', '.png', '.jpg', '.jpeg')):
                continue
            si = info(spath)
            if si and not si[2]:
                ratios.append(si[0] / si[1])
            if not resize or not si or si[2]:
                continue
            # master: lossless-ish fallback with the same stem if it exists, else the webp itself
            stem = os.path.splitext(spath)[0]
            master = spath
            if ipath and os.path.splitext(ipath)[0] == stem and not ipath.lower().endswith('.webp'):
                master = ipath
            srcset = responsive_source(spath, master, self.out) if spath.lower().endswith('.webp') else None
            if srcset:
                put(sattrs, 'srcset', srcset)
                put(sattrs, 'sizes', sizes)
                if get(sattrs, 'type') is None:
                    put(sattrs, 'type', 'image/webp')
                replacements[t.start()] = build_tag(sname, sattrs, sslash)
                self.preloads.setdefault(ss, (srcset, sizes))

        # fallback <img>
        stats['imgs'] += 1
        ii = info(ipath) if raster else None
        if ii and not ii[2]:
            ratios.append(ii[0] / ii[1])
        uniform = ratios and (max(ratios) - min(ratios)) / max(ratios) < 0.01
        if get(iattrs, 'sizes') == '(min-width: 768px)':
            drop(iattrs, 'sizes')
        if resize and replacements and get(iattrs, 'srcset') == isrc:
            drop(iattrs, 'srcset')          # the redundant copy of src
        self.finish_img(iattrs, bool(ii and not ii[2] and uniform), ii[0] if ii else 0, ii[1] if ii else 0)
        self.n += 1
        replacements[img_m.start()] = build_tag(iname, iattrs, islash)
        return open_tag + self._rebuild(inner, tags, replacements) + close_tag

    @staticmethod
    def _rebuild(inner, tags, replacements):
        out, pos = [], 0
        for t in tags:
            if t.start() in replacements:
                out.append(inner[pos:t.start()])
                out.append(replacements[t.start()])
                pos = t.end()
        out.append(inner[pos:])
        return ''.join(out)


IMG_RE = re.compile(r'(<picture\b.*?</picture>)|(<img\b[^>]*>)', re.S)
PRELOAD_RE = re.compile(r'<link\b[^>]*\brel="preload"[^>]*\bas="image"[^>]*>')


def process_images(html, rel, out):
    pi = PageImages(rel, out)
    html = IMG_RE.sub(lambda m: pi.picture(m.group(1)) if m.group(1) else pi.img(m.group(2)), html)

    def preload(m):
        name, attrs, slash = parse_tag(m.group(0))
        href = get(attrs, 'href')
        if href in pi.preloads:
            srcset, sizes = pi.preloads[href]
            drop(attrs, 'href')
            put(attrs, 'imagesrcset', srcset)
            put(attrs, 'imagesizes', sizes)
            return build_tag(name, attrs, slash)
        return m.group(0)
    return PRELOAD_RE.sub(preload, html)


# ---------------------------------------------------------------- build

def minify(out_dir, no_minify):
    targets = [f for f in ('style.css', 'tokens.css') if os.path.exists(os.path.join(out_dir, f))]
    targets += [os.path.relpath(p, out_dir) for p in glob.glob(os.path.join(out_dir, 'js', '*.js'))]
    if no_minify or not shutil.which('npx'):
        if not no_minify:
            warn('npx not found: CSS/JS not minified')
        return 0
    saved = 0
    for t in targets:
        p = os.path.join(out_dir, t)
        before = os.path.getsize(p)
        r = subprocess.run(['npx', '-y', ESBUILD, p, '--minify', '--allow-overwrite', '--outfile=' + p, '--log-level=warning'],
                           capture_output=True, text=True)
        if r.returncode != 0:
            warn('esbuild failed on %s: %s' % (t, r.stderr.strip()[:200]))
            continue
        saved += before - os.path.getsize(p)
    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, '_site'))
    ap.add_argument('--no-minify', action='store_true')
    args = ap.parse_args()
    out_dir = os.path.abspath(args.out)
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)

    files = source_files()
    out = Output()
    pages = []
    for f in files:
        dst = os.path.join(out_dir, f)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if f.endswith('.html') and f not in SKIP_PAGES:
            pages.append(f)
        else:
            shutil.copy2(os.path.join(ROOT, f), dst)

    for f in pages:
        html = open(os.path.join(ROOT, f), encoding='utf-8').read()
        html = inline_includes(html, f)
        html = process_images(html, f, out)
        open(os.path.join(out_dir, f), 'w', encoding='utf-8').write(html)

    # generated image files
    def generate(item):
        url, (kind, master, width) = item
        dst = os.path.join(out_dir, url)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        src = make_variant(master, width) if kind == 'variant' else make_animated_webp(master)
        shutil.copy2(src, dst)
        return url, kind, master, src

    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        for url, kind, master, src in pool.map(generate, sorted(out.files.items())):
            if kind == 'anim' and os.path.getsize(src) >= os.path.getsize(os.path.join(ROOT, master)):
                warn('%s: animated WebP is not smaller than the GIF' % master)

    saved = minify(out_dir, args.no_minify)

    # GIFs that were swapped for WebP no longer need to ship
    for url, (kind, master, width) in out.files.items():
        if kind == 'anim' and not any(
                master in open(os.path.join(out_dir, p), encoding='utf-8').read() for p in pages):
            try:
                os.remove(os.path.join(out_dir, master))
            except OSError:
                pass

    left = [p for p in pages if 'w3-include-html="' in open(os.path.join(out_dir, p), encoding='utf-8').read()]
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fn in os.walk(out_dir) for f in fn)
    print('built %d pages -> %s' % (len(pages), os.path.relpath(out_dir)))
    print('  pictures %d, imgs %d, new WebP variants %d (cache hits %d), GIFs->WebP %d' % (
        stats['pictures'], stats['imgs'], stats['webp_variants'], stats['cache_hits'], stats['gifs']))
    print('  minify saved %.1f KiB; output %.1f MiB' % (saved / 1024, total / 1048576))
    for w in stats['warnings']:
        print('  warning:', w)
    if left:
        sys.exit('includes were not inlined in: ' + ', '.join(left))


if __name__ == '__main__':
    main()
