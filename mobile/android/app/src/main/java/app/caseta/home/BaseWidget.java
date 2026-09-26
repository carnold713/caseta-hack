package app.caseta.home;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

import org.json.JSONObject;

/**
 * What the ten widgets share (Widgets.java draws them). Android asks for a redraw when a widget is placed, resized or
 * its half-hourly update comes round; each time it is drawn at once from what is stored, and the hub is read for
 * what is true now if that was not done in the last minute. A periodic job reads it every 15 minutes besides
 * (WidgetRefreshJob), and every tap reads it again after acting (WidgetActions).
 */
public abstract class BaseWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) Widgets.draw(c, m, id);
        WidgetRefreshJob.schedule(c);
        if (!HubStore.signedIn(c) || System.currentTimeMillis() - WidgetStore.state(c).optLong("at") < 60000) return;
        PendingResult done = goAsync();
        new Thread(() -> {
            try { WidgetActions.refreshNow(c); } finally { done.finish(); }
        }).start();
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        Widgets.draw(c, m, id);
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        for (int id : ids) WidgetStore.remove(c, id);
    }

    @Override
    public void onEnabled(Context c) {
        WidgetRefreshJob.schedule(c);
    }

    @Override
    public void onDisabled(Context c) {
        if (Widgets.count(c) == 0) WidgetRefreshJob.cancel(c);
    }

    /** A home screen restored from a backup brings its widgets back under new ids: their configs follow them. */
    @Override
    public void onRestored(Context c, int[] oldIds, int[] newIds) {
        for (int i = 0; i < oldIds.length && i < newIds.length; i++) {
            if (!WidgetStore.configured(c, oldIds[i])) continue;
            JSONObject cfg = WidgetStore.config(c, oldIds[i]);
            WidgetStore.setConfig(c, newIds[i], cfg);
            WidgetStore.remove(c, oldIds[i]);
        }
    }
}
