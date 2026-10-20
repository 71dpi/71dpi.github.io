#!/usr/bin/env python3
"""Build markdown twins of the handcrafted HTML pages ("AI Mode").

Reads each page's visible content and writes /md/<name>.md plus /llms-full.txt.
Text is copied, never rewritten. A verification pass compares the words in each
markdown file to the words on its HTML page and fails loudly on any difference.
The HTML pages are never modified by this script.

Usage (from anywhere):  python3 tools/build-md.py
"""
import glob, os, re, sys
from html.parser import HTMLParser
from urllib.parse import urljoin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://71dpi.github.io'
SKIP_PAGES = {'projects/project-template.html', 'projects/steeltech.html', 'projects/streetmoda.html',
              'projects/urbach.html', 'projects/emailme.html', 'projects/projects.html'}


def pages():
    """(html path, md name) for every page that gets a twin."""
    out = [('index.html', 'index'), ('about.html', 'about'), ('resume.html', 'resume'), ('labs.html', 'labs'),
           ('projects/projects.html', 'projects')]
    for f in sorted(glob.glob(os.path.join(ROOT, 'projects', '*.html'))):
        rel = os.path.relpath(f, ROOT)
        if rel not in SKIP_PAGES:
            out.append((rel, os.path.splitext(os.path.basename(rel))[0]))
    out += [('gaems/index.html', 'games'), ('gaems/vol1/index.html', 'games-vol1'),
            ('gaems/vol2/index.html', 'games-vol2')]
    return out


def url_for(rel):
    if rel.endswith('index.html'):
        return BASE + '/' + rel[:-len('index.html')]
    return BASE + '/' + rel


class Converter(HTMLParser):
    VOID = {'img', 'br', 'hr', 'source', 'meta', 'link', 'input'}
    SKIP_TAGS = {'button', 'script', 'style', 'select'}

    def __init__(self, page_url, twin_for):
        super().__init__(convert_charrefs=True)
        self.page_url, self.twin_for = page_url, twin_for
        self.started = self.done = False
        self.blocks, self.buf, self.prefix = [], '', ''
        self.lists, self.words = [], []
        self.skip_tag, self.skip_n = None, 0
        self.a_open = False

    # -- helpers
    def absolute(self, href):
        u = urljoin(self.page_url, href.strip())
        if u.startswith(BASE):
            path = u[len(BASE):].split('#')[0]
            tw = self.twin_for(path)
            if tw:
                return BASE + '/md/' + tw + '.md'
        return u

    def flush(self):
        text = re.sub(r'\s+', ' ', self.buf).strip()
        text = re.sub(r'\*\*([^*]*?)(\s+)\*\*', r'**\1**\2', text)
        text = re.sub(r'\*\*(\s+)([^*]*?)\*\*', r'\1**\2**', text).strip()
        if text:
            self.blocks.append(self.prefix + text)
        self.buf, self.prefix = '', ''

    # -- parser events
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class', '') or ''
        if not self.started:
            if tag == 'h1':
                self.started = True
            else:
                return
        if self.done:
            return
        if self.skip_tag:
            if tag == self.skip_tag and tag not in self.VOID:
                self.skip_n += 1
            return
        if tag == 'hr' or (tag == 'div' and 'footer.html' in (a.get('w3-include-html') or '')):
            self.flush()
            self.done = True
            return
        if tag in self.SKIP_TAGS or 'tile' in cls.split() or 'linkout-icon' in cls or 'tile-text' in cls or 'tile-emoji' in cls:
            if tag not in self.VOID:
                self.skip_tag, self.skip_n = tag, 1
            return
        if tag == 'img':
            if 'tile' in cls or 'pic-tile' in cls:
                return
            alt, src = a.get('alt', ''), a.get('src') or a.get('srcset', '').split(' ')[0]
            if src:
                self.flush()
                self.blocks.append('![%s](%s)' % (re.sub(r'\s+', ' ', alt).strip(), self.absolute(src)))
            return
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.flush()
            self.prefix = '#' * int(tag[1]) + ' '
        elif tag in ('p', 'div', 'section', 'main', 'ul', 'ol', 'picture', 'article', 'nav'):
            self.flush()
            if tag in ('ul', 'ol'):
                self.lists.append(tag)
            if tag == 'div' and 'tldr-label' in cls.split():
                self.buf = '**'
        elif tag == 'li':
            self.flush()
            self.prefix = '- ' if not self.lists or self.lists[-1] == 'ul' else '1. '
        elif tag in ('strong', 'b'):
            self.buf += '**'
        elif tag in ('em', 'i'):
            self.buf += '*'
        elif tag == 'br':
            self.buf += ' '
        elif tag == 'a' and a.get('href') and not a['href'].startswith(('#', 'javascript:', 'mailto:')):
            self.buf += '['
            self.a_open = self.absolute(a['href'])

    def handle_endtag(self, tag):
        if not self.started or self.done:
            return
        if self.skip_tag:
            if tag == 'a' and self.a_open:
                # malformed markup like <a><span>icon</a></span>: close the link, drop it if empty
                if self.buf.endswith('['):
                    self.buf = self.buf[:-1]
                else:
                    self.buf += '](%s)' % self.a_open
                self.a_open = False
            if tag == self.skip_tag:
                self.skip_n -= 1
                if self.skip_n == 0:
                    self.skip_tag = None
            return
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'section', 'main', 'li', 'picture', 'article', 'nav'):
            if tag == 'div' and self.buf.startswith('**') and '**' not in self.buf[2:]:
                self.buf += '**'
            self.flush()
        elif tag in ('ul', 'ol'):
            self.flush()
            if self.lists:
                self.lists.pop()
        elif tag in ('strong', 'b'):
            self.buf += '**'
        elif tag in ('em', 'i'):
            self.buf += '*'
        elif tag == 'a' and self.a_open:
            self.buf += '](%s)' % self.a_open
            self.a_open = False

    def handle_data(self, data):
        if not self.started or self.done or self.skip_tag:
            return
        self.buf += data.replace('*', '\\*')
        self.words += data.split()


