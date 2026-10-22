#!/usr/bin/env bash
# Sign the Mac app with the same identity every build, so macOS keeps its Screen Recording permission from one
# update to the next. macOS ties that permission to how an app is signed; an ad hoc signature is new every build, and
# then the old switch in System Settings stays on but no longer applies to the app.
#
# The identity is a self-made certificate, not an Apple developer one (Gatekeeper still asks once per download). It
# comes from the CASETA_MAC_P12_B64 secret when the repository has one, otherwise from the Actions cache, and is made
# on the first build that has neither. If signing with it fails for any reason, the app is signed ad hoc as before,
# so a build never stops here; the log says which it was.
set -uo pipefail
APP="$1"
NAME="Caseta Screen Sync"
P12="$HOME/caseta-mac-sign.p12"
PASS=caseta
adhoc() { echo "signing ad hoc: $1"; codesign --force --deep --sign - "$APP"; exit 0; }

if [ -n "${CASETA_MAC_P12_B64:-}" ]; then echo "$CASETA_MAC_P12_B64" | base64 -d > "$P12"; fi
if [ ! -s "$P12" ]; then
  echo "making the signing certificate"
  cat > "$RUNNER_TEMP/cert.cnf" <<EOF
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=$NAME
[ext]
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
basicConstraints=critical,CA:false
EOF
  /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 7300 -config "$RUNNER_TEMP/cert.cnf" \
    -keyout "$RUNNER_TEMP/key.pem" -out "$RUNNER_TEMP/cert.pem" || adhoc "could not make a certificate"
  /usr/bin/openssl pkcs12 -export -inkey "$RUNNER_TEMP/key.pem" -in "$RUNNER_TEMP/cert.pem" -name "$NAME" \
    -out "$P12" -passout pass:$PASS || adhoc "could not package the certificate"
fi

KC="$RUNNER_TEMP/sign.keychain-db"
security create-keychain -p ci "$KC" || adhoc "no keychain"
security set-keychain-settings "$KC"
security unlock-keychain -p ci "$KC"
security list-keychains -d user -s "$KC" $(security list-keychains -d user | tr -d '"')
security import "$P12" -k "$KC" -P $PASS -T /usr/bin/codesign || adhoc "the certificate would not import"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k ci "$KC" >/dev/null
HASH=$(security find-identity -p codesigning "$KC" | awk '/"'"$NAME"'"/ {print $2; exit}')
[ -n "$HASH" ] || adhoc "no identity in the keychain"
echo "identity $HASH"
if ! codesign --force --deep --keychain "$KC" --sign "$HASH" "$APP"; then
  # codesign may want the certificate trusted for code signing first
  /usr/bin/openssl pkcs12 -in "$P12" -nokeys -passin pass:$PASS -out "$RUNNER_TEMP/trust.pem"
  sudo security add-trusted-cert -d -r trustRoot -p codeSign -k /Library/Keychains/System.keychain "$RUNNER_TEMP/trust.pem" \
    || adhoc "the certificate could not be trusted"
  codesign --force --deep --keychain "$KC" --sign "$HASH" "$APP" || adhoc "codesign refused the identity"
fi
codesign -dvv "$APP" 2>&1 | grep -E "Authority|Identifier|Signature" || true
codesign -d -r- "$APP" 2>&1 | tail -1
