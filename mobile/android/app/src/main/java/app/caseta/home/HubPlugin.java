package app.caseta.home;

import android.Manifest;
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

/**
 * What the web app tells the Android side (web/ui/native.js calls these through the Capacitor bridge):
 *   setCredentials / clearCredentials   the hub and the sign-in, for the tile, the widget and the notifications
 *   house                               lights on and how bright, as the app draws it, for the widget
 *   timers                              the running sleep timers, for their notifications
 *   notifications / askNotifications    whether the lock screen may show them (Android 13 asks once)
 *   backable                            whether back has anywhere to go in the page (MainActivity, predictive back)
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
