#!/bin/sh
# Pico Hack home connector installer. Served by the hub with the values filled in.
# Runs on macOS or Linux (Raspberry Pi included). Safe to re-run: it updates in place.
set -e
HUB_URL="__HUB_URL__"
AGENT_TOKEN="__AGENT_TOKEN__"
REPO="__REPO__"
BRANCH="__BRANCH__"
DIR="$HOME/caseta-hack"

say() { printf '\n\033[1;33m%s\033[0m\n' "$*"; }

command -v git >/dev/null 2>&1 || { say "git is missing. On a Mac run: xcode-select --install   On Linux: sudo apt install git"; exit 1; }
PY=$(command -v python3 || true)
[ -n "$PY" ] || { say "python3 is missing. On a Mac install it from python.org; on Linux: sudo apt install python3 python3-venv"; exit 1; }
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' || { say "Python 3.10 or newer is required (found $($PY --version))."; exit 1; }

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" pull -q origin "$BRANCH"
else
  say "Downloading Pico Hack into $DIR"
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR/agent"

say "Installing the connector's dependencies (a minute or two)"
[ -d .venv ] || "$PY" -m venv .venv
./.venv/bin/pip install -q --upgrade pip >/dev/null
./.venv/bin/pip install -q -r requirements.txt

mkdir -p data
if [ ! -f data/caseta.crt ]; then
  say "Looking for your Lutron bridge"
  set +e
  ./.venv/bin/python find_bridge.py
  set -e
  printf '\nType the bridge address shown above (or from the Lutron app under Settings > Advanced > Integration): '
  read -r BRIDGE </dev/tty
  say "Pairing. When asked, press the small button on the back of the bridge."
  ./.venv/bin/python pair.py "$BRIDGE" </dev/tty
fi

cat > .env <<ENV
HUB_URL=$HUB_URL
AGENT_TOKEN=$AGENT_TOKEN
DATA_DIR=$DIR/agent/data
LOG_LEVEL=info
ENV

OS=$(uname -s)
if [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.picohack.connector.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.picohack.connector</string>
  <key>ProgramArguments</key><array><string>$DIR/agent/.venv/bin/python</string><string>$DIR/agent/agent.py</string></array>
  <key>WorkingDirectory</key><string>$DIR/agent</string>
  <key>EnvironmentVariables</key><dict>
    <key>HUB_URL</key><string>$HUB_URL</string>
    <key>AGENT_TOKEN</key><string>$AGENT_TOKEN</string>
    <key>DATA_DIR</key><string>$DIR/agent/data</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/agent/data/connector.log</string>
  <key>StandardErrorPath</key><string>$DIR/agent/data/connector.log</string>
</dict></plist>
PL
  launchctl unload "$PLIST" >/dev/null 2>&1 || true
  launchctl load "$PLIST"
  say "Done. The connector runs in the background and starts with your Mac."
  echo "Log: $DIR/agent/data/connector.log    Stop it: launchctl unload $PLIST"
  echo "Tip: System Settings > Battery (or Energy) > prevent sleeping when the display is off, or the connector pauses with the Mac."
elif command -v systemctl >/dev/null 2>&1; then
  UNIT="$HOME/.config/systemd/user/picohack-connector.service"
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$UNIT" <<UN
[Unit]
Description=Pico Hack home connector
After=network-online.target
[Service]
WorkingDirectory=$DIR/agent
EnvironmentFile=$DIR/agent/.env
ExecStart=$DIR/agent/.venv/bin/python agent.py
Restart=always
RestartSec=5
[Install]
WantedBy=default.target
UN
  systemctl --user daemon-reload
  systemctl --user enable picohack-connector >/dev/null 2>&1
  systemctl --user restart picohack-connector
  loginctl enable-linger "$USER" >/dev/null 2>&1 || sudo loginctl enable-linger "$USER" >/dev/null 2>&1 || true
  say "Done. The connector runs in the background and starts on boot."
  echo "Log: journalctl --user -u picohack-connector -f    Stop it: systemctl --user stop picohack-connector"
else
  say "Installed. Start it with:  cd $DIR/agent && set -a && . ./.env && set +a && ./.venv/bin/python agent.py"
fi
