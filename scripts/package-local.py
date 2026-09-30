#!/usr/bin/env python3
"""Package the built private app for a computer with Node; include no credentials or dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
output = root / 'releases' / 'japan-together-local.zip'
output.parent.mkdir(exist_ok=True)
if not (root / 'dist' / 'index.html').is_file():
    raise SystemExit('Build the app before packaging it.')
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for relative in ['server.mjs', 'scripts/start-local.mjs', 'LOCAL-SHARING.md']:
        archive.write(root / relative, 'japan-together/' + relative)
    for file in sorted((root / 'dist').rglob('*')):
        if file.is_file():
            archive.write(file, 'japan-together/' + str(file.relative_to(root)))
    archive.writestr('japan-together/package.json', json.dumps({
        'name': 'japan-together-local', 'version': '1.0.0', 'private': True,
        'type': 'module', 'scripts': {'start': 'node scripts/start-local.mjs'},
        'engines': {'node': '>=24 <25'}
    }, indent=2) + '\n')
    archive.writestr('japan-together/START-HERE.txt',
        'Open LOCAL-SHARING.md for the short setup guide.\n'
        'Install Node.js 24, then open a terminal in this folder and run:\n'
        '  node scripts/start-local.mjs\n'
        'Wait for "Private app ready" before starting cloudflared in a second terminal.\n'
        'No npm install is needed. Never share or serve the dist folder directly.\n')
    for font in ['dm-sans', 'cormorant-garamond']:
        license_file = root / 'node_modules' / '@fontsource' / font / 'LICENSE'
        if not license_file.is_file():
            raise SystemExit(f'Missing font licence for {font}')
        archive.write(license_file, f'japan-together/licenses/{font}.txt')
    for package in ['react', 'react-dom', 'scheduler', 'lucide-react', 'd3-geo', 'd3-array', 'internmap']:
        license_file = root / 'node_modules' / package / 'LICENSE'
        if not license_file.is_file():
            raise SystemExit(f'Missing runtime licence for {package}')
        archive.write(license_file, f'japan-together/licenses/{package}.txt')
    archive.writestr('japan-together/licenses/ATTRIBUTION.txt',
        'Map geography: Natural Earth (public domain), through world-atlas.\n'
        'Fonts: DM Sans and Cormorant Garamond, OFL licences included.\n'
        'Illustrations: original SVG artwork; not venue photographs.\n')
print(f'Created {output} ({output.stat().st_size:,} bytes)')
