package app.caseta.home;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

/**
 * The house on the home screen: how many lights are on and how bright, and one button, All off. A tap anywhere
 * else opens the app. It shows what the app last drew at once (HubStore.setHouse, pushed while the app is open) and
 * asks the hub itself when Android refreshes it and after its own button. Like the tile, it never turns anything on.
 */
public class HouseWidget extends AppWidgetProvider {
    static final String ALL_OFF = "app.caseta.home.WIDGET_ALL_OFF";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        draw(c, null);
        PendingResult done = goAsync();
        new Thread(() -> {
            try {
                int[] h = HubClient.house(c);
                if (h != null) HubStore.setHouse(c, h[0], h[1]);
                draw(c, h == null && HubStore.signedIn(c) ? "Can't reach the house" : null);
            } finally { done.finish(); }
        }).start();
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (!ALL_OFF.equals(intent.getAction())) return;
        if (!HubStore.signedIn(c)) { open(c); return; }
        draw(c, "Turning off");
        PendingResult done = goAsync();
        new Thread(() -> {
            try {
                HubClient.Result r = HubClient.allOff(c);
                if (r.ok()) HubStore.setHouse(c, 0, 0);
                draw(c, r.ok() ? null : r.status == 0 ? "Can't reach the house" : "Didn't work, try again");
            } finally { done.finish(); }
        }).start();
    }

    /** Redraw every widget from what is stored (after the app pushes the house, or the tile acts). */
    static void refreshSoon(Context c) { draw(c, null); }

    static void draw(Context c, String note) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, HouseWidget.class));
        if (ids.length == 0) return;
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.house_widget);
        int on = HubStore.on(c);
        String headline, sub;
        if (!HubStore.signedIn(c)) { headline = "Caseta"; sub = "Open the app to sign in"; }
        else if (on < 0) { headline = "Your home"; sub = "Tap to open"; }
        else if (on == 0) { headline = "All off"; sub = "Nothing is on right now"; }
        else { headline = on + " on · " + HubStore.level(c) + "%"; sub = on == 1 ? "1 light is on" : on + " lights are on"; }
        v.setTextViewText(R.id.w_headline, headline);
        v.setTextViewText(R.id.w_sub, note != null ? note : sub);
        // the glow behind the headline is light that is on: none at all when the house is dark
        v.setViewVisibility(R.id.w_glow, on > 0 ? View.VISIBLE : View.INVISIBLE);
        v.setViewVisibility(R.id.w_off, HubStore.signedIn(c) ? View.VISIBLE : View.GONE);
        Intent offI = new Intent(c, HouseWidget.class).setAction(ALL_OFF);
        v.setOnClickPendingIntent(R.id.w_off, PendingIntent.getBroadcast(c, 1, offI, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        Intent openI = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 2, openI, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        m.updateAppWidget(ids, v);
    }

    private static void open(Context c) {
        c.startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
}
