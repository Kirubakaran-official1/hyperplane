#!/usr/bin/env bash
# Round 27: builds the Hyperplane Android app (APK) on this computer with Docker, from the hyperplane folder:
#     bash deploy/android/build-apk.sh
# The APK only opens https://hyperplane.quantfriday.in/app/ full screen — every screen and all data come live from the website,
# so it needs rebuilding only for a new name, icon or version (raise appVersionCode and appVersion in twa-manifest.json first).
# Output: frontend/app/public/download/hyperplane.apk + frontend/public/.well-known/assetlinks.json → commit both, push, deploy.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
KEYS="$ROOT/secrets/android"
WORK="$ROOT/deploy/android/build"
PKG="$(python -c "import json; print(json.load(open('deploy/android/twa-manifest.json'))['packageId'])" 2>/dev/null || echo in.quantfriday.hyperplane)"
# Git Bash on Windows: hand Docker real Windows paths, not /d/... ones
if command -v cygpath >/dev/null 2>&1; then H() { cygpath -w "$1"; }; export MSYS_NO_PATHCONV=1; else H() { echo "$1"; }; fi

echo "▶ Preparing the build image (the first time downloads the Android tools, ~1 GB)..."
docker build -q -t hyperplane-apk-builder "$(H "$ROOT/deploy/android")" > /dev/null

mkdir -p "$KEYS" "$WORK"
if [ ! -f "$KEYS/hyperplane.keystore" ]; then
  echo "▶ First build: making the app's signing key..."
  docker run --rm -v "$(H "$KEYS"):/keys" hyperplane-apk-builder sh -c \
    'tr -dc A-Za-z0-9 < /dev/urandom | head -c 32 > /keys/keystore.pass &&
     keytool -genkeypair -keystore /keys/hyperplane.keystore -storetype PKCS12 -alias hyperplane -keyalg RSA -keysize 2048 -validity 10000 \
       -storepass "$(cat /keys/keystore.pass)" -keypass "$(cat /keys/keystore.pass)" -dname "CN=Hyperplane, O=QuantFriday, C=IN" 2>/dev/null'
  echo ""
  echo "  !! BACK UP these two files somewhere safe (a USB drive / your Google Drive):"
  echo "       secrets/android/hyperplane.keystore"
  echo "       secrets/android/keystore.pass"
  echo "     Without them this app can never be updated in place — customers would have to uninstall and install again."
  echo ""
fi

echo "▶ Building the app (a few minutes the first time)..."
cp deploy/android/twa-manifest.json "$WORK/twa-manifest.json"
docker run --rm -v "$(H "$WORK"):/work" -v "$(H "$KEYS"):/keys" -v hyperplane-apk-gradle:/root/.gradle hyperplane-apk-builder sh -c '
  set -e
  export BUBBLEWRAP_KEYSTORE_PASSWORD="$(cat /keys/keystore.pass)" BUBBLEWRAP_KEY_PASSWORD="$(cat /keys/keystore.pass)"
  bubblewrap update --skipVersionUpgrade --manifest=/work/twa-manifest.json --directory=/work > /tmp/update.log 2>&1 || { cat /tmp/update.log; exit 1; }
  # Gradle downloads itself with Java, which gives up when one of GitHub'"'"'s download addresses is unreachable (seen on Indian ISPs);
  # curl tries the next address — so curl fetches it once (kept in the cache volume) and the build uses that copy
  P=/work/gradle/wrapper/gradle-wrapper.properties
  U="$(sed -n "s/^distributionUrl=//p" $P | tr -d "\\\\")"
  F="/root/.gradle/dl/$(basename "$U")"
  [ -s "$F" ] || { mkdir -p /root/.gradle/dl && curl -fsSL --retry 3 -o "$F.part" "$U" && mv "$F.part" "$F"; }
  sed -i "s|^distributionUrl=.*|distributionUrl=file\\\\://$F|" $P
  bubblewrap build --skipPwaValidation --manifest=/work/twa-manifest.json --directory=/work > /tmp/build.log 2>&1 || { tail -40 /tmp/build.log; exit 1; }
  keytool -list -v -keystore /keys/hyperplane.keystore -storepass "$BUBBLEWRAP_KEYSTORE_PASSWORD" -alias hyperplane 2>/dev/null \
    | sed -n "s/^[[:space:]]*SHA256: //p" > /work/fingerprint.txt'

FP="$(tr -d '\r\n ' < "$WORK/fingerprint.txt")"
[ -n "$FP" ] || { echo "✗ could not read the signing key's fingerprint"; exit 1; }
mkdir -p frontend/app/public/download frontend/public/.well-known
cp "$WORK/app-release-signed.apk" frontend/app/public/download/hyperplane.apk
cat > frontend/public/.well-known/assetlinks.json <<EOF
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": { "namespace": "android_app", "package_name": "$PKG", "sha256_cert_fingerprints": ["$FP"] }
}]
EOF
echo "✓ App built: frontend/app/public/download/hyperplane.apk ($(du -k frontend/app/public/download/hyperplane.apk | cut -f1) KB)"
echo "✓ Site link written: frontend/public/.well-known/assetlinks.json"
echo "  Next: commit both files, push, then deploy on the server (bash deploy/deploy.sh)."
