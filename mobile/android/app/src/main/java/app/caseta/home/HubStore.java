package app.caseta.home;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Where the native pieces find the house: the hub's address and this phone's sign-in, handed over by the web app
 * each time it signs in (HubPlugin.setCredentials) and forgotten when it signs out. The tile, the widget and the
 * notification buttons run without the app open, so they cannot ask the page; they read this.
 *
 * Also the house as the app last drew it (how many lights on, how bright), so the widget can show it at once.
 */
final class HubStore {
    private static final String NAME = "hub";

    private HubStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    static void setCredentials(Context c, String url, String token) {
        prefs(c).edit().putString("url", trim(url)).putString("token", token).apply();
    }

    static void clear(Context c) {
        prefs(c).edit().remove("token").remove("on").remove("level").apply();
    }

    static String url(Context c) {
        return prefs(c).getString("url", "https://hub-production-fa07.up.railway.app");
    }

    static String token(Context c) {
        return prefs(c).getString("token", "");
    }

    static boolean signedIn(Context c) {
        return !token(c).isEmpty();
    }

    static void setHouse(Context c, int on, int level) {
        prefs(c).edit().putInt("on", on).putInt("level", level).putLong("houseAt", System.currentTimeMillis()).apply();
    }

    static int on(Context c) {
        return prefs(c).getInt("on", -1);
    }

    static int level(Context c) {
        return prefs(c).getInt("level", 0);
    }

    private static String trim(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
