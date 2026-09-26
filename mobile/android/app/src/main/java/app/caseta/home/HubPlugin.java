package app.caseta.home;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the web app tells the Android side (web/ui/native.js calls these through the Capacitor bridge):
 *   setCredentials / clearCredentials   the hub and the sign-in, for the tile, the widget and the notifications
 *   house                               lights on and how bright, as the app draws it, for the widget
 *   timers                              the running sleep timers, for their notifications
 *   notifications / askNotifications    whether the lock screen may show them (Android 13 asks once)
 *   backable                            whether back has anywhere to go in the page (MainActivity, predictive back)
 *   widgetData                          the home as the widgets draw it: rooms, lights, scenes, pins, routines, levels
 *   widgets / widget / setWidget        the placed widgets and each one's choices, for the app's Widgets page
 *   addWidget / widgetDone              put a widget on the home screen from the app; Done on a widget's page
 *   phone / setPhone                    this phone's own choices: how a running timer shows (status bar, quiet, none)
 */
@CapacitorPlugin(
    name = "Hub",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class HubPlugin extends Plugin {

    @PluginMethod
    public void setCredentials(PluginCall call) {
        String url = call.getString("url"), token = call.getString("token");
        if (url == null || token == null || token.isEmpty()) { call.reject("url and token"); return; }
        HubStore.setCredentials(getContext(), url, token);
        HouseWidget.refreshSoon(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearCredentials(PluginCall call) {
        HubStore.clear(getContext());
        TimerNotifications.sync(getContext(), new org.json.JSONArray());
        HouseWidget.refreshSoon(getContext());
        call.resolve();
    }

    @PluginMethod
    public void house(PluginCall call) {
        HubStore.setHouse(getContext(), call.getInt("on", 0), call.getInt("level", 0));
        HouseWidget.refreshSoon(getContext());
        call.resolve();
    }

    @PluginMethod
    public void timers(PluginCall call) {
        JSArray list = call.getArray("list", new JSArray());
        if (notificationsAllowed()) TimerNotifications.sync(getContext(), list);
        call.resolve();
    }

    @PluginMethod
    public void backable(PluginCall call) {
        boolean can = Boolean.TRUE.equals(call.getBoolean("can", true));
        // plugin calls arrive off the main thread; the back callback lives on it
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).setPageCanGoBack(can);
        });
        call.resolve();
    }

    // ---------- the widgets ----------
    @PluginMethod
    public void widgetData(PluginCall call) {
        Context c = getContext();
        JSObject model = call.getObject("model", null), state = call.getObject("state", null);
        if (model != null) WidgetStore.setModel(c, model);
        if (state != null) {
            WidgetStore.setState(c, state);
            JSONObject h = state.optJSONObject("house");
            if (h != null) HubStore.setHouse(c, h.optInt("on"), h.optInt("level"));
        }
        Widgets.updateAll(c);
        if (Widgets.count(c) > 0) WidgetRefreshJob.schedule(c);
        TimerTick.schedule(c);
        if (model != null) Widgets.previews(c);
        call.resolve();
    }

    @PluginMethod
    public void widgets(PluginCall call) {
        Context c = getContext();
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        JSArray list = new JSArray();
        for (String k : Widgets.KINDS) {
            for (int id : m.getAppWidgetIds(new ComponentName(c, Widgets.providerOf(k)))) list.put(one(c, id));
        }
        JSObject r = new JSObject();
        r.put("list", list);
        r.put("canAdd", Build.VERSION.SDK_INT >= 26 && m.isRequestPinAppWidgetSupported());
        call.resolve(r);
    }

    @PluginMethod
    public void widget(PluginCall call) {
        int id = call.getInt("id", 0);
        if (AppWidgetManager.getInstance(getContext()).getAppWidgetInfo(id) == null) { call.reject("no such widget"); return; }
        call.resolve(one(getContext(), id));
    }

    @PluginMethod
    public void setWidget(PluginCall call) {
        int id = call.getInt("id", 0);
        JSObject cfg = call.getObject("cfg", null);
        Context c = getContext();
        if (cfg == null || AppWidgetManager.getInstance(c).getAppWidgetInfo(id) == null) { call.reject("no such widget"); return; }
        WidgetStore.setConfig(c, id, cfg);
        Widgets.draw(c, AppWidgetManager.getInstance(c), id);
        call.resolve(one(c, id));
    }

    /** Put one of the ten on the home screen: Android asks where, then the app opens on its page (MainActivity). */
    @PluginMethod
    public void addWidget(PluginCall call) {
        Context c = getContext();
        Class<?> p = Widgets.providerOf(call.getString("kind", ""));
        JSObject r = new JSObject();
        boolean asked = false;
        if (p != null && Build.VERSION.SDK_INT >= 26) {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            if (m.isRequestPinAppWidgetSupported()) {
                // mutable: Android adds the new widget's id to it
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                Intent open = new Intent(c, MainActivity.class).setAction("app.caseta.home.WIDGET_ADDED").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                asked = m.requestPinAppWidget(new ComponentName(c, p), null, PendingIntent.getActivity(c, 5, open, flags));
            }
        }
        r.put("asked", asked);
        call.resolve(r);
    }

    @PluginMethod
    public void widgetDone(PluginCall call) {
        JSObject r = new JSObject();
        boolean[] left = { false };
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) left[0] = ((MainActivity) getActivity()).widgetDone();
            r.put("left", left[0]);
            call.resolve(r);
        });
    }

    private static JSObject one(Context c, int id) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("kind", WidgetStore.kindOf(c, id));
        o.put("cfg", WidgetStore.config(c, id));
        return o;
    }

    // ---------- this phone ----------
    @PluginMethod
    public void phone(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("timerMode", WidgetStore.timerMode(c));
        r.put("notifications", notificationsAllowed());
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        // Android 16 and later: whether this app's Live Updates are allowed (the system's own switch for it)
        r.put("liveUpdates", Build.VERSION.SDK_INT >= 36 && nm != null && nm.canPostPromotedNotifications());
        r.put("android", Build.VERSION.SDK_INT);
        r.put("widgets", Widgets.count(c));
        r.put("canAdd", Build.VERSION.SDK_INT >= 26 && AppWidgetManager.getInstance(c).isRequestPinAppWidgetSupported());
        call.resolve(r);
    }

    @PluginMethod
    public void setPhone(PluginCall call) {
        String mode = call.getString("timerMode", "");
        if (mode.equals("live") || mode.equals("quiet") || mode.equals("none")) {
            WidgetStore.setTimerMode(getContext(), mode);
            TimerNotifications.redraw(getContext());
        }
        phone(call);
    }

    @PluginMethod
    public void notifications(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", notificationsAllowed());
        call.resolve(r);
    }

    @PluginMethod
    public void askNotifications(PluginCall call) {
        if (notificationsAllowed()) { notifications(call); return; }
        requestPermissionForAlias("notifications", call, "afterAsk");
    }

    @PermissionCallback
    private void afterAsk(PluginCall call) {
        notifications(call);
    }

    private boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return getPermissionState("notifications") == PermissionState.GRANTED;
    }
}