def strip_md(text):
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', ' ', text)
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'^(#{1,6} |- |1\. )', '', text, flags=re.M)
    text = text.replace('\\*', '\x00').replace('**', '').replace('*', '')
    return text.replace('\x00', '*').split()


def meta(src, pattern):
    m = re.search(pattern, src, re.S)
    return re.sub(r'\s+', ' ', m.group(1)).strip() if m else ''


def main():
    plist = pages()
    names = {('/' + rel.replace('index.html', '')): n for rel, n in plist}
    names.update({'/' + rel: n for rel, n in plist})
    names['/'] = 'index'

    def twin_for(path):
        path = path.rstrip('?')
        return names.get(path) or names.get(path.rstrip('/') + '/') or names.get(path + '.html')

    os.makedirs(os.path.join(ROOT, 'md'), exist_ok=True)
    full, problems = [], []
    for rel, name in plist:
        src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        url = url_for(rel)
        conv = Converter(url, twin_for)
        conv.feed(src)
        body = '\n\n'.join(conv.blocks)
        title = meta(src, r'<title>(.*?)</title>')
        desc = meta(src, r'<meta name="description" content="(.*?)"')
        canonical = meta(src, r'<link rel="canonical" href="(.*?)"') or url
        front = '---\ntitle: %s\ndescription: %s\nurl: %s\nauthor: Alex Lockwood\n---\n\n' % (title, desc, canonical)
        doc = front + body + '\n\n---\nHTML version: %s\n' % canonical
        open(os.path.join(ROOT, 'md', name + '.md'), 'w', encoding='utf-8').write(doc)
        full.append('# %s\nSource: %s\n\n%s\n' % (title, canonical, body))
        if ''.join(strip_md(body)) != ''.join(conv.words):
            problems.append(name)

    header = ('# Alex Lockwood: full site text\n\n'
              'All public pages of https://71dpi.github.io/ as plain markdown, concatenated. '
              'Same text as the HTML pages. See https://71dpi.github.io/llms.txt for the index.\n')
    open(os.path.join(ROOT, 'llms-full.txt'), 'w', encoding='utf-8').write(header + '\n\n---\n\n'.join([''] + full))
    print('wrote %d markdown files + llms-full.txt' % len(plist))
    if problems:
        print('TEXT MISMATCH between markdown and HTML for:', ', '.join(problems))
        sys.exit(1)
    print('verified: markdown text matches HTML text on every page')


if __name__ == '__main__':
    main()
