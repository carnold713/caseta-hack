package app.caseta.home;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/**
 * The two buttons on a sleep timer's notification. Off now stops the timer and turns its lights off; Add 15 min
 * starts it again a quarter of an hour longer than what was left. The same commands the timer sheet sends. The
 * widgets are redrawn from the hub afterwards.
 */
public class TimerActionReceiver extends BroadcastReceiver {
    static final String OFF_NOW = "app.caseta.home.TIMER_OFF_NOW";
    static final String ADD_15 = "app.caseta.home.TIMER_ADD_15";

    @Override
    public void onReceive(Context c, Intent intent) {
        String key = intent.getStringExtra("key"), target = intent.getStringExtra("target");
        if (key == null || target == null) return;
        PendingResult done = goAsync();
        new Thread(() -> {
            try {
                Object t = HubClient.target(target);
                if (OFF_NOW.equals(intent.getAction())) {
                    HubClient.command(c, new JSONObject().put("type", "cancel_timer").put("target", t));
                    HubClient.command(c, new JSONObject().put("type", "level").put("target", t).put("level", "off"));
                    TimerNotifications.cancel(c, key);
                } else if (ADD_15.equals(intent.getAction())) {
                    long left = intent.getLongExtra("endsAt", 0);
                    int minutes = 15 + (left > 0 ? (int) Math.max(0, (left - System.currentTimeMillis()) / 60000) : minutesLeft(c, key));
                    HubClient.Result r = HubClient.command(c, new JSONObject().put("type", "timer").put("target", t).put("minutes", minutes));
                    // the countdown on the lock screen follows at once, even with the app closed
                    if (r.ok()) TimerNotifications.show(c, key, intent.getStringExtra("title") == null ? "Light" : intent.getStringExtra("title"), target, System.currentTimeMillis() + minutes * 60000L);
                }
                // the widgets follow, and the notifications settle on what the hub says
                Thread.sleep(900);
                WidgetActions.refreshNow(c);
            } catch (Throwable t) {
                // the app shows the timer as it really is next time it opens
                Safe.note(c, "timer button", t);
            } finally { done.finish(); }
        }).start();
    }

    /** What is left on a timer, from the hub's own list (the notification's countdown is only a picture). */
    private static int minutesLeft(Context c, String key) {
        HubClient.Result r = HubClient.request(c, "GET", "/api/snapshot", null);
        try {
            JSONObject t = new JSONObject(r.body).getJSONObject("timers").getJSONObject(key);
            long ends = t.optLong("ends_at") * 1000;
            return (int) Math.max(0, (ends - System.currentTimeMillis()) / 60000);
        } catch (Exception e) {
            return 0;
        }
    }
}
