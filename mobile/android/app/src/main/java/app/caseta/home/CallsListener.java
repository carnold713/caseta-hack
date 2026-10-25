package app.caseta.home;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.provider.Telephony;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Calls and texts on the lights: with notification access (Settings, Calls and texts), Android hands this every
 * notification as it is posted and taken away, and this tells the hub of the three it cares about (POST /api/alert,
 * hub/alerts.js decides the rest):
 *   a call starts ringing   a notification of the "call" kind that is an incoming one (Android 12's call style says
 *                           so outright; before it, an incoming call is the one with a full screen and no timer)
 *   a call stops ringing    the same notification answered (it becomes the ongoing call) or taken away
 *   a text                  a notification of the "message" kind whose newest message is from someone else, newer
 *                           than the last one seen for that conversation (an app redraws a conversation's
 *                           notification for all sorts of reasons, and a reply typed into it is the person's own)
 *   anything else           from an app given a look of its own (Calls and texts, Apps: AlertApps holds which),
 *                           when it would make a sound or show itself, new or alerting again
 * Each carries the sender's name (for a person's own colour), the app it came from, whether that is the phone's own
 * texting app, and whether Do Not Disturb would have kept it quiet. Never what a message says. Every app that
 * notifies is also noted on the phone (AlertApps), so the app's page can offer the ones that do.
 *
 * Notification access is this phone's switch: nothing is sent without it, and the hub's settings say whether and how
 * the lights show it. Android calls these on the main thread; the hub is told on one thread of its own, in order, so
 * a call's stop never overtakes its start.
 */
public class CallsListener extends NotificationListenerService {
    // Android 12's Notification.CallStyle: EXTRA_CALL_TYPE, and its incoming kind
    private static final String EXTRA_CALL_TYPE = "android.callType";
    private static final int CALL_TYPE_INCOMING = 1;
    private static final ExecutorService SEND = Executors.newSingleThreadExecutor();

    private final Map<String, String> ringing = new HashMap<>();   // notification key -> the id the hub knows it by
    private final Map<String, Long> seen = new HashMap<>();        // conversation's key -> its newest message's time
    private final Map<String, Long> shown = new HashMap<>();       // another notification's key -> when it last showed

    /** Whether this phone has given the app notification access. */
    static boolean allowed(Context c) {
        String on = android.provider.Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
        return on != null && on.contains(new ComponentName(c, CallsListener.class).flattenToString());
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn, RankingMap ranking) {
        Safe.run(this, "calls and texts", () -> posted(sbn, ranking));
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        Safe.run(this, "calls and texts", () -> {
            String id = ringing.remove(sbn.getKey());
            if (id != null) send("call", "stop", id, null, sbn.getPackageName(), true, false);
            seen.remove(sbn.getKey());
            shown.remove(sbn.getKey());
        });
    }

