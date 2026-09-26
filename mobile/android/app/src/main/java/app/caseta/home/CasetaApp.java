package app.caseta.home;

import android.app.Application;

/** The app's process: anything thrown and not caught anywhere is kept (Safe) before Android ends it. */
public class CasetaApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Thread.UncaughtExceptionHandler before = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, t) -> {
            Safe.note(this, "crash in " + thread.getName(), t);
            if (before != null) before.uncaughtException(thread, t);
        });
    }
}
