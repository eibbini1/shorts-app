"""Screenshots of Studio states at 1440x900 and 390x844 plus overflow/label checks.
usage: python3 scripts/ui-fixture/shoot.py <base-url> <token> <out-dir>"""
import json, pathlib, sys
from playwright.sync_api import sync_playwright
base, token, out = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3]); out.mkdir(parents=True, exist_ok=True)
SIZES = {'desktop': (1440, 900), 'mobile': (390, 844)}
STATES = {'empty': None, 'plan': '1794900000001', 'blocked': '1794900000002', 'export': '1794900000003', 'arabic': '1794900000004'}
report = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for sname, (w, h) in SIZES.items():
        ctx = b.new_context(viewport={'width': w, 'height': h}); pg = ctx.new_page()
        pg.goto(f'{base}/?token={token}'); pg.wait_for_load_state('networkidle')
        for st, sid in STATES.items():
            pg.goto(f'{base}/' + (f'?project={sid}' if sid else '')); pg.wait_for_load_state('networkidle')
            pg.wait_for_timeout(600)
            overflow = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
            pg.screenshot(path=str(out / f'{st}-{sname}.png'))
            report[f'{st}-{sname}'] = {'horizontalOverflow': overflow}
        ctx.close()
    b.close()
print(json.dumps(report, indent=1))
