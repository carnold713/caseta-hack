package app.caseta.home;

import android.content.Context;
import android.content.pm.PackageInfo;

import org.json.JSONObject;

/**
 * A short account of what the widgets draw, sent to the hub's log (POST /api/app-crash) while a widget problem is
 * being looked into: the build, the widget, the sizes the launcher asked for, and anything that went wrong. Sent off
 * the main thread and never retried; a phone that cannot reach the hub loses nothing but the note.
 */
final class Diag {
    private Diag() {}

    static void send(Context c, String text) {
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                String v = "?";
                try { PackageInfo p = app.getPackageManager().getPackageInfo(app.getPackageName(), 0); v = p.versionName; } catch (Throwable ignored) { /* unknown */ }
                HubClient.request(app, "POST", "/api/app-crash", new JSONObject().put("text", "[widgets " + v + "] " + text).toString());
            } catch (Throwable ignored) { /* a note lost */ }
        }).start();
    }
}
