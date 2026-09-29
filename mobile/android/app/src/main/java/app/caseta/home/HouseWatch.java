package app.caseta.home;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/**
 * The house computer going quiet, said once. The remotes' presses are the house computer's to act on, so when it is
 * off they do nothing, and nothing else on the phone says why. The hub knows when it went (agent.offline_since in
 * /api/snapshot); this reads that every 15 minutes (WidgetRefreshJob) and whenever a widget reads the hub anyway.
 *
 *   offline 5 minutes   one notification: "House computer is offline", "Since 2:09 pm. The remotes need it." A tap
 *                       opens the app's connection sheet. Its own channel, House computer, default importance.
 *   back                if that notification is still showing, it becomes "House computer is back", silently, and
 *                       goes by itself after half an hour. If it was swiped away, nothing: it was already seen.
 *
 * One per outage: the outage is the hub's offline_since, and once told, a later offline_since is the same outage
 * unless the phone saw the house computer back in between, or six hours have passed. A connector that drops and
 * returns between two reads is never seen coming back, and would otherwise be told again on every read.
 *
 * On unless turned off in Settings, This phone (HubPlugin.setPhone). Needs notifications allowed; until they are,
 * nothing is marked told, so allowing them during an outage still shows it.
 */
final class HouseWatch {
    static final String CHANNEL = "house";
    private static final String TAG = "house-computer";
    private static final int ID = 1;
    private static final String PREFS = "house-watch";
    static final long QUIET_MS = 5 * 60 * 1000L;
    private static final long SAME_OUTAGE_MS = 6 * 60 * 60 * 1000L;
    private static final long BACK_SHOWN_MS = 30 * 60 * 1000L;
    private static final int COPPER = 0xFFD98A4E;

    private HouseWatch() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean on(Context c) { return prefs(c).getBoolean("on", true); }

    static void setOn(Context c, boolean on) {
        prefs(c).edit().putBoolean("on", on).apply();
        if (!on) forget(c);
    }

    /** Whether there is anything to watch: switched on, and a sign-in to read the hub with. */
    static boolean wanted(Context c) { return on(c) && HubStore.signedIn(c); }

    /** Take the notification down and forget the outage (turned off, or signed out). */
    static void forget(Context c) {
        prefs(c).edit().remove("told").apply();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) Safe.run(c, "house watch", () -> nm.cancel(TAG, ID));
    }

    /** Read the hub and act on it. Blocking: call it off the main thread. */
    static void check(Context c) {
        if (!wanted(c)) return;
        HubClient.Result r = HubClient.request(c, "GET", "/api/snapshot", null);
        if (r.ok()) fromSnapshot(c, r.body);
    }

    /** Act on a snapshot already read (the widgets read the same one). An unreachable hub says nothing either way. */
    static void fromSnapshot(Context c, String body) {
        Safe.run(c, "house watch", () -> {
            if (!wanted(c)) return;
            JSONObject agent;
            try { agent = new JSONObject(body).optJSONObject("agent"); } catch (Exception e) { return; }
            if (agent == null) return;
            SharedPreferences p = prefs(c);
            String told = p.getString("told", "");
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm == null) return;
            if (agent.optBoolean("online", false)) {
                if (told.isEmpty()) return;
                p.edit().remove("told").apply();
                if (showing(nm)) notify(c, nm, back(c));
                return;
            }
            String since = agent.isNull("offline_since") ? "" : agent.optString("offline_since", "");
            long t = parse(since);
            long now = System.currentTimeMillis();
            if (t <= 0 || now - t < QUIET_MS || since.equals(told)) return;
            if (!told.isEmpty() && t - parse(told) < SAME_OUTAGE_MS) return;
            if (!nm.areNotificationsEnabled()) return;
            notify(c, nm, offline(c, t));
            p.edit().putString("told", since).apply();
        });
    }

    private static boolean showing(NotificationManager nm) {
        for (StatusBarNotification n : nm.getActiveNotifications()) if (TAG.equals(n.getTag()) && n.getId() == ID) return true;
        return false;
    }

    private static void notify(Context c, NotificationManager nm, Notification n) {
        channel(c, nm);
        nm.notify(TAG, ID, n);
    }

    private static Notification.Builder builder(Context c) {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        return b.setSmallIcon(R.drawable.wi_home)
            .setColor(COPPER)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(Widgets.open(c, "settings/connection", TAG.hashCode()));
    }

    private static Notification offline(Context c, long since) {
        return builder(c)
            .setContentTitle("House computer is offline")
            .setContentText("Since " + when(c, since) + ". The remotes need it.")
            .setWhen(since)
            .setCategory(Notification.CATEGORY_STATUS)
            .build();
    }

    private static Notification back(Context c) {
        Notification.Builder b = builder(c)
            .setContentTitle("House computer is back")
            .setWhen(System.currentTimeMillis())
            .setOnlyAlertOnce(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(BACK_SHOWN_MS);
        return b.build();
    }

    /** "2:09 pm" today (14:09 on a phone set to 24 hours), "yesterday, 2:09 pm", or the weekday before that. */
    static String when(Context c, long t) {
        Calendar k = Calendar.getInstance(), now = Calendar.getInstance();
        k.setTimeInMillis(t);
        boolean h24 = android.text.format.DateFormat.is24HourFormat(c);
        String time = h24 ? String.format(Locale.US, "%d:%02d", k.get(Calendar.HOUR_OF_DAY), k.get(Calendar.MINUTE))
            : String.format(Locale.US, "%d:%02d %s", k.get(Calendar.HOUR) == 0 ? 12 : k.get(Calendar.HOUR), k.get(Calendar.MINUTE), k.get(Calendar.AM_PM) == Calendar.PM ? "pm" : "am");
        int days = (int) Math.round((startOfDay(now) - startOfDay(k)) / 86400000.0);
        if (days <= 0) return time;
        if (days == 1) return "yesterday, " + time;
        return k.getDisplayName(Calendar.DAY_OF_WEEK, Calendar.LONG, Locale.getDefault());
    }

    private static long startOfDay(Calendar k) {
        Calendar d = (Calendar) k.clone();
        d.set(Calendar.HOUR_OF_DAY, 0); d.set(Calendar.MINUTE, 0); d.set(Calendar.SECOND, 0); d.set(Calendar.MILLISECOND, 0);
        return d.getTimeInMillis();
    }

    /** The hub's ISO time ("2026-09-29T14:09:31.123Z"), in milliseconds; 0 when it is not one. */
    static long parse(String iso) {
        if (iso == null || iso.isEmpty()) return 0;
        String s = iso.endsWith("Z") ? iso.substring(0, iso.length() - 1) : iso;
        String[] shapes = { "yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ss" };
        for (String shape : shapes) {
            try {
                SimpleDateFormat f = new SimpleDateFormat(shape, Locale.US);
                f.setTimeZone(TimeZone.getTimeZone("UTC"));
                f.setLenient(false);
                java.util.Date d = f.parse(s);
                if (d != null) return d.getTime();
            } catch (Exception ignored) { /* the next shape */ }
        }
        return 0;
    }

    private static void channel(Context c, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "House computer", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("When the house computer has been offline a while, and when it is back");
        nm.createNotificationChannel(ch);
    }
}
