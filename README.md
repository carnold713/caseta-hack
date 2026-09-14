# caseta-hack · Pico superpowers for Lutron Caséta

Double-click, hold, custom groups and app-side scenes for Pico remotes, with a
phone app you can install on Android (PWA, packageable with PWABuilder).

```
 phone (PWA) ──HTTPS/WSS──▶  hub on Railway  ◀──WSS (outbound)──  agent at home ──LEAP/TLS──▶ Smart Bridge
                             stores config,                        talks to the bridge,
                             serves the app,                       detects gestures,
                             relays commands                       runs the bindings
```

Why two halves: the Smart Bridge's LEAP API (port 8081) is LAN-only, so
something must run inside your house. The agent is a ~300 line Python
script that runs on any always-on box (Raspberry Pi, NAS, old laptop, a
Docker container). It dials **out** to Railway, so nothing is exposed on
your home network. If the internet drops, the agent keeps running your
Pico bindings from its cached config.

## What you get

- **Gestures per Pico button:** single click, double click, hold, hold-begins,
  hold-ends (the last two make "hold to raise, release to stop" possible).
- **Actions:** set level / on / off / toggle with a fade, step brightness,
  cycle through levels, raise / lower / stop, fan speed, run a Lutron scene,
  run an app scene, wait. Several actions chain on one gesture.
- **Groups:** any set of devices a button or scene can drive as one, with
  its own "on" level.
- **App scenes:** exact levels on any mix of devices with a fade. Capture the
  current state of the house with one tap.
- **Live view:** press a Pico button and the app jumps to it and lights up
  the gesture it detected. Handy for tuning the timing.
- **Home screen:** dimmer sliders, switch toggles, fan speeds, shade
  open / stop / close, grouped by room.

Works with the regular Smart Bridge (L-BDG2) and the Pro (L-BDGPRO2).

## The one Lutron-side caveat

The bridge still runs whatever the Lutron app programmed a Pico to do,
in parallel with your bindings. For a Pico you want to fully own, open
the Lutron app and remove the devices it controls (keep the Pico paired
to the bridge). It then reports presses and does nothing else, and your
bindings are the only thing that runs. A Pico can stay half-Lutron too:
leave its native "On" and "Off", and bind only the double click.

## Setup

### 1. Hub on Railway

The repo deploys as-is (Nixpacks, `npm start`). Set these variables on
the service:

| variable | purpose |
|---|---|
| `APP_PASSWORD` | what you type into the phone app |
| `AGENT_TOKEN` | shared secret the home agent presents |
| `DATA_DIR` | `/data`, with a volume mounted there so config survives deploys |
| `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256` | optional, after PWABuilder packaging (see below) |

Then generate a domain. `/healthz` is the health check. The current
deployment lives at https://hub-production-fa07.up.railway.app.

### 2. Agent at home

On the always-on machine (Python 3.10+):

```
git clone https://github.com/carnold713/caseta-hack && cd caseta-hack/agent
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python find_bridge.py              # prints the bridge's IP
python pair.py <ip>                # press the button on the back of the bridge when asked
cp .env.example .env               # fill in BRIDGE_HOST, HUB_URL, AGENT_TOKEN
set -a; . ./.env; set +a; python agent.py
```

The bridge IP: give it a DHCP reservation in your router, or find it under
the Lutron app's Settings › Advanced › Integration. `pair.py` writes
`caseta.key`, `caseta.crt` and `caseta-bridge.crt` into `agent/data/`.
Keep them private: they are full control of your lights.

Run it for good with `caseta-agent.service` (systemd) or the `Dockerfile`
(`--network host` so it can reach the bridge). Within a few seconds the
dot in the app's header turns green and your rooms appear.

### 3. Phone

Open the Railway URL in Chrome on Android, sign in, **Add to Home screen**.
That already gives you a full-screen app with an icon.

For a real APK / Play-Store style install, go to
[pwabuilder.com](https://www.pwabuilder.com), paste the URL, and package
for Android. PWABuilder gives you a signing-key SHA-256 fingerprint and a
package name; put them in `ANDROID_CERT_SHA256` and `ANDROID_PACKAGE_NAME`
on Railway. The hub serves them at `/.well-known/assetlinks.json`, which is
what makes Android trust the app and hide the browser bar.

## Configure

1. **Picos** tab: press any button on a Pico and its remote opens with that
   button selected. Add a gesture, add actions, **Save**.
2. **Groups** tab: name it, tick devices.
3. **Scenes** tab: new scene, set the lights how you like them in the Lutron
   app or on the Home tab, then **Capture current levels**.
4. **Setup** tab: tune the double-click window and hold threshold while
   watching the live log.

A worked example, a 3-button Pico in the kitchen:

| button | gesture | actions |
|---|---|---|
| On | single | Group Kitchen → on |
| On | double | App scene "Bright" (cans 100, pendants 100, under-cabinet 100) |
| Favorite | single | App scene "Dinner" |
| Favorite | double | Lutron scene "Movie night" |
| Favorite | hold | Everything → off (a group of the whole floor) |
| Raise | hold begins | Group Kitchen → raise |
| Raise | hold ends | Group Kitchen → stop |
| Raise | single | Group Kitchen → step +10 |

Single click on a button that also has a double click binding waits the
double window (default 350 ms) before firing. A button with no double
binding fires instantly.

## Layout

```
hub/server.js     Express + ws: static PWA, /api/*, /ws/app (phones), /ws/agent (home)
hub/validate.js   config schema, shared truth for bindings and actions
hub/store.js      JSON files in DATA_DIR
web/              the PWA: index.html, app.js, styles.css, manifest, sw.js, icons/
agent/agent.py    bridge connection, event fan-out, hub link with reconnect
agent/engine.py   gesture state machine + action runner (pylutron-caseta underneath)
agent/pair.py     one-time certificate pairing
scripts/          make-icons.js (dependency-free PNG generator)
```

## Local development

```
npm install
APP_PASSWORD=dev AGENT_TOKEN=dev npm start     # http://localhost:4400
cd agent && python test_engine.py             # gesture timing tests
```

Without a bridge, a fake agent that speaks the same protocol is all the
hub needs; the message shapes are documented at the top of `hub/server.js`
and in `agent/agent.py`.
