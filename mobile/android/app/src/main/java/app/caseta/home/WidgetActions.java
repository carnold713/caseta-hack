package app.caseta.home;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A tap on a widget. It is shown at once where the hub is about to put it (the widget redraws with the light on or
 * off, the timer running), sent through HubClient off the main thread (goAsync), and then the widget reads the hub's
 * snapshot and draws what really happened. Most taps are the hub's own actions (POST /api/command); four are this
 * side's: a timer's Off now and Add 15 min, and a routine's Skip and Don't skip (a change to the house's config).
 */
public class WidgetActions extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String raw = intent.getStringExtra("action");
        if (raw == null) return;
        if (!HubStore.signedIn(c)) { c.startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; }
        PendingResult done = goAsync();
        new Thread(() -> {
            try {
                JSONObject a = new JSONObject(raw);
                boolean ok = run(c, a);
                // what the hub did, read back a moment later (a fade has started by then, and the timer is running)
                if (ok) Thread.sleep(900);
                refreshNow(c);
            } catch (Throwable t) {
                Safe.note(c, "widget tap", t);
                Safe.run(c, "widget redraw", () -> Widgets.updateAll(c));
            } finally {
                done.finish();
            }
        }).start();
    }

    /** Act, showing the result ahead of the hub where that can be said. False when the hub said no. */
    static boolean run(Context c, JSONObject a) throws Exception {
        String type = a.optString("type");
        JSONObject state = WidgetStore.state(c);
        switch (type) {
            case "timer-off": {
                String key = a.getString("key");
                Object t = keyTarget(key);
                expectTimer(state, key, 0);
                expectLevels(c, state, key, "off");
                show(c, state);
                TimerNotifications.cancel(c, key);
                HubClient.command(c, new JSONObject().put("type", "cancel_timer").put("target", t));
                return HubClient.command(c, new JSONObject().put("type", "level").put("target", t).put("level", "off")).ok();
            }
            case "timer-add": {
                String key = a.getString("key");
                JSONObject ts = state.optJSONObject("timers");
                long ends = ts == null || ts.optJSONObject(key) == null ? 0 : ts.getJSONObject(key).optLong("ends");
                int minutes = 15 + (int) Math.max(0, (ends - System.currentTimeMillis()) / 60000);
                expectTimer(state, key, System.currentTimeMillis() + minutes * 60000L);
                show(c, state);
                return HubClient.command(c, new JSONObject().put("type", "timer").put("target", keyTarget(key)).put("minutes", minutes)).ok();
            }
            case "skip":
                return skip(c, a.getString("id"), a.optString("date", ""));
            case "level": {
                Object lv = a.get("level");
                expectLevels(c, state, a.getString("target"), lv);
                show(c, state);
                break;
            }
            case "step": {
                int delta = a.optInt("delta");
                JSONObject levels = obj(state, "levels");
                for (String id : lightsOf(c, a.getString("target"))) {
                    int cur = levels.optInt(id, 0);
                    levels.put(id, Math.max(0, Math.min(100, (cur < 0 ? 100 : cur) + delta)));
                }
                show(c, state);
                break;
            }
            case "color": {
                JSONObject colors = obj(state, "colors"), levels = obj(state, "levels");
                for (String id : lightsOf(c, a.getString("target"))) {
                    if (a.has("hex")) colors.put(id, a.getString("hex")); else colors.remove(id);
                    if (levels.optInt(id, 0) == 0) levels.put(id, a.optInt("level", -1));
                }
                show(c, state);
                break;
            }
            case "timer": {
                String t = a.getString("target");
                expectTimer(state, t, System.currentTimeMillis() + a.getInt("minutes") * 60000L);
                show(c, state);
                break;
            }
            default:
                break;
        }
        HubClient.Result r = HubClient.command(c, a);
        return r.ok();
    }

    /** Read the hub's snapshot and draw every widget (and the timer notifications) from it. Blocking. */
    static void refreshNow(Context c) {
        Safe.run(c, "widget read", () -> {
            HubClient.Result r = HubClient.request(c, "GET", "/api/snapshot", null);
            if (r.ok()) {
                JSONObject s = WidgetStore.fromSnapshot(c, r.body);
                if (s != null) WidgetStore.setState(c, s);
            }
        });
        Safe.run(c, "widget redraw", () -> Widgets.updateAll(c));
        Safe.run(c, "timer notifications", () -> TimerNotifications.fromState(c));
    }

    private static void show(Context c, JSONObject state) {
        WidgetStore.setState(c, state);
        Widgets.updateAll(c);
    }

    // ---------- the routine's skip: a change to the house's config ----------
    /**
     * Skip a routine's next run (skip_until = that date) or stop skipping (date ""). The config is read fresh from
     * the hub, changed in the routine and its off half (<id>-off, which the app keeps in step), and put back whole,
     * as the app saves it.
     */
    private static boolean skip(Context c, String id, String date) throws Exception {
        HubClient.Result r = HubClient.request(c, "GET", "/api/snapshot", null);
        if (!r.ok()) return false;
        JSONObject config = new JSONObject(r.body).getJSONObject("config");
        JSONArray scheds = config.optJSONArray("schedules");
        boolean found = false;
        for (int i = 0; scheds != null && i < scheds.length(); i++) {
            JSONObject sc = scheds.getJSONObject(i);
            String sid = sc.optString("id");
            if (!sid.equals(id) && !sid.equals(id + "-off")) continue;
            sc.put("skip_until", date.isEmpty() ? JSONObject.NULL : date);
            found = true;
        }
        if (!found) return false;
        // shown at once
        JSONObject m = WidgetStore.model(c);
        JSONObject rt = Widgets.find(m.optJSONArray("routines"), "id", id);
        if (rt != null) { rt.put("skipping", !date.isEmpty()); WidgetStore.setModel(c, m); Widgets.updateAll(c); }
        return HubClient.request(c, "PUT", "/api/config", config.toString()).ok();
    }

    // ---------- the state ahead of the hub ----------
    private static JSONObject obj(JSONObject parent, String key) throws Exception {
        JSONObject o = parent.optJSONObject(key);
        if (o == null) { o = new JSONObject(); parent.put(key, o); }
        return o;
    }

    private static void expectLevels(Context c, JSONObject state, String target, Object level) throws Exception {
        JSONObject levels = obj(state, "levels");
        boolean off = "off".equals(level) || Integer.valueOf(0).equals(level);
        for (String id : lightsOf(c, target)) {
            if (off) levels.put(id, 0);
            else if (level instanceof Integer) levels.put(id, (Integer) level);
            else if (levels.optInt(id, 0) == 0) levels.put(id, -1);
        }
        if ("h:all".equals(target) && off) {
            state.put("house", new JSONObject().put("on", 0).put("level", 0));
            HubStore.setHouse(c, 0, 0);
        }
    }

    private static void expectTimer(JSONObject state, String key, long ends) throws Exception {
        JSONObject ts = obj(state, "timers");
        if (ends <= 0) ts.remove(key); else ts.put(key, new JSONObject().put("ends", ends).put("level", 0));
    }

    /** The light ids a target covers, as the model has them: a light, a room, a list ("d:5|d:6"), the house. */
    static java.util.List<String> lightsOf(Context c, String target) {
        java.util.List<String> out = new java.util.ArrayList<>();
        JSONObject m = WidgetStore.model(c);
        for (String t : target.split("\\|")) {
            if (t.startsWith("d:")) out.add(t.substring(2));
            else if (t.startsWith("a:")) {
                JSONObject room = Widgets.find(m.optJSONArray("rooms"), "id", t.substring(2));
                JSONArray ls = room == null ? null : room.optJSONArray("lights");
                for (int i = 0; ls != null && i < ls.length(); i++) out.add(ls.optString(i));
            } else if (t.equals("h:all")) {
                JSONArray ls = m.optJSONArray("lights");
                for (int i = 0; ls != null && i < ls.length(); i++) out.add(ls.optJSONObject(i).optString("id"));
            }
        }
        return out;
    }

    /** A timer's key back as the target it was started with: "d:5", or a list for "d:5|d:6". */
    static Object keyTarget(String key) {
        if (!key.contains("|")) return key;
        JSONArray a = new JSONArray();
        for (String p : key.split("\\|")) a.put(p);
        return a;
    }
}
