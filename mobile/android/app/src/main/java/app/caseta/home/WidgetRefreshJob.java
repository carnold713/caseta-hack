package app.caseta.home;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * The widgets reading the hub by themselves, every 15 minutes (the shortest Android allows) while any widget is
 * placed and there is a network. Between those, the app hands the widgets every change while it is open, and each
 * tap on a widget reads the hub again after acting.
 */
public class WidgetRefreshJob extends JobService {
    private static final int ID = 4331;

    static void schedule(Context c) {
        try {
            JobScheduler js = c.getSystemService(JobScheduler.class);
            if (js == null || js.getPendingJob(ID) != null) return;
            JobInfo.Builder b = new JobInfo.Builder(ID, new ComponentName(c, WidgetRefreshJob.class)).setPeriodic(15 * 60 * 1000L);
            try {
                js.schedule(b.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build());
            } catch (SecurityException e) {
                // without the network permission (Android 14 and later): read every 15 minutes regardless
                js.schedule(b.setRequiredNetworkType(JobInfo.NETWORK_TYPE_NONE).build());
            }
        } catch (Throwable t) {
            Safe.note(c, "widget job", t);
        }
    }

    static void cancel(Context c) {
        Safe.run(c, "widget job cancel", () -> {
            JobScheduler js = c.getSystemService(JobScheduler.class);
            if (js != null) js.cancel(ID);
        });
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        boolean[] go = { false };
        Safe.run(this, "widget job", () -> {
            if (Widgets.count(this) == 0 || !HubStore.signedIn(this)) cancelIfEmpty(); else go[0] = true;
        });
        if (!go[0]) return false;
        new Thread(() -> {
            try { WidgetActions.refreshNow(this); } finally { jobFinished(params, false); }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private void cancelIfEmpty() {
        if (Widgets.count(this) == 0) cancel(this);
    }
}
