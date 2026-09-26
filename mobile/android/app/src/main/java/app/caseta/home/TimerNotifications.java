package app.caseta.home;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

/**
 * A running sleep timer, outside the app: one notification per timer, "{Lamp}", "Off at 11:42pm", a countdown, and
 * two buttons, Off now and Add 15 min. Neither turns anything on.
 *
 * How it shows is this phone's choice (Settings, This phone; WidgetStore.timerMode):
 *   live   Android 16 and later: a Live Update. The countdown sits in the status bar as a chip (Samsung's Now Bar on
 *          One UI 8), on the lock screen, and at the top of the shade with the candle burning down as its progress.
 *          Older Android: an ongoing notification with the same countdown and buttons.
 *   quiet  a plain notification that can be swiped away: no chip, never promoted.
 *   none   nothing at all.
 * None of them makes a sound or buzzes, and redrawing one (every minute, for the candle) never alerts again.
 *
 * One notification per timer rather than one summary: each has its own Off now and Add 15 min, which a summary could
 * not hold, and two timers at once (a lamp and a room) is as many as a home runs.
 *
 * The app hands over the whole list each time its timers change (sync); the widgets hand over what they read from
 * the hub (fromState), so a timer started from a widget or a remote shows even with the app closed.
 */
final class TimerNotifications {
    static final String CHANNEL = "timers";
    private static final String PREFS = "timer-notes";
    private static final int COPPER = 0xFFD98A4E;

    private TimerNotifications() {}

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** The app's list of running timers: [{key, title, target, endsAt, route}]. */
    static void sync(Context c, JSONArray timers) {
        prefs(c).edit().putString("list", timers.toString()).apply();
        redraw(c);
    }

    /** The running timers as the widgets last read them from the hub, named from the app's model. */
    static void fromState(Context c) {
        JSONObject ts = WidgetStore.state(c).optJSONObject("timers");
        JSONArray list = new JSONArray();
        long now = System.currentTimeMillis();
        try {
            Iterator<String> keys = ts == null ? null : ts.keys();
            while (keys != null && keys.hasNext()) {
                String k = keys.next();
                JSONObject t = ts.optJSONObject(k);
                if (t == null || t.optInt("level") > 0 || t.optLong("ends") <= now) continue;
                String target = k.contains("|") ? WidgetActions.keyTarget(k).toString() : k;
                list.put(new JSONObject().put("key", k).put("title", nameOf(c, k)).put("target", target).put("endsAt", t.optLong("ends")).put("route", routeOf(k)));
            }
        } catch (Exception ignored) {
            return;
        }
        sync(c, list);
    }

    /** Draw what the stored list says, the way this phone wants it. */
    static void redraw(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        channel(nm);
        String mode = WidgetStore.timerMode(c);
        JSONArray timers = list(c);
        Set<String> now = new HashSet<>();
        boolean allowed = Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled();
        if (!mode.equals("none") && allowed) {
            for (int i = 0; i < timers.length(); i++) {
                JSONObject t = timers.optJSONObject(i);
                if (t == null) continue;
                String key = t.optString("key");
                long ends = t.optLong("endsAt");
                if (key.isEmpty() || ends <= System.currentTimeMillis()) continue;
                now.add(key);
                nm.notify(key, 1, build(c, key, t.optString("title", "Light"), t.optString("target", key), ends, t.optString("route", routeOf(key)), mode));
            }
        }
        // anything shown before that is not running any more (or not to be shown now)
        Set<String> was = prefs(c).getStringSet("keys", new HashSet<>());
        for (String k : was) if (!now.contains(k)) nm.cancel(k, 1);
        prefs(c).edit().putStringSet("keys", now).apply();
        TimerTick.schedule(c);
    }

    /** Show (or redraw) one timer's notification at a new end (Add 15 min, from its own button). */
    static void show(Context c, String key, String title, String target, long ends) {
        JSONArray timers = list(c), next = new JSONArray();
        boolean found = false;
        try {
            for (int i = 0; i < timers.length(); i++) {
                JSONObject t = timers.getJSONObject(i);
                if (key.equals(t.optString("key"))) { t.put("endsAt", ends); found = true; }
                next.put(t);
            }
            if (!found) next.put(new JSONObject().put("key", key).put("title", title).put("target", target).put("endsAt", ends).put("route", routeOf(key)));
        } catch (Exception ignored) { /* the list as it was */ }
        sync(c, next);
    }

