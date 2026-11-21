#!/bin/sh
# Build Studio into <repo>/studio/dist from a scratch copy; stubs the 3D preview when `three` cannot be installed.
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd); SB=${1:-/tmp/sb}
mkdir -p "$SB"; rm -rf "$SB/src" "$SB/public"; cp -r "$REPO/studio/src" "$REPO/studio/public" "$SB/"
cp "$REPO/studio/index.html" "$REPO/studio/vite.config.js" "$SB/"
[ -d "$SB/node_modules" ] || { cp "$REPO/studio/package.json" "$SB/"; python3 -c "import json;p=json.load(open('$SB/package.json'));p['dependencies'].pop('three',None);json.dump(p,open('$SB/package.json','w'))"; (cd "$SB" && npm install --no-audit --no-fund >/dev/null); }
printf 'export default function BabyBall3DPreview(){return null}\n' > "$SB/src/BabyBall3DPreview.jsx"
(cd "$SB" && npx vite build >/dev/null && npx vitest run 2>&1 | grep -E "Tests|Test Files")
rm -rf "$REPO/studio/dist"; cp -r "$SB/dist" "$REPO/studio/dist"
