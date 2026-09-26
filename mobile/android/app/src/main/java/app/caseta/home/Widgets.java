package app.caseta.home;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The ten widgets, drawn. Each placed widget is drawn from three things (WidgetStore): its config (what it controls
 * and how it looks), the model (the home as the app sees it) and the state (levels, colours, timers).
 *
 *   room        a room: its name and level, a power button, and dimmer and brighter
 *   light       one light: on and off with a tap, its level, and its own colour as the card's fill while it is on
 *   scenes      one to six scenes, each a tile that runs it; a scene that is showing is lit
 *   house       the whole house: how many are on, and All off. Nothing here turns the house on.
 *   levels      a light or a room at the brightness steps chosen (25, 50, 75, 100 by default)
 *   timer       a sleep timer for a light or a room: 15, 30 or 60 minutes, and the countdown while it runs
 *   nightstand  the night light: on dim, off, and a timer
 *   routine     the next routine (or one chosen), with Skip tonight
 *   pinned      what is pinned on Home, as many as fit
 *   colour      colours for a colour lamp, one tap each
 *
 * Every one has the same look options: Night (Copper Night), Day, or Clear with a shade; the launcher's corners or
 * square ones; copper or the lamp's own colour for "on"; names, levels and icons each on or off; roomy or compact.
 * Each is laid out for the size it is placed at (Android 12 and later hand over every size it is shown at).
 */
final class Widgets {
    private Widgets() {}

    static final String[] KINDS = { "room", "light", "scenes", "house", "levels", "timer", "nightstand", "routine", "pinned", "colour" };
    static final int COPPER = 0xFFD98A4E;

    static Class<?> providerOf(String kind) {
        switch (kind) {
            case "room": return RoomWidget.class;
            case "light": return LightWidget.class;
            case "scenes": return ScenesWidget.class;
            case "house": return HouseWidget.class;
            case "levels": return LevelsWidget.class;
            case "timer": return TimerWidget.class;
            case "nightstand": return NightstandWidget.class;
            case "routine": return RoutineWidget.class;
            case "pinned": return PinnedWidget.class;
            case "colour": return ColourWidget.class;
            default: return null;
        }
    }

    static String kindOfProvider(String className) {
        for (String k : KINDS) if (providerOf(k).getName().equals(className)) return k;
        return "";
    }

    // ---------- the defaults ----------
    /** A config with every option it lacks set to its default. What it controls defaults to the likeliest thing. */
    static void fillDefaults(Context c, JSONObject cfg) throws Exception {
        String kind = cfg.optString("kind");
        if (!cfg.has("theme")) cfg.put("theme", "night");
        if (!cfg.has("shade")) cfg.put("shade", 40);
        if (!cfg.has("corners")) cfg.put("corners", "system");
        if (!cfg.has("accent")) cfg.put("accent", kind.equals("light") || kind.equals("colour") ? "lamp" : "copper");
        if (!cfg.has("labels")) cfg.put("labels", true);
        if (!cfg.has("levels")) cfg.put("levels", true);
        if (!cfg.has("icons")) cfg.put("icons", true);
        if (!cfg.has("density")) cfg.put("density", "roomy");
        if (!cfg.has("steps") && kind.equals("room")) cfg.put("steps", true);
        if (!cfg.has("levelsAt")) cfg.put("levelsAt", new JSONArray().put(25).put(50).put(75).put(100));
        if (!cfg.has("minutes")) cfg.put("minutes", kind.equals("nightstand") ? new JSONArray().put(15).put(30) : new JSONArray().put(15).put(30).put(60));
        if (!cfg.has("nightLevel")) cfg.put("nightLevel", 10);
        if (!cfg.has("routine")) cfg.put("routine", "");
        if (!cfg.has("colours")) cfg.put("colours", new JSONArray().put("k2700").put("#FF5A4E").put("#FFC24A").put("#4FD39A").put("#4C8DFF").put("#A66BFF"));
        JSONObject m = WidgetStore.model(c);
        if (!cfg.has("target") || cfg.optString("target").isEmpty()) {
            String t = "";
            JSONArray rooms = m.optJSONArray("rooms"), lights = m.optJSONArray("lights");
            if ((kind.equals("room") || kind.equals("levels")) && rooms != null && rooms.length() > 0) t = "a:" + rooms.getJSONObject(0).optString("id");
            if ((kind.equals("light") || kind.equals("timer")) && lights != null && lights.length() > 0) t = "d:" + lights.getJSONObject(0).optString("id");
            if (kind.equals("nightstand")) { JSONObject n = m.optJSONObject("night"); if (n != null) t = "d:" + n.optString("id"); }
            if (kind.equals("colour") && lights != null) for (int i = 0; i < lights.length(); i++) if (lights.getJSONObject(i).optBoolean("color")) { t = "d:" + lights.getJSONObject(i).optString("id"); break; }
            if (!t.isEmpty()) cfg.put("target", t);
        }
        if (!cfg.has("scenes") && kind.equals("scenes")) {
            JSONArray all = m.optJSONArray("scenes"), pick = new JSONArray();
            for (int i = 0; all != null && i < all.length() && pick.length() < 4; i++) pick.put(all.getJSONObject(i).optString("key"));
            if (pick.length() > 0) cfg.put("scenes", pick);
        }
    }

    // ---------- the look ----------
    static final class Look {
        int bg, bgAlpha, ink, sub, btn, btnAlpha, btnInk, accent, onInk, solid, solidInk;
        boolean square, labels, levels, icons, compact;
        int card() { return square ? R.drawable.wg_card_sq : R.drawable.wg_card; }
        int inner() { return square ? R.drawable.wg_inner_sq : R.drawable.wg_inner; }
        int pill() { return square ? R.drawable.wg_pill_sq : R.drawable.wg_pill; }
        int pad() { return compact ? 12 : 16; }
        int rowH() { return compact ? 36 : 44; }
        int rowLayout() { return compact ? R.layout.wg_row_sm : R.layout.wg_row; }
    }

    static Look look(JSONObject cfg, String lampHex) {
        Look L = new Look();
        String theme = cfg.optString("theme", "night");
        L.square = "square".equals(cfg.optString("corners"));
        L.labels = cfg.optBoolean("labels", true);
        L.levels = cfg.optBoolean("levels", true);
        L.icons = cfg.optBoolean("icons", true);
        L.compact = "compact".equals(cfg.optString("density"));
        if (theme.equals("day")) {
            L.bg = 0xFFF5F2EE; L.bgAlpha = 255; L.ink = 0xFF1A1A1A; L.sub = 0xFF6E6E6E; L.btn = 0xFFE6E1DB; L.btnAlpha = 255; L.btnInk = 0xFF1A1A1A;
            L.solid = 0xFF262626; L.solidInk = 0xFFFFFFFF;
        } else if (theme.equals("clear")) {
            L.bg = 0xFF000000; L.bgAlpha = Math.round(255 * Math.max(0, Math.min(100, cfg.optInt("shade", 40))) / 100f);
            L.ink = 0xFFFFFFFF; L.sub = 0xFFE0E0E0; L.btn = 0xFFFFFFFF; L.btnAlpha = 46; L.btnInk = 0xFFFFFFFF;
            L.solid = 0xFFF8F8F8; L.solidInk = 0xFF262626;
        } else {
            L.bg = 0xFF1E1E1E; L.bgAlpha = 255; L.ink = 0xFFFFFFFF; L.sub = 0xFF9E9E9E; L.btn = 0xFF2B2B2B; L.btnAlpha = 255; L.btnInk = 0xFFFFFFFF;
            L.solid = 0xFFF8F8F8; L.solidInk = 0xFF262626;
        }
        L.accent = COPPER;
        if ("lamp".equals(cfg.optString("accent")) && lampHex != null) {
            try { L.accent = Color.parseColor(lampHex) | 0xFF000000; } catch (Exception ignored) { /* copper then */ }
        }
        L.onInk = light(L.accent) ? 0xFF1A1A1A : 0xFFFFFFFF;
        return L;
    }

