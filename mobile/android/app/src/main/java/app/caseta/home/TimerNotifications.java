package app.caseta.home;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * One quiet notification per running sleep timer, the lock screen's view of the candle: "{Lamp} fades out at
 * {time}", a countdown, and two buttons, Off now and Add 15 min. Neither turns anything on. The app hands over the
 * whole list each time its timers change, so a finished or stopped timer's notification goes with it.
 */
final class TimerNotifications {
    static final String CHANNEL = "timers";
    private static final String PREFS = "timer-notes";

    private TimerNotifications() {}

    static void sync(Context c, JSONArray timers) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        channel(nm);
        Set<String> now = new HashSet<>();
        for (int i = 0; i < timers.length(); i++) {
            JSONObject t = timers.optJSONObject(i);
            if (t == null) continue;
            String key = t.optString("key");
            long ends = t.optLong("endsAt");
            if (key.isEmpty() || ends <= System.currentTimeMillis()) continue;
            now.add(key);
            show(c, key, t.optString("title", "Light"), t.optString("target", key), ends);
        }
        // anything shown before that is not running any more
        Set<String> was = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet("keys", new HashSet<>());
        for (String k : was) if (!now.contains(k)) nm.cancel(k, 1);
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet("keys", now).apply();
    }

    /** Show (or redraw) one timer's notification. */
    static void show(Context c, String key, String title, String target, long ends) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        channel(nm);
        String time = android.text.format.DateFormat.getTimeFormat(c).format(new java.util.Date(ends)).toLowerCase(java.util.Locale.ROOT);
        nm.notify(key, 1, build(c, key, title, target, time, ends));
    }

    static void cancel(Context c, String key) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(key, 1);
    }

    private static Notification build(Context c, String key, String title, String target, String time, long ends) {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_timer)
            .setContentTitle(title + " fades out at " + time)
            .setContentText("Sleep timer")
            .setWhen(ends)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(false)
            .setOnlyAlertOnce(true)
            .setColor(0xFFD98A4E)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(PendingIntent.getActivity(c, key.hashCode(), new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .addAction(new Notification.Action.Builder(null, "Off now", action(c, key, title, target, ends, TimerActionReceiver.OFF_NOW, 3)).build())
            .addAction(new Notification.Action.Builder(null, "Add 15 min", action(c, key, title, target, ends, TimerActionReceiver.ADD_15, 4)).build());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setChronometerCountDown(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(Math.max(1000, ends - System.currentTimeMillis()));
        return b.build();
    }

    private static PendingIntent action(Context c, String key, String title, String target, long ends, String what, int n) {
        Intent i = new Intent(c, TimerActionReceiver.class).setAction(what).putExtra("key", key).putExtra("title", title).putExtra("target", target).putExtra("endsAt", ends);
        return PendingIntent.getBroadcast(c, key.hashCode() * 8 + n, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void channel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Sleep timers", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("A running sleep timer, with Off now and Add 15 min");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }
}
