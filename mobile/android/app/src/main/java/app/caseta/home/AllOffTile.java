package app.caseta.home;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * All off in the quick settings shade. Turning lights off is always safe, so it acts at once, from the lock screen
 * too, with no need to open the app; nothing in the shade ever turns a light on. Not signed in yet, a tap opens the
 * app instead.
 */
public class AllOffTile extends TileService {
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void onStartListening() {
        show(HubStore.signedIn(this) ? "Every light" : "Sign in first", Tile.STATE_INACTIVE);
    }

    @Override
    public void onClick() {
        if (!HubStore.signedIn(this)) { openApp(); return; }
        show("Turning off", Tile.STATE_ACTIVE);
        new Thread(() -> {
            HubClient.Result r = HubClient.allOff(this);
            if (r.ok()) HubStore.setHouse(this, 0, 0);
            main.post(() -> {
                show(r.ok() ? "Everything off" : r.status == 0 ? "Can't reach the house" : "Didn't work, try again", Tile.STATE_INACTIVE);
                if (r.ok()) HouseWidget.refreshSoon(this);
            });
            // the widgets settle on what the hub says once the lights have gone out
            if (r.ok()) { try { Thread.sleep(900); } catch (InterruptedException ignored) { /* now then */ } WidgetActions.refreshNow(this); }
        }).start();
    }

    private void show(String subtitle, int state) {
        Tile t = getQsTile();
        if (t == null) return;
        t.setLabel("All off");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) t.setSubtitle(subtitle);
        t.setState(state);
        t.updateTile();
    }

    private void openApp() {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
