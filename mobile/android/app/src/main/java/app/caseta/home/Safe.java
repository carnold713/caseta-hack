package app.caseta.home;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * Work outside the app (a widget's redraw, a tap on one, a timer's tick) must never take the app down with it: a
 * throw in a background thread or a receiver ends the whole process, the open app included. Each such piece runs
 * through here, which keeps the last thing that went wrong so the app can hand it to the hub (native.js), where it
 * shows in the hub's log.
 */
final class Safe {
    private static final String PREFS = "crash";

    private Safe() {}

    static void run(Context c, String where, Runnable r) {
        try { r.run(); } catch (Throwable t) { note(c, where, t); }
    }

    /** Keep what went wrong, written at once: after an uncaught throw the process has no later. */
    static void note(Context c, String where, Throwable t) {
        try {
            StringWriter w = new StringWriter();
            t.printStackTrace(new PrintWriter(w));
            String text = where + " on Android " + android.os.Build.VERSION.SDK_INT + " (" + android.os.Build.MODEL + ")\n" + w;
            Log.e("Caseta", text);
            prefs(c).edit().putString("last", text.length() > 6000 ? text.substring(0, 6000) : text).putLong("at", System.currentTimeMillis()).commit();
        } catch (Throwable ignored) { /* nothing more can be done */ }
    }

    /** The last thing that went wrong and when, once: it is cleared as it is read. Null with none. */
    static String take(Context c) {
        SharedPreferences p = prefs(c);
        String last = p.getString("last", null);
        if (last == null) return null;
        long at = p.getLong("at", 0);
        p.edit().remove("last").remove("at").apply();
        return new java.util.Date(at) + "\n" + last;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
