#!/usr/bin/env python3
"""List UI text that has no English/Arabic translation yet.

The Tagalog text itself is the key (see web/js/i18n.js). This script finds every
t('...') call in web/js/*.js, every data-t element and placeholder/aria-label/title
in web/index.html, and compares them with web/js/i18n-dict.js.

Usage (from the repo root):  python3 tools/i18n_check.py
Exit code 1 when something is missing, so it can run in CI.
"""
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')
UNITS = ['piraso', 'pack', 'sachet', 'bote', 'lata', 'kilo', 'gramo', 'litro', 'box', 'dosena', 'tali', 'tasa']
IGNORE = {'0.00'}


def used_keys():
    keys = []

    def add(k):
        if k and k not in keys and k not in IGNORE:
            keys.append(k)

    for f in sorted(glob.glob(os.path.join(ROOT, 'js', '*.js'))):
        if f.endswith('i18n-dict.js'):
            continue
        s = open(f, encoding='utf8').read()
        for m in re.finditer(r"\bt\(\s*'((?:[^'\\]|\\.)*)'", s):
            add(m.group(1).replace("\\'", "'"))
        for m in re.finditer(r"label: '([^']+)'", s):
            add(m.group(1))
    s = open(os.path.join(ROOT, 'index.html'), encoding='utf8').read()
    for m in re.finditer(r'<[^>]*\bdata-t\b[^>]*>([^<]+)<', s):
        add(html.unescape(m.group(1).strip()))
    for m in re.finditer(r'(?:placeholder|aria-label|title)="([^"]+)"', s):
        add(html.unescape(m.group(1)))
    for u in UNITS:
        add(u)
    return keys


def dict_keys():
    s = open(os.path.join(ROOT, 'js', 'i18n-dict.js'), encoding='utf8').read()
    body = s[s.index('=') + 1:].strip().rstrip(';')
    return json.loads(body)


def main():
    d = dict_keys()
    missing = [k for k in used_keys() if k not in d or not d[k].get('en') or not d[k].get('ar')]
    for k in missing:
        print('missing:', k)
    print(f'{len(missing)} missing, {len(d)} in dictionary')
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
