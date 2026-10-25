package app.caseta.home;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The apps that show on the lights with a look of their own (Calls and texts, Apps), as far as this phone needs to
 * know them: which ones CallsListener sends every notification of (the web app hands the list over, native.js
 * alertApps), and which apps have notified lately, so the page can offer those first when one is added.
 */
final class AlertApps {
    private static final String PREFS = "alert_apps";
    private static final long NOTE_EVERY_MS = 60 * 60 * 1000L;   // a busy app is noted once an hour, not every time
    private static final long RECENT_MS = 14L * 24 * 60 * 60 * 1000;
    private static final Map<String, Long> notedAt = new HashMap<>();
    private static Set<String> chosen;

    private AlertApps() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized boolean chosen(Context c, String pkg) {
        if (chosen == null) chosen = new HashSet<>(prefs(c).getStringSet("chosen", new HashSet<>()));
        return chosen.contains(pkg);
    }

    static synchronized void setChosen(Context c, Set<String> pkgs) {
        chosen = new HashSet<>(pkgs);
        prefs(c).edit().putStringSet("chosen", chosen).apply();
    }

    /** An app made a notification: kept as one that notifies lately. */
    static synchronized void noticed(Context c, String pkg) {
        long now = System.currentTimeMillis();
        Long last = notedAt.get(pkg);
        if (last != null && now - last < NOTE_EVERY_MS) return;
        notedAt.put(pkg, now);
        try {
            JSONObject recent = new JSONObject(prefs(c).getString("recent", "{}"));
            recent.put(pkg, now);
            // the old ones go, so it stays the apps of the last two weeks
            Iterator<String> keys = recent.keys();
            List<String> old = new ArrayList<>();
            while (keys.hasNext()) { String k = keys.next(); if (now - recent.optLong(k) > RECENT_MS) old.add(k); }
            for (String k : old) recent.remove(k);
            prefs(c).edit().putString("recent", recent.toString()).apply();
        } catch (Exception ignored) { /* noted next time */ }
    }

    /** {recent: [{pkg, name, at}], all: [{pkg, name}]}: the apps lately notifying, newest first, then every app. */
    static JSObject list(Context c) {
        PackageManager pm = c.getPackageManager();
        JSArray recent = new JSArray(), all = new JSArray();
        try {
            JSONObject seen = new JSONObject(prefs(c).getString("recent", "{}"));
            List<String> pkgs = new ArrayList<>();
            Iterator<String> keys = seen.keys();
            while (keys.hasNext()) pkgs.add(keys.next());
            pkgs.sort((a, b) -> Long.compare(seen.optLong(b), seen.optLong(a)));
            for (String p : pkgs) {
                if (p.equals(c.getPackageName()) || p.equals("android") || p.startsWith("com.android.systemui")) continue;
                String name = label(pm, p);
                if (name == null) continue;
                JSObject o = new JSObject();
                o.put("pkg", p);
                o.put("name", name);
                o.put("at", seen.optLong(p));
                recent.put(o);
            }
        } catch (Exception ignored) { /* none then */ }
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        Set<String> done = new HashSet<>();
        List<JSObject> apps = new ArrayList<>();
        for (ResolveInfo ri : pm.queryIntentActivities(launcher, 0)) {
            String p = ri.activityInfo.packageName;
            if (p.equals(c.getPackageName()) || !done.add(p)) continue;
            JSObject o = new JSObject();
            o.put("pkg", p);
            o.put("name", String.valueOf(ri.loadLabel(pm)));
            apps.add(o);
        }
        apps.sort((a, b) -> a.getString("name", "").compareToIgnoreCase(b.getString("name", "")));
        for (JSObject o : apps) all.put(o);
        JSObject r = new JSObject();
        r.put("recent", recent);
        r.put("all", all);
        return r;
    }

    private static String label(PackageManager pm, String pkg) {
        try {
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return String.valueOf(pm.getApplicationLabel(ai));
        } catch (Exception e) {
            return null;
        }
    }
}
