package app.caseta.home;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

import java.util.Iterator;

/**
 * A running sleep timer's clock, while one runs. Every minute on Android 16 and later, so the Live Update's candle
 * burns down in step with its countdown (the countdown itself runs by itself); and just after each timer ends, so the
 * widgets and the notifications let it go and show the lights as they are. Inexact on purpose: no exact alarm
 * permission, and nothing is lost when a tick lands a few seconds late.
 */
public class TimerTick extends BroadcastReceiver {
    static final String TICK = "app.caseta.home.TIMER_TICK";

    @Override
    public void onReceive(Context c, Intent intent) {
        PendingResult done = goAsync();
        new Thread(() -> {
            try {
                boolean ended = TimerNotifications.dropEnded(c);
                if (ended && HubStore.signedIn(c)) WidgetActions.refreshNow(c);
                else { TimerNotifications.redraw(c); Widgets.updateAll(c); }
            } finally {
                schedule(c);
                done.finish();
            }
        }).start();
    }

    /** The next tick: in a minute while a Live Update shows, else just after the soonest timer ends; none without one. */
    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(c, 7, new Intent(c, TimerTick.class).setAction(TICK), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        long now = System.currentTimeMillis(), next = Long.MAX_VALUE;
        JSONObject ts = WidgetStore.state(c).optJSONObject("timers");
        if (ts != null) {
            Iterator<String> keys = ts.keys();
            while (keys.hasNext()) {
                JSONObject t = ts.optJSONObject(keys.next());
                long ends = t == null ? 0 : t.optLong("ends");
                if (ends > now - 60000) next = Math.min(next, Math.max(now + 5000, ends + 3000));
            }
        }
        long shown = TimerNotifications.soonestShown(c);
        if (shown > 0) {
            next = Math.min(next, Math.max(now + 5000, shown + 3000));
            if (Build.VERSION.SDK_INT >= 36 && "live".equals(WidgetStore.timerMode(c))) next = Math.min(next, now + 60000);
        }
        if (next == Long.MAX_VALUE) { am.cancel(pi); return; }
        am.setWindow(AlarmManager.RTC, next, 20000, pi);
    }
}