    /** A colour pale enough that white words on it would not read. */
    static boolean light(int c) {
        double r = Color.red(c) / 255.0, g = Color.green(c) / 255.0, b = Color.blue(c) / 255.0;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62;
    }

    // ---------- drawing ----------
    /** Every placed widget of every kind, from what is stored. */
    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (String k : KINDS) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, providerOf(k)));
            for (int id : ids) draw(c, m, id);
        }
    }

    static int count(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int n = 0;
        for (String k : KINDS) n += m.getAppWidgetIds(new ComponentName(c, providerOf(k))).length;
        return n;
    }

    /** One widget, laid out for each size the launcher shows it at. */
    static void draw(Context c, AppWidgetManager m, int id) {
        try {
            JSONObject cfg = WidgetStore.config(c, id);
            Bundle o = m.getAppWidgetOptions(id);
            // the other of the two frames from last time: a changed layout is built afresh by the launcher, where the
            // same one may be updated in place (and added to)
            android.content.SharedPreferences fp = c.getSharedPreferences("wg-frame", Context.MODE_PRIVATE);
            boolean alt = !fp.getBoolean("f" + id, false);
            fp.edit().putBoolean("f" + id, alt).apply();
            RemoteViews rv = null;
            StringBuilder note = new StringBuilder("draw id=" + id + " kind=" + cfg.optString("kind") + " alt=" + alt + " sdk=" + Build.VERSION.SDK_INT);
            if (Build.VERSION.SDK_INT >= 31) {
                @SuppressWarnings("deprecation")
                ArrayList<SizeF> sizes = o.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
                note.append(" sizes=").append(sizes);
                if (sizes != null && !sizes.isEmpty()) {
                    Map<SizeF, RemoteViews> map = new HashMap<>();
                    for (SizeF s : sizes) if (map.size() < 8 && !map.containsKey(s)) map.put(s, build(c, id, cfg, (int) s.getWidth(), (int) s.getHeight(), alt));
                    rv = new RemoteViews(map);
                }
            }
            if (rv == null) {
                int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH), h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
                rv = build(c, id, cfg, w > 0 ? w : 250, h > 0 ? h : 110, alt);
            }
            m.updateAppWidget(id, rv);
            Diag.send(c, note.append(" ok").toString());
        } catch (Throwable e) {
            // a widget that cannot be drawn keeps what it showed last
            Safe.note(c, "widget draw " + id, e);
            java.io.StringWriter w = new java.io.StringWriter();
            e.printStackTrace(new java.io.PrintWriter(w));
            String t = w.toString();
            Diag.send(c, "draw id=" + id + " FAILED " + (t.length() > 3000 ? t.substring(0, 3000) : t));
        }
    }

    /** One widget at one size. Also what the previews are drawn with. */
    static RemoteViews build(Context c, int id, JSONObject cfg, int w, int h) { return build(c, id, cfg, w, h, false); }

    static RemoteViews build(Context c, int id, JSONObject cfg, int w, int h, boolean alt) {
        B b = new B(c, id, cfg, w, h, alt);
        if (!HubStore.signedIn(c)) return b.note(R.drawable.wi_home, "Caseta", "Open the app to sign in", "home");
        if (!WidgetStore.hasModel(c) && !cfg.optString("kind").equals("house")) return b.note(R.drawable.wi_home, "Caseta", "Open the app once", "home");
        try {
            switch (cfg.optString("kind")) {
                case "room": return room(b);
                case "light": return light(b);
                case "scenes": return scenes(b);
                case "house": return house(b);
                case "levels": return levels(b);
                case "timer": return timer(b);
                case "nightstand": return nightstand(b);
                case "routine": return routine(b);
                case "pinned": return pinned(b);
                case "colour": return colour(b);
                default: return b.note(R.drawable.wi_home, "Caseta", "Tap to open", "home");
            }
        } catch (Exception e) {
            return new B(c, id, cfg, w, h, alt).note(R.drawable.wi_home, "Caseta", "Tap to open", "home");
        }
    }

    /** One widget being built: its config, its look, its size, and the taps it hands out. */
    static final class B {
        final Context c; final int id; final JSONObject cfg, model, state; final int w, h; final boolean alt; Look L; RemoteViews root;

        B(Context c, int id, JSONObject cfg, int w, int h, boolean alt) {
            this.c = c; this.id = id; this.cfg = cfg; this.w = w; this.h = h; this.alt = alt;
            this.model = WidgetStore.model(c); this.state = WidgetStore.state(c);
            look(null);
        }

        /** The frame, in the look (again, once the lamp's colour is known). */
        void look(String lampHex) {
            L = Widgets.look(cfg, lampHex);
            root = new RemoteViews(c.getPackageName(), alt ? R.layout.wg_root_b : R.layout.wg_root);
            // Every container is emptied before it is filled. A launcher may apply a widget's new drawing to the views
            // it already shows (the same layout, reapplied), and addView then adds to what is there: without this,
            // each tap drew the widget again under itself.
            root.removeAllViews(R.id.wg_body);
            root.setImageViewResource(R.id.wg_bg, L.card());
            tint(root, R.id.wg_bg, L.bg, L.bgAlpha);
            int p = px(L.pad());
            root.setViewPadding(R.id.wg_body, p, p, p, p);
        }

        /** Fill the card with a colour (a light that is on). */
        void fill(int color) { tint(root, R.id.wg_bg, color, L.bgAlpha); }

        int innerW() { return w - 2 * L.pad(); }
        int innerH() { return h - 2 * L.pad(); }
        int px(int dp) { return Math.round(dp * c.getResources().getDisplayMetrics().density); }

        void add(RemoteViews v) { root.addView(R.id.wg_body, v); }
        void gap() { add(new RemoteViews(c.getPackageName(), R.layout.wg_gap)); }
        void space() { add(new RemoteViews(c.getPackageName(), R.layout.wg_space)); }
        void onTap(PendingIntent pi) { root.setOnClickPendingIntent(android.R.id.background, pi); }

        /**
         * A tap that acts: one action (the hub's own shape, or one of WidgetActions' own), run off the main thread.
         * Named by the action itself, so the same tap drawn at two sizes is one PendingIntent and two taps never are.
         */
        PendingIntent act(JSONObject action) {
            String a = action.toString();
            int code = 31 * id + a.hashCode();
            Intent i = new Intent(c, WidgetActions.class).setAction("app.caseta.home.WIDGET." + id + "." + Integer.toHexString(a.hashCode()))
                .putExtra("widget", id).putExtra("action", a);
            return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        }

        /** A tap that opens the app on a page (#room/<id>, #widgets/<id>, ...). */
        PendingIntent open(String route) { return Widgets.open(c, route, id * 64 + 63); }

        RemoteViews head(int icon, int iconColor, String title, String sub) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.wg_head);
            v.setImageViewResource(R.id.wg_icon, icon);
            tint(v, R.id.wg_icon, iconColor, 255);
            v.setViewVisibility(R.id.wg_icon, L.icons ? View.VISIBLE : View.GONE);
            v.setTextViewText(R.id.wg_title, title);
            v.setTextColor(R.id.wg_title, L.ink);
            v.setViewVisibility(R.id.wg_title, L.labels || sub == null || sub.isEmpty() ? View.VISIBLE : View.GONE);
            v.setTextViewText(R.id.wg_sub, sub == null ? "" : sub);
            v.setTextColor(R.id.wg_sub, L.sub);
            v.setViewVisibility(R.id.wg_sub, sub == null || sub.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextColor(R.id.wg_chrono, L.accent == COPPER || !light(L.accent) ? L.accent : L.ink);
            if (L.compact) {
                v.setTextViewTextSize(R.id.wg_title, TypedValue.COMPLEX_UNIT_SP, 14);
                v.setTextViewTextSize(R.id.wg_sub, TypedValue.COMPLEX_UNIT_SP, 12);
                v.setTextViewTextSize(R.id.wg_chrono, TypedValue.COMPLEX_UNIT_SP, 12);
            }
            return v;
        }

        /** The round power button at the end of a heading: filled with "on" while on. */
        void power(RemoteViews head, boolean on, PendingIntent pi, int glyph) {
            head.setViewVisibility(R.id.wg_pwr, View.VISIBLE);
            head.setImageViewResource(R.id.wg_pwr_ic, glyph);
            tint(head, R.id.wg_pwr_bg, on ? L.accent : L.btn, on ? 255 : L.btnAlpha);
            tint(head, R.id.wg_pwr_ic, on ? L.onInk : L.btnInk, 255);
            head.setOnClickPendingIntent(R.id.wg_pwr, pi);
        }

        /** A countdown in a heading, to `ends` (epoch ms). */
        void countdown(RemoteViews head, long ends) {
            head.setViewVisibility(R.id.wg_chrono, View.VISIBLE);
            head.setChronometer(R.id.wg_chrono, SystemClock.elapsedRealtime() + (ends - System.currentTimeMillis()), null, true);
            head.setChronometerCountDown(R.id.wg_chrono, true);
        }

        RemoteViews row(boolean fill) {
            RemoteViews r = new RemoteViews(c.getPackageName(), fill ? R.layout.wg_row_fill : L.rowLayout());
            r.removeAllViews(R.id.wg_row);
            return r;
        }

        /** A pill in a row: filled with "on" when `on`, the look's button colour otherwise. */
        RemoteViews button(String label, int icon, boolean on, PendingIntent pi) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.wg_btn);
            v.setImageViewResource(R.id.wg_btn_bg, L.pill());
            tint(v, R.id.wg_btn_bg, on ? L.accent : L.btn, on ? 255 : L.btnAlpha);
            int ink = on ? L.onInk : L.btnInk;
            boolean withIcon = icon != 0 && (L.icons || label == null || label.isEmpty());
            if (withIcon) { v.setViewVisibility(R.id.wg_btn_ic, View.VISIBLE); v.setImageViewResource(R.id.wg_btn_ic, icon); tint(v, R.id.wg_btn_ic, ink, 255); }
            v.setTextViewText(R.id.wg_btn_tx, label == null ? "" : label);
            v.setTextColor(R.id.wg_btn_tx, ink);
            v.setViewVisibility(R.id.wg_btn_tx, label == null || label.isEmpty() ? View.GONE : View.VISIBLE);
            if (withIcon && label != null && !label.isEmpty()) v.setViewPadding(R.id.wg_btn_tx, px(6), 0, 0, 0);
            if (L.compact) v.setTextViewTextSize(R.id.wg_btn_tx, TypedValue.COMPLEX_UNIT_SP, 13);
            v.setContentDescription(R.id.wg_btn, label == null || label.isEmpty() ? "Button" : label);
            if (pi != null) v.setOnClickPendingIntent(R.id.wg_btn, pi);
            return v;
        }

        /** A row of buttons, 8dp apart. */
        void buttons(List<RemoteViews> list) {
            RemoteViews r = row(false);
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) r.addView(R.id.wg_row, new RemoteViews(c.getPackageName(), R.layout.wg_space));
                r.addView(R.id.wg_row, list.get(i));
            }
            add(r);
        }

        /** A tile (Pinned, Scenes), tall or low. */
        RemoteViews tile(boolean tall, int icon, String name, String sub, boolean on, PendingIntent pi) {
            RemoteViews v = new RemoteViews(c.getPackageName(), tall ? R.layout.wg_tile : R.layout.wg_tile_row);
            v.setImageViewResource(R.id.wg_tile_bg, L.inner());
            tint(v, R.id.wg_tile_bg, on ? L.accent : L.btn, on ? 255 : L.btnAlpha);
            int ink = on ? L.onInk : L.btnInk;
            v.setImageViewResource(R.id.wg_tile_ic, icon);
            tint(v, R.id.wg_tile_ic, on ? ink : L.sub, 255);
            v.setViewVisibility(R.id.wg_tile_ic, L.icons ? View.VISIBLE : View.GONE);
            v.setTextViewText(R.id.wg_tile_name, name);
            v.setTextColor(R.id.wg_tile_name, ink);
            v.setTextViewText(R.id.wg_tile_sub, sub == null ? "" : sub);
            v.setTextColor(R.id.wg_tile_sub, on ? (ink & 0x00FFFFFF) | 0xCC000000 : L.sub);
            v.setViewVisibility(R.id.wg_tile_sub, sub == null || sub.isEmpty() ? View.GONE : View.VISIBLE);
            v.setContentDescription(R.id.wg_tile, name);
            if (pi != null) v.setOnClickPendingIntent(R.id.wg_tile, pi);
            return v;
        }

        /** A grid of tiles or swatches: `cols` across, each row sharing the height. */
        void grid(List<RemoteViews> cells, int cols) {
            for (int r = 0; r * cols < cells.size(); r++) {
                if (r > 0) space();
                RemoteViews row = row(true);
                for (int k = 0; k < cols; k++) {
                    if (k > 0) row.addView(R.id.wg_row, new RemoteViews(c.getPackageName(), R.layout.wg_space));
                    int i = r * cols + k;
                    row.addView(R.id.wg_row, i < cells.size() ? cells.get(i) : new RemoteViews(c.getPackageName(), R.layout.wg_gap));
                }
                add(row);
            }
        }

        /** A widget that can only say one thing (signed out, what it showed is gone): a tap goes where it says. */
        RemoteViews note(int icon, String title, String sub, String route) {
            add(head(icon, L.sub, title, sub));
            onTap(open(route));
            return root;
        }

        /** What it controlled is gone: it says so, and a tap chooses again. */
        RemoteViews gone(String what) { return note(R.drawable.wi_x, what, "Tap to choose again", "widgets/" + id); }
    }

    // ---------- the ten ----------
    private static RemoteViews room(B b) throws Exception {
        String target = b.cfg.optString("target");
        JSONObject room = find(b.model.optJSONArray("rooms"), "id", target.startsWith("a:") ? target.substring(2) : "");
        if (room == null) return b.gone(target.isEmpty() ? "Choose a room" : "Room not found");
        JSONArray lights = room.optJSONArray("lights");
        int[] onLv = litOf(b, lights);
        boolean on = onLv[0] > 0;
        String sub = on ? (lights.length() > 1 ? onLv[0] + " of " + lights.length() + " on" : "On") + (b.L.levels && onLv[1] > 0 ? " · " + onLv[1] + "%" : "") : "Off";
        RemoteViews head = b.head(R.drawable.wi_grid, on ? b.L.accent : b.L.sub, room.optString("name"), sub);
        b.power(head, on, b.act(level(target, on ? "off" : "on")), R.drawable.wi_power);
        b.add(head);
        if (b.cfg.optBoolean("steps", true) && b.innerH() >= 44 + 8 + b.L.rowH()) {
            b.gap();
            List<RemoteViews> row = new ArrayList<>();
            row.add(b.button(b.innerW() >= 200 ? "Dimmer" : "", R.drawable.wi_minus, false, b.act(new JSONObject().put("type", "step").put("target", target).put("delta", -20))));
            row.add(b.button(b.innerW() >= 200 ? "Brighter" : "", R.drawable.wi_plus, false, b.act(new JSONObject().put("type", "step").put("target", target).put("delta", 20))));
            b.buttons(row);
        }
        b.onTap(b.open("room/" + room.optString("id")));
        return b.root;
    }

    private static RemoteViews light(B b) throws Exception {
        String target = b.cfg.optString("target");
        JSONObject d = find(b.model.optJSONArray("lights"), "id", target.startsWith("d:") ? target.substring(2) : "");
        if (d == null) return b.gone(target.isEmpty() ? "Choose a light" : "Light not found");
        String id = d.optString("id");
        int lv = levelOf(b, id);
        boolean on = lv != 0;
        String hex = colorOf(b, id);
        b.look(hex);
        // the card is the lamp: its colour (or copper) fills it while it is on
        if (on) { b.fill(b.L.accent); b.L.ink = b.L.onInk; b.L.sub = (b.L.onInk & 0x00FFFFFF) | 0xCC000000; }
        String sub = !on ? "Off" : (b.L.levels && lv > 0 ? lv + "%" : "On") + (hex != null ? " · " + colourName(hex) : "");
        RemoteViews head = b.head(d.optBoolean("dim", true) ? R.drawable.wi_bulb : R.drawable.wi_power, b.L.ink, d.optString("name"), sub);
        // the round button on a lit card is white with the colour's glyph, as a lit tile's is in the app
        head.setViewVisibility(R.id.wg_pwr, View.VISIBLE);
        tint(head, R.id.wg_pwr_bg, on ? 0xFFFFFFFF : b.L.btn, on ? 255 : b.L.btnAlpha);
        tint(head, R.id.wg_pwr_ic, on ? darker(b.L.accent) : b.L.btnInk, 255);
        PendingIntent toggle = b.act(level(target, on ? "off" : "on"));
        head.setOnClickPendingIntent(R.id.wg_pwr, toggle);
        head.setOnClickPendingIntent(R.id.wg_words, b.open("light/" + id));
        b.add(head);
        if (b.cfg.optBoolean("steps", false) && d.optBoolean("dim", true) && b.innerH() >= 44 + 8 + b.L.rowH()) {
            b.gap();
            List<RemoteViews> row = new ArrayList<>();
            if (on) { b.L.btn = 0xFFFFFFFF; b.L.btnAlpha = 56; b.L.btnInk = b.L.onInk; }
            row.add(b.button("", R.drawable.wi_minus, false, b.act(new JSONObject().put("type", "step").put("target", target).put("delta", -20))));
            row.add(b.button("", R.drawable.wi_plus, false, b.act(new JSONObject().put("type", "step").put("target", target).put("delta", 20))));
            b.buttons(row);
        }
        b.onTap(toggle);
        return b.root;
    }

    private static RemoteViews scenes(B b) throws Exception {
        JSONArray keys = b.cfg.optJSONArray("scenes");
        JSONArray all = b.model.optJSONArray("scenes");
        List<JSONObject> list = new ArrayList<>();
        for (int i = 0; keys != null && i < keys.length() && list.size() < 6; i++) {
            JSONObject s = find(all, "key", keys.optString(i));
            if (s != null) list.add(s);
        }
        if (list.isEmpty()) return b.gone(keys == null || keys.length() == 0 ? "Choose scenes" : "Scenes not found");
        int ih = b.innerH();
        boolean title = b.L.labels && ih >= 40 + 30;
        if (title) { b.add(b.head(R.drawable.wi_sparkle, b.L.sub, b.cfg.optString("title", "Scenes"), null)); b.space(); }
        int avail = ih - (title ? 38 : 0);
        int cols = b.innerW() < 150 ? 1 : b.innerW() < 260 ? 2 : 3;
        cols = Math.min(cols, list.size());
        int rows = (int) Math.ceil(list.size() / (double) cols);
        int fit = Math.max(1, (avail + 8) / (40 + 8));
        if (rows > fit) {
            // too many for the height: more across if it can, else only the first ones
            cols = Math.min(list.size(), Math.max(cols, (int) Math.ceil(list.size() / (double) fit)));
            if (b.innerW() / cols < 64) cols = Math.max(1, b.innerW() / 64);
            rows = Math.min(fit, (int) Math.ceil(list.size() / (double) cols));
        }
        boolean tall = (avail - (rows - 1) * 8) / rows >= 76 && b.innerW() / cols >= 90;
        List<RemoteViews> cells = new ArrayList<>();
        for (int i = 0; i < Math.min(list.size(), rows * cols); i++) {
            JSONObject s = list.get(i);
            String key = s.optString("key");
            JSONObject a = key.startsWith("p:") ? new JSONObject().put("type", "preset").put("preset_id", key.substring(2)) : new JSONObject().put("type", "scene").put("scene_id", key.substring(2));
            cells.add(b.tile(tall, R.drawable.wi_sparkle, s.optString("name"), tall && b.L.levels ? s.optString("roomName", "") : null, showing(b, s), b.act(a)));
        }
        b.grid(cells, cols);
        b.onTap(b.open("scenes"));
        return b.root;
    }

    private static RemoteViews house(B b) throws Exception {
        int on = HubStore.on(b.c), lv = HubStore.level(b.c);
        String headline = on < 0 ? "Your home" : on == 0 ? "All off" : on + " on" + (b.L.levels ? " · " + lv + "%" : "");
        String sub = on < 0 ? "Tap to open" : on == 0 ? "Nothing is on" : on == 1 ? "1 light is on" : on + " lights are on";
        PendingIntent off = b.act(new JSONObject().put("type", "level").put("target", "h:all").put("level", "off"));
        if (b.innerH() < 96) {
            RemoteViews head = b.head(R.drawable.wi_home, on > 0 ? b.L.accent : b.L.sub, headline, b.L.labels ? sub : null);
            b.power(head, false, off, R.drawable.wi_power);
            tint(head, R.id.wg_pwr_bg, b.L.solid, 255);
            tint(head, R.id.wg_pwr_ic, b.L.solidInk, 255);
            head.setContentDescription(R.id.wg_pwr, "All off");
            b.add(head);
        } else {
            if (b.L.labels) {
                RemoteViews over = new RemoteViews(b.c.getPackageName(), R.layout.wg_over);
                over.setTextViewText(R.id.wg_overtext, b.model.optString("home", "").isEmpty() ? "Whole house" : b.model.optString("home"));
                over.setTextColor(R.id.wg_overtext, b.L.sub);
                b.add(over);
            }
            RemoteViews big = new RemoteViews(b.c.getPackageName(), R.layout.wg_big);
            big.setTextViewText(R.id.wg_bigtext, headline);
            big.setTextColor(R.id.wg_bigtext, b.L.ink);
            if (b.L.compact) big.setTextViewTextSize(R.id.wg_bigtext, TypedValue.COMPLEX_UNIT_SP, 22);
            b.add(big);
            if (b.innerH() >= 130) {
                RemoteViews s = b.head(on > 0 ? R.drawable.wi_bulb : R.drawable.wi_moon, on > 0 ? b.L.accent : b.L.sub, sub, null);
                s.setTextColor(R.id.wg_title, b.L.sub);
                s.setViewPadding(R.id.wg_head, 0, b.px(4), 0, 0);
                b.add(s);
            }
            b.gap();
            RemoteViews r = b.row(false);
            RemoteViews pill = new RemoteViews(b.c.getPackageName(), R.layout.wg_btn_wrap);
            pill.setImageViewResource(R.id.wg_btn_bg, b.L.pill());
            tint(pill, R.id.wg_btn_bg, b.L.solid, 255);
            pill.setViewVisibility(R.id.wg_btn_ic, b.L.icons ? View.VISIBLE : View.GONE);
            pill.setImageViewResource(R.id.wg_btn_ic, R.drawable.wi_power);
            tint(pill, R.id.wg_btn_ic, b.L.solidInk, 255);
            pill.setTextViewText(R.id.wg_btn_tx, "All off");
            pill.setTextColor(R.id.wg_btn_tx, b.L.solidInk);
            if (b.L.icons) pill.setViewPadding(R.id.wg_btn_tx, b.px(8), 0, 0, 0);
            pill.setOnClickPendingIntent(R.id.wg_btn, off);
            r.addView(R.id.wg_row, pill);
            b.add(r);
        }
        b.onTap(b.open("home"));
        return b.root;
    }

    private static RemoteViews levels(B b) throws Exception {
        String target = b.cfg.optString("target");
        String name; int lv; boolean on;
        if (target.startsWith("a:")) {
            JSONObject room = find(b.model.optJSONArray("rooms"), "id", target.substring(2));
            if (room == null) return b.gone("Room not found");
            int[] o = litOf(b, room.optJSONArray("lights"));
            name = room.optString("name"); on = o[0] > 0; lv = o[1];
        } else {
            JSONObject d = find(b.model.optJSONArray("lights"), "id", target.startsWith("d:") ? target.substring(2) : "");
            if (d == null) return b.gone(target.isEmpty() ? "Choose a light" : "Light not found");
            name = d.optString("name"); lv = levelOf(b, d.optString("id")); on = lv != 0;
            b.look(colorOf(b, d.optString("id")));
        }
        if (b.innerH() >= b.L.rowH() + 8 + 36) {
            b.add(b.head(target.startsWith("a:") ? R.drawable.wi_grid : R.drawable.wi_bulb, on ? b.L.accent : b.L.sub, name, on ? (b.L.levels && lv > 0 ? lv + "%" : "On") : "Off"));
            b.gap();
        }
        JSONArray at = b.cfg.optJSONArray("levelsAt");
        List<RemoteViews> row = new ArrayList<>();
        int max = Math.max(2, b.innerW() / 48);
        for (int i = 0; at != null && i < at.length() && row.size() < max; i++) {
            int v = at.optInt(i);
            boolean here = v == 0 ? !on : on && lv > 0 && Math.abs(lv - v) <= 4;
            row.add(b.button(v == 0 ? "Off" : v + "%", 0, here, b.act(level(target, v == 0 ? "off" : v))));
        }
        b.buttons(row);
        b.onTap(b.open(target.startsWith("a:") ? "room/" + target.substring(2) : "light/" + target.substring(2)));
        return b.root;
    }

    private static RemoteViews timer(B b) throws Exception {
        String target = b.cfg.optString("target");
        String name; boolean on; JSONArray covers;
        if (target.startsWith("a:")) {
            JSONObject room = find(b.model.optJSONArray("rooms"), "id", target.substring(2));
            if (room == null) return b.gone("Room not found");
            name = room.optString("name"); covers = room.optJSONArray("lights"); on = litOf(b, covers)[0] > 0;
        } else {
            JSONObject d = find(b.model.optJSONArray("lights"), "id", target.startsWith("d:") ? target.substring(2) : "");
            if (d == null) return b.gone(target.isEmpty() ? "Choose a light" : "Light not found");
            name = d.optString("name"); covers = new JSONArray().put(d.optString("id")); on = levelOf(b, d.optString("id")) != 0;
        }
        String[] t = timerOver(b.state, target, covers);
        return timerBody(b, target, name, on, t, R.drawable.wi_timer, "Sleep timer", target.startsWith("a:") ? "room/" + target.substring(2) + "/timer" : "light/" + target.substring(2) + "/timer", null);
    }

    /** A sleep timer's body, shared by Sleep timer and Nightstand: the minutes to start one, or its countdown. */
    private static RemoteViews timerBody(B b, String target, String name, boolean on, String[] t, int icon, String idle, String route, RemoteViews[] lead) throws Exception {
        boolean narrow = b.innerW() < 200;
        if (t != null) {
            long ends = Long.parseLong(t[1]);
            RemoteViews head = b.head(icon, b.L.accent, name, "Off at " + clock(ends));
            b.countdown(head, ends);
            b.add(head);
            if (b.innerH() >= 44 + 8 + b.L.rowH()) {
                b.gap();
                List<RemoteViews> row = new ArrayList<>();
                row.add(b.button(narrow ? "Off" : "Off now", R.drawable.wi_power, false, b.act(new JSONObject().put("type", "timer-off").put("key", t[0]))));
                row.add(b.button(narrow ? "+15" : "Add 15 min", 0, false, b.act(new JSONObject().put("type", "timer-add").put("key", t[0]))));
                b.buttons(row);
            }
        } else {
            b.add(b.head(icon, b.L.sub, name, on ? idle : "It's off"));
            if (b.innerH() >= 44 + 8 + b.L.rowH()) {
                b.gap();
                List<RemoteViews> row = new ArrayList<>();
                if (lead != null) for (RemoteViews v : lead) row.add(v);
                JSONArray mins = b.cfg.optJSONArray("minutes");
                int max = Math.max(2, b.innerW() / 60);
                for (int i = 0; mins != null && i < mins.length() && row.size() < max; i++) {
                    int m = mins.optInt(i);
                    if (m <= 0) continue;
                    row.add(b.button(minutes(m, narrow || row.size() >= 3), 0, false, b.act(new JSONObject().put("type", "timer").put("target", target).put("minutes", m))));
                }
                b.buttons(row);
            }
        }
        b.onTap(b.open(route));
        return b.root;
    }

    private static RemoteViews nightstand(B b) throws Exception {
        String target = b.cfg.optString("target");
        JSONObject d = find(b.model.optJSONArray("lights"), "id", target.startsWith("d:") ? target.substring(2) : "");
        if (d == null) return b.gone(target.isEmpty() ? "Choose a night light" : "Night light not found");
        String id = d.optString("id");
        int lv = levelOf(b, id);
        boolean on = lv != 0;
        int nl = Math.max(1, Math.min(100, b.cfg.optInt("nightLevel", 10)));
        String[] t = timerOver(b.state, target, new JSONArray().put(id));
        if (t == null && !on) {
            b.add(b.head(R.drawable.wi_moon, b.L.sub, b.L.labels ? "Night light" : d.optString("name"), b.L.labels ? d.optString("name") : null));
            if (b.innerH() >= 44 + 8 + b.L.rowH()) {
                b.gap();
                List<RemoteViews> row = new ArrayList<>();
                row.add(b.button(b.innerW() < 160 ? nl + "%" : "On at " + nl + "%", R.drawable.wi_moon, false, b.act(level(target, nl))));
                b.buttons(row);
            } else {
                b.onTap(b.act(level(target, nl)));
                return b.root;
            }
            b.onTap(b.open("nightstand"));
            return b.root;
        }
        RemoteViews[] lead = { b.button(b.innerW() < 200 ? "" : "Off", R.drawable.wi_power, false, b.act(level(target, "off"))) };
        return timerBody(b, target, d.optString("name"), true, t, R.drawable.wi_moon, b.L.levels && lv > 0 ? "On at " + lv + "%" : "On", "nightstand", lead);
    }

    private static RemoteViews routine(B b) throws Exception {
        JSONArray all = b.model.optJSONArray("routines");
        String want = b.cfg.optString("routine");
        JSONObject r = null;
        long now = System.currentTimeMillis();
        for (int i = 0; all != null && i < all.length(); i++) {
            JSONObject x = all.getJSONObject(i);
            if (!x.optBoolean("enabled", true)) continue;
            if (!want.isEmpty()) { if (want.equals(x.optString("id"))) r = x; continue; }
            if (x.optLong("t") < now - 60000 && !x.optBoolean("skipping")) continue;
            if (r == null || x.optLong("t") < r.optLong("t")) r = x;
        }
        if (r == null && !want.isEmpty()) {
            JSONObject named = find(all, "id", want);
            if (named == null) return b.gone("Routine not found");
            b.add(b.head(R.drawable.wi_clock, b.L.sub, named.optString("name", "Routine"), "Paused"));
            b.onTap(b.open("routine/" + want));
            return b.root;
        }
        if (r == null) return b.note(R.drawable.wi_clock, "Routines", "Nothing this week", "routines");
        String icon = r.optString("icon");
        int ic = icon.equals("sunset") ? R.drawable.wi_sunset : icon.equals("sunrise") ? R.drawable.wi_sunrise : R.drawable.wi_clock;
        long t = r.optLong("t");
        boolean skipping = r.optBoolean("skipping");
        String word = skipWord(r.optString("date"), t);
        String sub = skipping ? "Skipping " + word : t > 0 ? whenText(t) : "";
        b.add(b.head(ic, skipping ? b.L.sub : b.L.accent, r.optString("name", "Routine"), sub));
        if (b.innerH() >= 44 + 8 + b.L.rowH() && !r.optString("date").isEmpty()) {
            b.gap();
            List<RemoteViews> row = new ArrayList<>();
            JSONObject a = new JSONObject().put("type", "skip").put("id", r.optString("id")).put("date", skipping ? "" : r.optString("date"));
            row.add(b.button(skipping ? "Don't skip" : "Skip " + word, 0, false, b.act(a)));
            b.buttons(row);
        }
        b.onTap(b.open("routine/" + r.optString("id")));
        return b.root;
    }

    private static RemoteViews pinned(B b) throws Exception {
        JSONArray pins = b.model.optJSONArray("pins");
        List<JSONObject> items = new ArrayList<>();
        for (int i = 0; pins != null && i < pins.length(); i++) {
            String k = pins.optString(i);
            JSONObject x = k.startsWith("d:") ? find(b.model.optJSONArray("lights"), "id", k.substring(2)) : k.startsWith("a:") ? find(b.model.optJSONArray("rooms"), "id", k.substring(2)) : null;
            if (x != null) items.add(new JSONObject().put("key", k).put("x", x));
        }
        if (items.isEmpty()) return b.note(R.drawable.wi_pin, "Pinned", "Pin lights and rooms on Home", "home");
        int ih = b.innerH(), iw = b.innerW();
        boolean title = b.L.labels && ih >= 150;
        if (title) { b.add(b.head(R.drawable.wi_pin, b.L.sub, "Pinned", null)); b.space(); }
        int avail = ih - (title ? 38 : 0);
        int cols = Math.max(1, (iw + 8) / (92 + 8));
        int rowsTall = Math.max(1, (avail + 8) / (80 + 8)), rowsLow = Math.max(1, (avail + 8) / (40 + 8));
        boolean tall = rowsTall * cols >= items.size() || rowsLow == rowsTall;
        int rows = tall ? rowsTall : rowsLow;
        if (!tall) cols = Math.max(1, (iw + 8) / (130 + 8));
        rows = Math.min(rows, (int) Math.ceil(items.size() / (double) cols));
        int room = rows * cols;
        List<RemoteViews> cells = new ArrayList<>();
        for (int i = 0; i < items.size() && cells.size() < room; i++) {
            if (cells.size() == room - 1 && items.size() > room) {
                cells.add(b.tile(tall, R.drawable.wi_plus, (items.size() - i) + " more", null, false, b.open("home")));
                break;
            }
            JSONObject it = items.get(i);
            String key = it.getString("key");
            JSONObject x = it.getJSONObject("x");
            boolean on; String sub;
            if (key.startsWith("d:")) {
                int lv = levelOf(b, x.optString("id"));
                on = lv != 0; sub = !on ? "Off" : b.L.levels && lv > 0 ? lv + "%" : "On";
            } else {
                int[] o = litOf(b, x.optJSONArray("lights"));
                on = o[0] > 0; sub = !on ? "Off" : b.L.levels && o[1] > 0 ? o[1] + "%" : o[0] + " on";
            }
            cells.add(b.tile(tall, key.startsWith("d:") ? R.drawable.wi_bulb : R.drawable.wi_grid, x.optString("name"), sub, on, b.act(level(key, on ? "off" : "on"))));
        }
        b.grid(cells, cols);
        b.onTap(b.open("home"));
        return b.root;
    }

    private static RemoteViews colour(B b) throws Exception {
        String target = b.cfg.optString("target");
        JSONObject d = find(b.model.optJSONArray("lights"), "id", target.startsWith("d:") ? target.substring(2) : "");
        if (d == null) return b.gone(target.isEmpty() ? "Choose a colour lamp" : "Lamp not found");
        String id = d.optString("id");
        int lv = levelOf(b, id);
        boolean on = lv != 0;
        String hex = colorOf(b, id);
        b.look(on ? hex : null);
        int ih = b.innerH(), iw = b.innerW();
        boolean head = ih >= 44 + 8 + 40;
        if (head) {
            RemoteViews hv = b.head(R.drawable.wi_palette, on ? b.L.accent : b.L.sub, d.optString("name"), !on ? "Off" : (hex != null ? colourName(hex) : "White") + (b.L.levels && lv > 0 ? " · " + lv + "%" : ""));
            b.power(hv, on, b.act(level(target, on ? "off" : "on")), R.drawable.wi_power);
            b.add(hv);
            b.space();
        }
        JSONArray cols = b.cfg.optJSONArray("colours");
        List<RemoteViews> cells = new ArrayList<>();
        int across = Math.max(2, (iw + 4) / 46);
        int rowsFit = Math.max(1, ((head ? ih - 52 : ih) + 4) / 46);
        int room = across * rowsFit;
        for (int i = 0; cols != null && i < cols.length() && cells.size() < room - (head ? 0 : 1); i++) {
            String v = cols.optString(i);
            JSONObject a = new JSONObject().put("type", "color").put("target", target);
            int fillC;
            if (v.startsWith("k")) {
                int k = Integer.parseInt(v.substring(1));
                a.put("kelvin", k); fillC = kelvinColor(k);
            } else {
                a.put("hex", v.toLowerCase(Locale.ROOT));
                try { fillC = Color.parseColor(v) | 0xFF000000; } catch (Exception e) { continue; }
            }
            if (!on) a.put("level", 80);
            RemoteViews s = new RemoteViews(b.c.getPackageName(), R.layout.wg_swatch);
            tint(s, R.id.wg_sw_dot, fillC, 255);
            boolean here = on && hex != null && v.equalsIgnoreCase(hex);
            s.setViewVisibility(R.id.wg_sw_ring, here ? View.VISIBLE : View.INVISIBLE);
            tint(s, R.id.wg_sw_ring, b.L.ink, 255);
            s.setContentDescription(R.id.wg_sw, v.startsWith("k") ? whiteName(Integer.parseInt(v.substring(1))) : colourName(v));
            s.setOnClickPendingIntent(R.id.wg_sw, b.act(a));
            cells.add(s);
        }
        if (!head) {
            RemoteViews s = new RemoteViews(b.c.getPackageName(), R.layout.wg_swatch);
            tint(s, R.id.wg_sw_dot, on ? b.L.accent : b.L.btn, on ? 255 : b.L.btnAlpha);
            s.setViewVisibility(R.id.wg_sw_ic, View.VISIBLE);
            tint(s, R.id.wg_sw_ic, on ? b.L.onInk : b.L.btnInk, 255);
            s.setContentDescription(R.id.wg_sw, on ? "Off" : "On");
            s.setOnClickPendingIntent(R.id.wg_sw, b.act(level(target, on ? "off" : "on")));
            cells.add(s);
        }
        int n = cells.size();
        int perRow = Math.min(across, n);
        b.grid(cells, Math.max(1, perRow));
        b.onTap(b.open("light/" + id + "/colour"));
        return b.root;
    }

    // ---------- reading the model and the state ----------
    static JSONObject find(JSONArray list, String key, String value) {
        if (list == null || value == null || value.isEmpty()) return null;
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o != null && value.equals(o.optString(key))) return o;
        }
        return null;
    }

    /** A light's level: 0 off, -1 on at a level not heard yet (just switched on from a widget). */
    static int levelOf(B b, String id) {
        JSONObject lv = b.state.optJSONObject("levels");
        return lv == null ? 0 : lv.optInt(id, 0);
    }

    /** The colour a lamp is showing, as #rrggbb, or null for a white (or a lamp that has none). */
    static String colorOf(B b, String id) {
        JSONObject cs = b.state.optJSONObject("colors");
        String hex = cs == null ? "" : cs.optString(id, "");
        return hex.startsWith("#") ? hex : null;
    }

    /** How many of these lights are on, and how bright those are on average. */
    static int[] litOf(B b, JSONArray ids) {
        int on = 0, sum = 0, known = 0;
        for (int i = 0; ids != null && i < ids.length(); i++) {
            int lv = levelOf(b, ids.optString(i));
            if (lv != 0) on++;
            if (lv > 0) { sum += lv; known++; }
        }
        return new int[] { on, known == 0 ? 0 : Math.round(sum / (float) known) };
    }

    /** Whether a scene is what its lights are showing now (within a few percent), as Home's chips say it. */
    static boolean showing(B b, JSONObject scene) {
        JSONObject lv = scene.optJSONObject("levels");
        if (lv == null || lv.length() == 0) return false;
        Iterator<String> ids = lv.keys();
        boolean any = false;
        while (ids.hasNext()) {
            String id = ids.next();
            int want = lv.optInt(id, -2), have = levelOf(b, id);
            if (want < 0) continue;
            if (want == 0 ? have != 0 : have <= 0 || Math.abs(have - want) > 4) return false;
            if (want > 0) any = true;
        }
        return any;
    }

    /** The running timer over a target, or over any of the lights it covers: {key, ends}, or null. */
    static String[] timerOver(JSONObject state, String target, JSONArray covers) {
        JSONObject ts = state.optJSONObject("timers");
        if (ts == null) return null;
        long now = System.currentTimeMillis();
        Iterator<String> keys = ts.keys();
        String[] best = null;
        while (keys.hasNext()) {
            String k = keys.next();
            JSONObject t = ts.optJSONObject(k);
            if (t == null || t.optInt("level", 0) > 0 || t.optLong("ends") <= now) continue;
            boolean mine = k.equals(target);
            for (String part : k.split("\\|")) for (int i = 0; !mine && covers != null && i < covers.length(); i++) if (part.equals("d:" + covers.optString(i))) mine = true;
            if (mine && (best == null || t.optLong("ends") < Long.parseLong(best[1]))) best = new String[] { k, String.valueOf(t.optLong("ends")) };
        }
        return best;
    }

    static JSONObject level(String target, Object level) throws Exception {
        return new JSONObject().put("type", "level").put("target", target).put("level", level);
    }

    // ---------- words ----------
    static String minutes(int m, boolean shortForm) {
        if (m % 60 == 0) return (m / 60) + (shortForm ? "h" : m == 60 ? " hr" : " hrs");
        return m + (shortForm ? "m" : " min");
    }

    /** "9:30pm", as the app says a time. */
    static String clock(long t) {
        Calendar k = Calendar.getInstance();
        k.setTimeInMillis(t);
        int h = k.get(Calendar.HOUR_OF_DAY), m = k.get(Calendar.MINUTE);
        return (h % 12 == 0 ? 12 : h % 12) + (m == 0 ? "" : String.format(Locale.US, ":%02d", m)) + (h >= 12 ? "pm" : "am");
    }

    /** "Tonight at 9pm", "Tomorrow at 7am", "Friday at 6:30pm". */
    static String whenText(long t) {
        Calendar now = Calendar.getInstance(), k = Calendar.getInstance();
        k.setTimeInMillis(t);
        int days = dayDiff(now, k);
        String at = clock(t);
        if (days == 0) return (k.get(Calendar.HOUR_OF_DAY) >= 17 ? "Tonight at " : "Today at ") + at;
        if (days == 1) return "Tomorrow at " + at;
        return new SimpleDateFormat("EEEE", Locale.US).format(k.getTime()) + " at " + at;
    }

    /** The run a skip is for, said the way a person would: tonight, today, tomorrow, Friday. */
    static String skipWord(String date, long t) {
        Calendar now = Calendar.getInstance(), k = Calendar.getInstance();
        if (date != null && date.length() == 10) {
            try { k.setTime(new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(date)); if (t > 0) { Calendar tt = Calendar.getInstance(); tt.setTimeInMillis(t); k.set(Calendar.HOUR_OF_DAY, tt.get(Calendar.HOUR_OF_DAY)); } } catch (Exception e) { k.setTimeInMillis(t); }
        } else k.setTimeInMillis(t);
        int days = dayDiff(now, k);
        if (days == 0) return k.get(Calendar.HOUR_OF_DAY) >= 17 ? "tonight" : "today";
        if (days == 1) return "tomorrow";
        return new SimpleDateFormat("EEEE", Locale.US).format(k.getTime());
    }

    private static int dayDiff(Calendar a, Calendar b) {
        Calendar x = (Calendar) a.clone(), y = (Calendar) b.clone();
        for (Calendar z : new Calendar[] { x, y }) { z.set(Calendar.HOUR_OF_DAY, 12); z.set(Calendar.MINUTE, 0); z.set(Calendar.SECOND, 0); z.set(Calendar.MILLISECOND, 0); }
        return Math.round((y.getTimeInMillis() - x.getTimeInMillis()) / 86400000f);
    }

    /** An ISO time from the connector ("2026-09-26T21:30:00-07:00"), as epoch ms; 0 when it is not one. */
    static long parseIso(String iso) {
        if (iso == null || iso.length() < 19) return 0;
        String[] pats = { "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXX", "yyyy-MM-dd'T'HH:mmXXX" };
        for (String p : pats) {
            try { return new SimpleDateFormat(p, Locale.US).parse(iso).getTime(); } catch (Exception ignored) { /* the next shape */ }
        }
        return 0;
    }

    // The twelve lamp colours the app names (web/ui/colour.js), for what a colour is called
    private static final String[][] NAMED = {
        { "Red", "#FF5A4E" }, { "Orange", "#FF8A3D" }, { "Amber", "#FFC24A" }, { "Yellow", "#F5E15B" }, { "Lime", "#9EE06A" }, { "Green", "#4FD39A" },
        { "Teal", "#3CC6D6" }, { "Blue", "#4C8DFF" }, { "Indigo", "#6E6BFF" }, { "Purple", "#A66BFF" }, { "Magenta", "#F06BD2" }, { "Pink", "#FF7AA0" },
    };

    static String colourName(String hex) {
        try {
            float[] hsv = new float[3];
            Color.colorToHSV(Color.parseColor(hex), hsv);
            if (hsv[1] < 0.12f) return "White";
            String best = NAMED[0][0]; float bd = 999;
            for (String[] n : NAMED) {
                float[] o = new float[3];
                Color.colorToHSV(Color.parseColor(n[1]), o);
                float dh = Math.abs(((o[0] - hsv[0] + 540) % 360) - 180);
                if (dh < bd) { bd = dh; best = n[0]; }
            }
            return best;
        } catch (Exception e) {
            return "Colour";
        }
    }

    static String whiteName(int k) { return k <= 2400 ? "Candle" : k <= 3200 ? "Warm" : k <= 4500 ? "Neutral" : k <= 5600 ? "Cool" : "Daylight"; }

    /** A white as the app's white bar draws it: amber at the warm end to near white at the cool end. */
    static int kelvinColor(int k) {
        float p = Math.max(0, Math.min(1, (1e6f / 1900 - 1e6f / k) / (1e6f / 1900 - 1e6f / 6500)));
        int a = 0xFFFF8A1F, z = 0xFFFFF6F0;
        return Color.rgb(Math.round(Color.red(a) + (Color.red(z) - Color.red(a)) * p), Math.round(Color.green(a) + (Color.green(z) - Color.green(a)) * p), Math.round(Color.blue(a) + (Color.blue(z) - Color.blue(a)) * p));
    }

    static int darker(int c) {
        float[] hsv = new float[3];
        Color.colorToHSV(c, hsv);
        hsv[2] *= 0.72f;
        return Color.HSVToColor(hsv);
    }

    // ---------- small pieces ----------
    /** Tint a white shape or glyph: its colour, and how much of it shows (0 to 255). */
    static void tint(RemoteViews v, int id, int color, int alpha) {
        v.setInt(id, "setColorFilter", color | 0xFF000000);
        v.setInt(id, "setImageAlpha", alpha);
    }

    /** Open the app on a page. The page is in the intent's data too, so each route is its own PendingIntent. */
    static PendingIntent open(Context c, String route, int code) {
        Intent i = new Intent(c, MainActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse("caseta-app://open/" + route))
            .putExtra(MainActivity.ROUTE, route).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /**
     * Android 15's generated previews: the widget picker shows each widget as it would look in this home, drawn with
     * the home's own rooms. Android limits how often an app may set them, so only when the home changes, and at most
     * once a day otherwise.
     */
    static void previews(Context c) {
        if (Build.VERSION.SDK_INT < 35 || !WidgetStore.hasModel(c)) return;
        String stamp = WidgetStore.model(c).optString("sig") + "/" + (System.currentTimeMillis() / 86400000L);
        if (stamp.equals(WidgetStore.previewStamp(c))) return;
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        boolean all = true;
        for (String k : KINDS) {
            try {
                JSONObject cfg = new JSONObject().put("kind", k);
                fillDefaults(c, cfg);
                RemoteViews v = build(c, 0, cfg, k.equals("pinned") || k.equals("scenes") ? 250 : 250, k.equals("pinned") ? 180 : 110);
                if (!m.setWidgetPreview(new ComponentName(c, providerOf(k)), AppWidgetProviderInfoCategories.HOME, v)) all = false;
            } catch (Exception e) {
                all = false;
            }
        }
        if (all) WidgetStore.setPreviewStamp(c, stamp);
    }

    /** The widget category the previews are for (the home screen). */
    static final class AppWidgetProviderInfoCategories {
        static final int HOME = android.appwidget.AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN;
    }
}
