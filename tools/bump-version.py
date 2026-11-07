#!/usr/bin/env python3
"""Postavlja broj verzije na sve JS/CSS adrese (?v=...) da telefon ne koristi stari keš.
Pokreće se pre svakog commita:  python3 tools/bump-version.py"""
import re, pathlib, time, json

root = pathlib.Path(__file__).resolve().parent.parent
ver = time.strftime('%Y%m%d%H%M%S')

def stamp(text):
    # import ... from './x.js'  /  import('./x.js')  /  src="js/app.js"  /  href="css/app.css"
    text = re.sub(r"""((?:from\s+|import\s*\(\s*)['"])(\.{1,2}/[^'"?]+\.js)(?:\?v=\w+)?(['"])""", rf"\g<1>\g<2>?v={ver}\g<3>", text)
    text = re.sub(r"""((?:src|href)=")((?:js|css)/[^"?]+\.(?:js|css))(?:\?v=\w+)?(")""", rf"\g<1>\g<2>?v={ver}\g<3>", text)
    return text

for f in list((root / 'js').rglob('*.js')) + [root / 'index.html']:
    if 'vendor' in f.parts:
        continue
    t = f.read_text(encoding='utf-8')
    n = stamp(t)
    if n != t:
        f.write_text(n, encoding='utf-8')

(root / 'version.json').write_text(json.dumps({'version': ver}) + '\n')
(root / 'js' / 'version.js').write_text(f"export const VERSION = '{ver}';\n")
print('verzija', ver)