    static void cancel(Context c, String key) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(key, 1);
        JSONArray timers = list(c), next = new JSONArray();
        for (int i = 0; i < timers.length(); i++) if (!key.equals(timers.optJSONObject(i).optString("key"))) next.put(timers.optJSONObject(i));
        prefs(c).edit().putString("list", next.toString()).apply();
    }

    /** Take ended timers out of the list; true when there were any. */
    static boolean dropEnded(Context c) {
        JSONArray timers = list(c), next = new JSONArray();
        long now = System.currentTimeMillis();
        for (int i = 0; i < timers.length(); i++) {
            JSONObject t = timers.optJSONObject(i);
            if (t != null && t.optLong("endsAt") > now) next.put(t);
        }
        JSONObject ts = WidgetStore.state(c).optJSONObject("timers");
        boolean stateEnded = false;
        if (ts != null) {
            Iterator<String> keys = ts.keys();
            while (keys.hasNext()) { JSONObject t = ts.optJSONObject(keys.next()); if (t != null && t.optLong("ends") <= now) stateEnded = true; }
        }
        if (next.length() == timers.length() && !stateEnded) return false;
        prefs(c).edit().putString("list", next.toString()).apply();
        return true;
    }

    /** When the soonest shown timer ends, or 0 with none. */
    static long soonestShown(Context c) {
        JSONArray timers = list(c);
        long best = 0;
        for (int i = 0; i < timers.length(); i++) {
            long e = timers.optJSONObject(i).optLong("endsAt");
            if (e > System.currentTimeMillis() && (best == 0 || e < best)) best = e;
        }
        return WidgetStore.timerMode(c).equals("none") ? 0 : best;
    }

    private static JSONArray list(Context c) {
        try { return new JSONArray(prefs(c).getString("list", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    private static Notification build(Context c, String key, String title, String target, long ends, String route, String mode) {
        boolean live = mode.equals("live");
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_timer)
            .setContentTitle(title)
            .setContentText("Off at " + Widgets.clock(ends))
            .setWhen(ends)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(live)
            .setOnlyAlertOnce(true)
            .setColor(COPPER)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(Widgets.open(c, route, key.hashCode()))
            .addAction(new Notification.Action.Builder(null, "Off now", action(c, key, title, target, ends, TimerActionReceiver.OFF_NOW, 3)).build())
            .addAction(new Notification.Action.Builder(null, "Add 15 min", action(c, key, title, target, ends, TimerActionReceiver.ADD_15, 4)).build());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setChronometerCountDown(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(Math.max(1000, ends - System.currentTimeMillis() + 5000));
        if (live && Build.VERSION.SDK_INT >= 36) {
            // A Live Update: ongoing, titled, no custom views, not colorized, not a group summary, a promotable style,
            // and asked for (Notification.EXTRA_REQUEST_PROMOTED_ONGOING, set as the extra so it builds against any
            // Android 16 SDK). The status bar chip then shows the countdown from `when`.
            Bundle extras = new Bundle();
            extras.putBoolean("android.requestPromotedOngoing", true);
            b.addExtras(extras);
            b.setCategory(Notification.CATEGORY_PROGRESS);
            int total = total(c, key, ends);
            int left = (int) Math.max(0, (ends - System.currentTimeMillis()) / 1000);
            List<Notification.ProgressStyle.Segment> seg = new ArrayList<>();
            seg.add(new Notification.ProgressStyle.Segment(Math.max(1, total)).setColor(COPPER));
            b.setStyle(new Notification.ProgressStyle()
                .setStyledByProgress(true)
                .setProgressSegments(seg)
                .setProgressTrackerIcon(Icon.createWithResource(c, R.drawable.ic_timer))
                .setProgress(Math.max(0, Math.min(total, total - left))));
        }
        return b.build();
    }

    /**
     * How long a timer was set for, in seconds: the candle's full length. The hub only knows when it ends, so this
     * phone notes it the first time it sees the timer, and a later end (Add 15 min) lengthens it by as much.
     */
    private static int total(Context c, String key, long ends) {
        long now = System.currentTimeMillis();
        long seenEnds = prefs(c).getLong("ends:" + key, 0);
        int total = prefs(c).getInt("total:" + key, 0);
        if (seenEnds == 0 || total == 0 || seenEnds < now - 60000) total = (int) Math.max(60, (ends - now) / 1000);
        else if (ends != seenEnds) total = (int) Math.max(60, total + (ends - seenEnds) / 1000);
        prefs(c).edit().putLong("ends:" + key, ends).putInt("total:" + key, total).apply();
        return total;
    }

    private static PendingIntent action(Context c, String key, String title, String target, long ends, String what, int n) {
        Intent i = new Intent(c, TimerActionReceiver.class).setAction(what).putExtra("key", key).putExtra("title", title).putExtra("target", target).putExtra("endsAt", ends);
        return PendingIntent.getBroadcast(c, key.hashCode() * 8 + n, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Where a tap on a timer opens the app: the light's timer, or the room's. */
    static String routeOf(String key) {
        String first = key.split("\\|")[0];
        if (first.startsWith("d:")) return "light/" + first.substring(2) + "/timer";
        if (first.startsWith("a:")) return "room/" + first.substring(2) + "/timer";
        return "home";
    }

    /** What a timer is over, in words, from the app's model: a light, a room, "Lamp and 2 more". */
    private static String nameOf(Context c, String key) {
        JSONObject m = WidgetStore.model(c);
        String[] parts = key.split("\\|");
        String first = parts[0], name = null;
        if (first.startsWith("d:")) { JSONObject d = Widgets.find(m.optJSONArray("lights"), "id", first.substring(2)); if (d != null) name = d.optString("name"); }
        if (first.startsWith("a:")) { JSONObject r = Widgets.find(m.optJSONArray("rooms"), "id", first.substring(2)); if (r != null) name = r.optString("name"); }
        if (first.equals("h:all")) name = "The house";
        if (name == null) name = "A light";
        return parts.length > 1 ? name + " and " + (parts.length - 1) + " more" : name;
    }

    private static void channel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Sleep timers", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("A running sleep timer, with Off now and Add 15 min");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }
}
