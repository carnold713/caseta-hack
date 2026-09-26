package app.caseta.home;

import android.content.Context;

/**
 * The whole house (Widgets.java draws it): how many lights are on and how bright, and All off. Like the tile, it
 * never turns anything on: the owner's rule is that nothing turns the whole house on in one tap.
 */
public class HouseWidget extends BaseWidget {
    /** Redraw every widget from what is stored (after the app pushes the house, or the tile acts). */
    static void refreshSoon(Context c) { Safe.run(c, "widget redraw", () -> Widgets.updateAll(c)); }
}