    private void posted(StatusBarNotification sbn, RankingMap ranking) {
        if (!HubStore.signedIn(this) || getPackageName().equals(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        if (n == null) return;
        String key = sbn.getKey();
        String app = sbn.getPackageName();
        boolean ongoing = (n.flags & Notification.FLAG_ONGOING_EVENT) != 0;
        if (!ongoing) AlertApps.noticed(this, app);
        if (Notification.CATEGORY_CALL.equals(n.category)) {
            boolean incoming = incoming(n);
            if (incoming && !ringing.containsKey(key)) {
                String id = hash(key + sbn.getPostTime());
                ringing.put(key, id);
                send("call", "start", id, title(n), app, true, quiet(sbn, ranking));
            } else if (!incoming && ringing.containsKey(key)) {
                send("call", "stop", ringing.remove(key), null, app, true, false);
            }
            return;
        }
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0 || ongoing) return;
        if (System.currentTimeMillis() - sbn.getPostTime() > 60_000) return;
        if (!Notification.CATEGORY_MESSAGE.equals(n.category)) {
            other(sbn, n, ranking, key, app);
            return;
        }
        Bundle last = lastMessage(n);
        // a reply typed into the notification is the person's own: no sender
        if (last != null && !last.containsKey("sender") && !last.containsKey("sender_person")) return;
        long at = last != null ? last.getLong("time", n.when) : n.when;
        Long before = seen.get(key);
        if (before != null && at <= before) return;
        seen.put(key, at);
        String from = last != null ? sender(last) : null;
        String sms = Telephony.Sms.getDefaultSmsPackage(this);
        send("text", "start", hash(key), from != null ? from : title(n), app, sms != null && sms.equals(app), quiet(sbn, ranking));
    }

    /** Anything else, from an app with a look of its own: when it alerts (a sound or a peek), not when it is redrawn. */
    private void other(StatusBarNotification sbn, Notification n, RankingMap ranking, String key, String app) {
        if (!AlertApps.chosen(this, app)) return;
        if (ranking != null) {
            Ranking r = new Ranking();
            if (ranking.getRanking(key, r) && r.getImportance() < android.app.NotificationManager.IMPORTANCE_DEFAULT) return;
        }
        Long before = shown.get(key);
        if (before != null && ((n.flags & Notification.FLAG_ONLY_ALERT_ONCE) != 0 || sbn.getPostTime() - before < 3000)) return;
        shown.put(key, sbn.getPostTime());
        send("app", "start", hash(key + sbn.getPostTime()), title(n), app, false, quiet(sbn, ranking));
    }

    private static boolean incoming(Notification n) {
        Bundle x = n.extras;
        if (x != null && x.containsKey(EXTRA_CALL_TYPE)) return x.getInt(EXTRA_CALL_TYPE) == CALL_TYPE_INCOMING;
        return n.fullScreenIntent != null && (x == null || !x.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
    }

    private static Bundle lastMessage(Notification n) {
        if (n.extras == null) return null;
        Parcelable[] list = n.extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (list == null || list.length == 0 || !(list[list.length - 1] instanceof Bundle)) return null;
        return (Bundle) list[list.length - 1];
    }

    @SuppressWarnings("deprecation")
    private static String sender(Bundle m) {
        CharSequence s = m.getCharSequence("sender");
        if (s != null) return s.toString();
        if (Build.VERSION.SDK_INT >= 28) {
            Object p = m.get("sender_person");
            if (p instanceof android.app.Person && ((android.app.Person) p).getName() != null) return ((android.app.Person) p).getName().toString();
        }
        return null;
    }

    private static String title(Notification n) {
        CharSequence t = n.extras == null ? null : n.extras.getCharSequence(Notification.EXTRA_TITLE);
        return t == null ? "" : t.toString();
    }

    /** Whether Do Not Disturb keeps this one quiet (a person or app let through it is not). */
    private static boolean quiet(StatusBarNotification sbn, RankingMap ranking) {
        if (ranking == null) return false;
        Ranking r = new Ranking();
        return ranking.getRanking(sbn.getKey(), r) && !r.matchesInterruptionFilter();
    }

    private void send(String kind, String state, String id, String from, String app, boolean sms, boolean quiet) {
        final Context c = getApplicationContext();
        SEND.execute(() -> Safe.run(c, "calls and texts to the hub", () -> {
            try {
                JSONObject b = new JSONObject().put("kind", kind).put("state", state).put("key", id).put("sms", sms).put("dnd", quiet).put("app", app);
                if (from != null && !from.isEmpty()) b.put("from", from.length() > 60 ? from.substring(0, 60) : from);
                HubClient.request(c, "POST", "/api/alert", b.toString());
            } catch (Exception e) {
                Safe.note(c, "calls and texts to the hub", e);
            }
        }));
    }

    /** A notification's key as an id the hub accepts, without the app's name or anything else in it. */
    private static String hash(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < 8; i++) b.append(String.format("%02x", d[i]));
            return b.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
