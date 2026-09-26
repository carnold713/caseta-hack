package app.caseta.home;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;

/**
 * A widget's configure step, when it is placed and when it is edited later (Android 12 and later offer that on a
 * long press). Nothing is drawn here: the widget is placed at once with its defaults and this hands over to the
 * app's own page for it (#widgets/<id>), where every choice shows on the home screen as it is made. That page's
 * Done goes back to the home screen. Finishing at once, rather than waiting for the page, means a slow sign-in or
 * a closed app can never leave a half-placed widget behind.
 */
public class WidgetConfigActivity extends Activity {
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        int id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { setResult(RESULT_CANCELED); finish(); return; }
        if (!WidgetStore.configured(this, id)) WidgetStore.setConfig(this, id, WidgetStore.config(this, id));
        Widgets.draw(this, AppWidgetManager.getInstance(this), id);
        WidgetRefreshJob.schedule(this);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        startActivity(new Intent(this, MainActivity.class)
            .putExtra(MainActivity.ROUTE, "widgets/" + id)
            .putExtra(MainActivity.FROM_WIDGET, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
        overridePendingTransition(0, 0);
    }
}
