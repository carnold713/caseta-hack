# Caseta for Android

The same app as the web one, in an Android shell ([Capacitor](https://capacitorjs.com) 8), with the few things a
web app cannot have living on the Android side.

## Install it

Open this on the phone and tap `caseta.apk`:

https://github.com/carnold713/caseta-hack/releases/tag/android-latest

Android asks once to allow installs from the browser. Every push that touches `mobile/` builds a new one at the same
link (`.github/workflows/android.yml`), and it installs over the last one. It is a separate app from the older
PWABuilder one (`app.railway.up.hub_production_fa07.twa`); both can be installed, and that one can go.

## What is in it

- **The app itself** is the hub's web app, loaded from `https://hub-production-fa07.up.railway.app`
  (`capacitor.config.json`, `server.url`). So a deploy of the hub updates the app too; only changes to the native
  parts below need a new APK. If the hub cannot be reached as it opens, it shows `www/offline.html` with Try again.
- **All off in the quick settings shade** (`AllOffTile.java`). Pull down, edit the tiles, drag in *All off*. It acts
  at once, from the lock screen too: turning lights off is always safe. Nothing in the shade turns a light on.
- **The house on the home screen** (`HouseWidget.java`, `res/layout/house_widget.xml`): "3 on · 60%", and All off.
  A tap elsewhere opens the app. It shows what the app last drew, and asks the hub itself every 30 minutes and after
  its own button.
- **A running sleep timer on the lock screen** (`TimerNotifications.java`, `TimerActionReceiver.java`): "Floor lamp
  fades out at 11:42 pm", a countdown, *Off now* and *Add 15 min*. Android 13 and later ask once, right after a
  timer is first set, never on launch. It shows timers the app knows about; a timer started from a remote while the
  app has not been opened since appears the next time it is.
- **Edge to edge** (`plugins.SystemBars`): the app draws under the status bar, as the Figma frames do, with the safe
  areas passed to the page.

The page hands the native side what it needs through the `Hub` plugin (`HubPlugin.java`, called from
`web/ui/native.js`): the hub and the sign-in (for the tile, the widget and the buttons, which run without the app
open), the house as Home draws it, and the running timers. In a browser all of that is a no-op.

## Building it by hand

Needs Node 22, Java 21 and the Android SDK (`ANDROID_HOME`).

```
cd mobile
npm ci
npx cap sync android
cd android && ./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

## Signing

Android only installs an update over an app signed with the same key. The workflow signs with the repository
secrets `CASETA_KEYSTORE_B64` (a keystore, base64), `CASETA_KEYSTORE_PASSWORD`, `CASETA_KEY_ALIAS` and
`CASETA_KEY_PASSWORD` when they exist. Until then it makes one key on its first run and keeps it in the Actions
cache, which holds it as long as a build runs at least once a week; if that key is ever lost, the next APK needs the
old app uninstalled first. For a key that can never be lost, make one and add those four secrets:

```
keytool -genkeypair -keystore caseta.jks -alias caseta -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 caseta.jks        # the value of CASETA_KEYSTORE_B64
```

A new key means one uninstall, once.
