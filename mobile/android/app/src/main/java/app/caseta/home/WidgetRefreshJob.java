package app.caseta.home;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * This phone reading the hub by itself, every 15 minutes (the shortest Android allows) while there is a network, for
 * two things: the widgets, while any is placed, and the house computer (HouseWatch), while this phone is signed in
 * and that is switched on. One job and one read for both. Between runs, the app hands the widgets every change
 * while it is open, and each tap on a widget reads the hub again after acting.
 *
 * It survives a restart of the phone (persisted), so the house computer is still watched before the app is opened.
 */
public class WidgetRefreshJob extends JobService {
    private static final int ID = 4331;

    /** Whether the job has anything to do. */
    static boolean wanted(Context c) {
        return Widgets.count(c) > 0 || HouseWatch.wanted(c);
    }

    /** Scheduled while it is wanted, cancelled once it is not: after a sign in or out, a widget removed, a switch. */
    static void sync(Context c) {
        boolean[] want = { false };
        Safe.run(c, "phone job", () -> want[0] = wanted(c));
        if (want[0]) schedule(c); else cancel(c);
    }

    static void schedule(Context c) {
        try {
            JobScheduler js = c.getSystemService(JobScheduler.class);
            if (js == null) return;
            // Already there. One scheduled before it was persisted is scheduled again, once, so it survives a restart:
            // only once, since scheduling again starts its 15 minutes over, and the app schedules it on every change.
            JobInfo pending = js.getPendingJob(ID);
            android.content.SharedPreferences p = c.getApplicationContext().getSharedPreferences("phone-job", Context.MODE_PRIVATE);
            if (pending != null && (pending.isPersisted() || p.getBoolean("persistAsked", false))) return;
            p.edit().putBoolean("persistAsked", true).apply();
            JobInfo.Builder b = new JobInfo.Builder(ID, new ComponentName(c, WidgetRefreshJob.class)).setPeriodic(15 * 60 * 1000L);
            try {
                b.setPersisted(true);
            } catch (Throwable t) {
                Safe.note(c, "widget job persisted", t);
            }
            try {
                js.schedule(b.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build());
            } catch (SecurityException e) {
                // without the network permission (Android 14 and later): read every 15 minutes regardless
                js.schedule(b.setRequiredNetworkType(JobInfo.NETWORK_TYPE_NONE).build());
            } catch (IllegalArgumentException e) {
                // a phone that will not keep it through a restart: the next widget update or app start puts it back
                js.schedule(b.setPersisted(false).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build());
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
        boolean[] widgets = { false }, house = { false };
        Safe.run(this, "widget job", () -> {
            widgets[0] = Widgets.count(this) > 0 && HubStore.signedIn(this);
            house[0] = HouseWatch.wanted(this);
            if (!wanted(this)) cancel(this);
        });
        if (!widgets[0] && !house[0]) return false;
        new Thread(() -> {
            try {
                // the widgets' read hands its snapshot to HouseWatch too (WidgetActions.refreshNow)
                if (widgets[0]) WidgetActions.refreshNow(this);
                else Safe.run(this, "house watch", () -> HouseWatch.check(this));
            } finally {
                jobFinished(params, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
