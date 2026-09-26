package app.caseta.home;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;

/**
 * What the widgets draw from, kept on this phone:
 *
 *   the model   the home as the app sees it: rooms and the lights in each, lights, scenes, pins, the night light and
 *               the routines coming up. Handed over by the app (web/ui/native.js, widgetData) whenever it changes,
 *               since only the app knows which room a light is in once rooms are the app's own.
 *   the state   each light's level and colour, the running timers and the house count. Handed over by the app as it
 *               changes, and read from the hub's snapshot by the widgets themselves every few minutes and after a tap.
 *   a config    per placed widget: what it controls and how it looks, edited on the app's Widgets page
 *               (#widgets/<id>) and saved as it changes, never with a Save button.
 */
final class WidgetStore {
    private static final String NAME = "widgets";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    private static JSONObject read(Context c, String key) {
        try { return new JSONObject(prefs(c).getString(key, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    // ---------- the model and the state ----------
    static JSONObject model(Context c) { return read(c, "model"); }
    static boolean hasModel(Context c) { return prefs(c).contains("model"); }
    static void setModel(Context c, JSONObject m) { prefs(c).edit().putString("model", m.toString()).apply(); }

    static JSONObject state(Context c) { return read(c, "state"); }
    static void setState(Context c, JSONObject s) {
        try { s.put("at", System.currentTimeMillis()); } catch (Exception ignored) { /* never */ }
        prefs(c).edit().putString("state", s.toString()).apply();
    }

    /**
     * The state from the hub's snapshot (GET /api/snapshot): levels, colours, timers and the house count. Pins and
     * routines' skips live in the house's config, so the model's copies of those follow it too. Null when the
     * snapshot is not one.
     */
    static JSONObject fromSnapshot(Context c, String body) {
        try {
            JSONObject snap = new JSONObject(body);
            JSONObject inv = snap.getJSONObject("inventory").getJSONObject("devices");
            JSONObject states = snap.optJSONObject("states");
            JSONObject levels = new JSONObject(), colors = new JSONObject(), timers = new JSONObject();
            int on = 0, sum = 0;
            Iterator<String> ids = inv.keys();
            while (ids.hasNext()) {
                String id = ids.next();
                JSONObject d = inv.optJSONObject(id);
                if (d == null) continue;
                String domain = d.optString("domain", "");
                if (!domain.equals("light") && !domain.equals("switch")) continue;
                JSONObject s = states == null ? null : states.optJSONObject(id);
                int lv = s == null ? 0 : s.optInt("level", 0);
                levels.put(id, lv);
                if (lv > 0) { on++; sum += lv; }
                JSONObject col = s == null ? null : s.optJSONObject("color");
                if (col != null && "xy".equals(col.optString("mode")) && col.optString("hex", "").startsWith("#")) colors.put(id, col.getString("hex"));
            }
            JSONObject ts = snap.optJSONObject("timers");
            if (ts != null) {
                Iterator<String> keys = ts.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    JSONObject t = ts.optJSONObject(k);
                    if (t == null || t.optDouble("ends_at", 0) <= 0) continue;
                    timers.put(k, new JSONObject().put("ends", (long) (t.optDouble("ends_at") * 1000)).put("level", t.optInt("level", 0)));
                }
            }
            JSONObject out = new JSONObject().put("levels", levels).put("colors", colors).put("timers", timers)
                .put("house", new JSONObject().put("on", on).put("level", on == 0 ? 0 : Math.round(sum / (float) on)));
            HubStore.setHouse(c, on, on == 0 ? 0 : Math.round(sum / (float) on));
            followConfig(c, snap.optJSONObject("config"), snap.optJSONObject("next_runs"));
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    /** Pins and routines as the house's config has them now, into the model the app last handed over. */
    private static void followConfig(Context c, JSONObject config, JSONObject nextRuns) {
        if (config == null || !hasModel(c)) return;
        try {
            JSONObject m = model(c);
            JSONArray favs = config.optJSONArray("favorites");
            if (favs != null) {
                JSONArray pins = new JSONArray();
                for (int i = 0; i < favs.length(); i++) {
                    String k = favs.optString(i);
                    if (k.startsWith("d:") || k.startsWith("a:")) pins.put(k);
                }
                m.put("pins", pins);
            }
            JSONArray scheds = config.optJSONArray("schedules");
            JSONArray routines = m.optJSONArray("routines");
            if (scheds != null && routines != null) {
                for (int i = 0; i < routines.length(); i++) {
                    JSONObject r = routines.getJSONObject(i);
                    String id = r.optString("id");
                    for (int j = 0; j < scheds.length(); j++) {
                        JSONObject sc = scheds.getJSONObject(j);
                        if (!id.equals(sc.optString("id"))) continue;
                        String skip = sc.isNull("skip_until") ? "" : sc.optString("skip_until", "");
                        r.put("skipping", !skip.isEmpty() && skip.compareTo(r.optString("date", "")) >= 0);
                        r.put("enabled", sc.optBoolean("enabled", true));
                    }
                    // the connector's own next time, when it has one: fresher than the one the app worked out
                    String iso = nextRuns == null ? "" : nextRuns.optString(id, "");
                    long t = Widgets.parseIso(iso);
                    if (t > System.currentTimeMillis() && !r.optBoolean("skipping")) { r.put("t", t); r.put("date", iso.substring(0, 10)); }
                }
            }
            setModel(c, m);
        } catch (Exception ignored) {
            // the app hands the model over again the next time it opens
        }
    }

    // ---------- each placed widget ----------
    static JSONObject config(Context c, int id) {
        JSONObject cfg = read(c, "w" + id);
        try {
            if (!cfg.has("kind")) cfg.put("kind", kindOf(c, id));
            Widgets.fillDefaults(c, cfg);
        } catch (Exception ignored) { /* the defaults are drawn anyway */ }
        return cfg;
    }

    static boolean configured(Context c, int id) { return prefs(c).contains("w" + id); }

    static void setConfig(Context c, int id, JSONObject cfg) {
        try { cfg.put("kind", kindOf(c, id)); } catch (Exception ignored) { /* never */ }
        prefs(c).edit().putString("w" + id, cfg.toString()).apply();
    }

    static void remove(Context c, int id) { prefs(c).edit().remove("w" + id).apply(); }

    /** Which of the ten a placed widget is, from the provider Android placed it with. */
    static String kindOf(Context c, int id) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(c).getAppWidgetInfo(id);
        return info == null ? "" : Widgets.kindOfProvider(info.provider.getClassName());
    }

    // ---------- this phone's own choices ----------
    /** How a running sleep timer shows on this phone: "live" (the status bar), "quiet" or "none". */
    static String timerMode(Context c) { return prefs(c).getString("timerMode", "live"); }
    static void setTimerMode(Context c, String mode) { prefs(c).edit().putString("timerMode", mode).apply(); }

    /** When the widget previews were last drawn from this home (Android 15's generated previews), and from what. */
    static String previewStamp(Context c) { return prefs(c).getString("previewStamp", ""); }
    static void setPreviewStamp(Context c, String s) { prefs(c).edit().putString("previewStamp", s).apply(); }
}
