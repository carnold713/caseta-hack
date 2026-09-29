#!/bin/bash
# One time, on the Raspberry Pi, from the checkout:   sudo bash agent/setup-watchdog.sh
#
# Two watchdogs, so the remotes come back by themselves:
#   1. the Pi's hardware watchdog (bcm2835): systemd feeds it, and if the whole machine freezes the chip reboots it
#      (RuntimeWatchdogSec=15s; 15 s is the most this chip can count). A reboot that itself hangs is forced after
#      RebootWatchdogSec=2min.
#   2. the connector's own (caseta-agent.service, WatchdogSec=60): systemd restarts it when it stops pinging, which
#      is what a hung connector does, not only when it exits.
# The hub updates the connector's code by itself, but not systemd's settings or the unit, which is what this does.
# Safe to run again: it changes only what differs, and says what it did.
set -euo pipefail

say() { printf '%s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { say "Run it with sudo:  sudo bash $0"; exit 1; }

REPO=$(cd "$(dirname "$0")/.." && pwd)
OWNER=$(stat -c %U "$REPO")
OWNER_HOME=$(getent passwd "$OWNER" | cut -d: -f6)
SYSTEM_UNIT=/etc/systemd/system/caseta-agent.service
USER_UNIT="$OWNER_HOME/.config/systemd/user/picohack-connector.service"
CHANGED=0

# The new unit expects the connector to say READY=1; one too old to say it would be restarted every 90 seconds.
if ! grep -q 'WATCHDOG=1' "$REPO/agent/agent.py"; then
  say "The connector in $REPO is older than 0.24.0 and cannot ping a watchdog."
  say "Update it first (git pull in $REPO, or Update in the app's Settings), then run this again."
  exit 1
fi

# ---------- 1. the hardware watchdog ----------
if [ -e /dev/watchdog ]; then
  say "Hardware watchdog: /dev/watchdog is there."
else
  say "Hardware watchdog: /dev/watchdog is missing, so a frozen Pi will not reboot by itself yet."
  say "  Add the line  dtparam=watchdog=on  to /boot/firmware/config.txt (/boot/config.txt on older systems),"
  say "  reboot, and run this again. The setting below is written anyway and takes effect once the device is there."
fi
if systemctl is-active --quiet watchdog 2>/dev/null; then
  say "  Note: the 'watchdog' package's daemon is running and holds /dev/watchdog, so systemd cannot use it."
  say "  That daemon already reboots a frozen Pi. To hand the job to systemd: sudo systemctl disable --now watchdog"
fi

CONF_DIR=/etc/systemd/system.conf.d
CONF="$CONF_DIR/caseta-watchdog.conf"
mkdir -p "$CONF_DIR"
WANT=$(cat <<'EOF'
# Written by caseta-hack agent/setup-watchdog.sh. systemd feeds the Pi's hardware watchdog; a frozen Pi reboots.
[Manager]
RuntimeWatchdogSec=15s
RebootWatchdogSec=2min
EOF
)
if [ -f "$CONF" ] && [ "$(cat "$CONF")" = "$WANT" ]; then
  say "Hardware watchdog setting: already in $CONF."
else
  printf '%s\n' "$WANT" > "$CONF"
  say "Hardware watchdog setting: wrote $CONF (RuntimeWatchdogSec=15s, RebootWatchdogSec=2min)."
fi

# ---------- 2. the connector's unit ----------
# The connector runs from one of two units: caseta-agent.service (README, by hand) or picohack-connector, a user
# service (the app's install line, scripts/install.sh). Whichever this Pi has gets the watchdog. Never both: two
# connectors would each act on every press.
if [ -f "$USER_UNIT" ] && [ ! -f "$SYSTEM_UNIT" ]; then
  MODE=user
elif [ -f "$SYSTEM_UNIT" ]; then
  MODE=system
  [ -f "$USER_UNIT" ] && say "Note: $USER_UNIT exists too. Only caseta-agent.service is changed here; if both run, disable one."
elif pgrep -f "$REPO/agent/.*agent.py|[ /]agent\.py" >/dev/null 2>&1; then
  say "A connector is running, but not from caseta-agent.service or picohack-connector. Not installing a second one."
  say "Stop the one that is running, then run this again."
  exit 1
else
  MODE=system
fi

if [ "$MODE" = system ]; then
  # the unit in the repo, pointed at this checkout and its owner (it is written for /home/pi/caseta-hack and pi)
  TMP=$(mktemp)
  trap 'rm -f "$TMP"' EXIT
  sed -e "s#/home/pi/caseta-hack#$REPO#g" -e "s#^User=pi\$#User=$OWNER#" "$REPO/agent/caseta-agent.service" > "$TMP"
  if [ -f "$SYSTEM_UNIT" ] && cmp -s "$TMP" "$SYSTEM_UNIT"; then
    say "Connector unit: $SYSTEM_UNIT is already the watchdog version."
  else
    install -m 644 "$TMP" "$SYSTEM_UNIT"
    say "Connector unit: installed $SYSTEM_UNIT (Type=notify, WatchdogSec=60, Restart=always)."
  fi
  systemctl daemon-reload
  systemctl daemon-reexec
  say "systemd: reloaded, and re-executed so the hardware watchdog setting applies now."
  systemctl enable caseta-agent >/dev/null 2>&1
  if systemctl restart caseta-agent; then say "Connector: restarted."; else say "Connector: did not start. See: journalctl -u caseta-agent -n 50"; fi
  SHOW=(systemctl)
  UNIT=caseta-agent
else
  UID_=$(id -u "$OWNER")
  as_user() { sudo -u "$OWNER" XDG_RUNTIME_DIR="/run/user/$UID_" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$UID_/bus" systemctl --user "$@"; }
  DROP_DIR="$USER_UNIT.d"
  DROP="$DROP_DIR/watchdog.conf"
  WANT_DROP=$(cat <<'EOF'
# Written by caseta-hack agent/setup-watchdog.sh: restart the connector when it hangs, not only when it exits.
[Service]
Type=notify
NotifyAccess=main
WatchdogSec=60
Restart=always
RestartSec=5
EOF
)
  if [ -f "$DROP" ] && [ "$(cat "$DROP")" = "$WANT_DROP" ]; then
    say "Connector unit: picohack-connector (a user service) already has the watchdog in $DROP."
  else
    sudo -u "$OWNER" mkdir -p "$DROP_DIR"
    printf '%s\n' "$WANT_DROP" | sudo -u "$OWNER" tee "$DROP" >/dev/null
    say "Connector unit: picohack-connector is a user service; added the watchdog in $DROP."
  fi
  systemctl daemon-reload
  systemctl daemon-reexec
  say "systemd: reloaded, and re-executed so the hardware watchdog setting applies now."
  if as_user daemon-reload && as_user restart picohack-connector; then say "Connector: restarted."
  else say "Connector: did not start. See: journalctl --user -u picohack-connector -n 50 (as $OWNER)"; fi
  SHOW=(as_user)
  UNIT=picohack-connector
fi

# ---------- the check ----------
sleep 3
say ""
say "Check (WatchdogUSec=1min and RuntimeWatchdogUSec=15s mean both are on):"
"${SHOW[@]}" show -p WatchdogUSec "$UNIT"
systemctl show -p RuntimeWatchdogUSec
say "Connector: $("${SHOW[@]}" is-active "$UNIT" 2>/dev/null || true)"
