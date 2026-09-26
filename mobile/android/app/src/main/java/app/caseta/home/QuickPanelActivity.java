package app.caseta.home;

import android.animation.ValueAnimator;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.RequiresApi;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The quick panel: what is pinned on Home, each as a brightness bar that follows a finger, on a card over the home
 * screen. A widget cannot be dragged (RemoteViews has no slider), so the Dimmers widget opens this for a real swipe,
 * on the row whose name was tapped. It is plain Android views, with no WebView and nothing of the app's, so it opens
 * at once, and its own task (taskAffinity in the manifest) means closing it goes back to the home screen, never into
 * the app.
 *
 * Levels go to the hub through HubClient off the main thread, one request in flight per item with the newest value
 * next, as the app's gate does while a finger moves, so a drag never floods the hub. What was set shows at once, is
 * written into the widgets' state and the widgets are drawn from it, so the home screen already matches when the
 * panel closes; the hub is read again once it has.
 */
public class QuickPanelActivity extends ComponentActivity {
    /** The item to open on ("a:3", "d:5"), or "" for none. */
    static final String FOCUS = "focus";
    /** The look of the widget it was opened from: Day is kept, everything else is Copper Night. */
    static final String THEME = "theme";

    private static final int COPPER = Widgets.COPPER;
    private static final ExecutorService POOL = Executors.newCachedThreadPool();
    // the gate: per item, the newest level waiting to go, and whether one is on its way
    private static final Map<String, Object> LATEST = new HashMap<>();
    private static final Set<String> INFLIGHT = new HashSet<>();

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<Row> rows = new ArrayList<>();
    private Context app;
    private float dp;
    private int slop;
    private Palette pal;
    private Typeface regular = Typeface.SANS_SERIF;
    private Typeface bold = Typeface.DEFAULT_BOLD;
    private View scrim;
    private Sheet card;
    private Scroll scroll;
    private boolean closing, touched, reconciled;

    /** Copper Night, or Day when the widget it was opened from is in Day. Copper is "on" in both. */
    private static final class Palette {
        int card, ink, sub, track, rest;

        Palette(boolean day) {
            if (day) { card = 0xFFF5F2EE; ink = 0xFF1A1A1A; sub = 0xFF6E6E6E; track = 0xFFE6E1DB; rest = 0xFFD3CCC4; }
            else { card = 0xFF1E1E1E; ink = 0xFFFFFFFF; sub = 0xFF9E9E9E; track = 0xFF2B2B2B; rest = 0xFF3D3D3D; }
        }
    }

    /** One pinned room or light, and the views that show it. */
    private static final class Row {
        final String key, name, id;
        final boolean room, dimmable;
        final JSONArray lights;
        /** 0 off, 1 to 100, or -1 on at a level not heard yet (just switched on). */
        int level;
        /** Until when (uptime) a read of the hub leaves this row alone: it was just set here. */
        long heldUntil;
        LinearLayout view;
        GradientDrawable glow, dot;
        ImageView power;
        Bar bar;

        Row(String key, JSONObject x, JSONArray all) {
            this.key = key;
            room = key.startsWith("a:");
            name = x.optString("name");
            id = x.optString("id");
            lights = room ? x.optJSONArray("lights") : null;
            // a light that only switches, or a room of them, has nothing to drag
            boolean dim = !room && x.optBoolean("dim", true);
            for (int i = 0; room && lights != null && i < lights.length() && !dim; i++) {
                JSONObject d = Widgets.find(all, "id", lights.optString(i));
                dim = d == null || d.optBoolean("dim", true);
            }
            dimmable = dim;
        }
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        app = getApplicationContext();
        // Back closes it the same way a tap outside does, fading out
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                QuickPanelActivity.this.close();
            }
        });
        try {
            build();
        } catch (Throwable failed) {
            // nothing outside the app may take it down: a panel that cannot be drawn just is not shown
            Safe.note(app, "quick panel", failed);
            finish();
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        // what the hub really did, a moment after the last change, for the widgets on the home screen
        if (touched && !reconciled) {
            reconciled = true;
            final Context a = app;
            bg(a, () -> { nap(1200); WidgetActions.refreshNow(a); });
        }
    }

    // ---------- building it ----------
    private void build() throws Exception {
        dp = getResources().getDisplayMetrics().density;
        slop = ViewConfiguration.get(this).getScaledTouchSlop();
        Intent in = getIntent();
        String theme = in == null ? null : in.getStringExtra(THEME);
        final String focus = in == null ? null : in.getStringExtra(FOCUS);
        pal = new Palette("day".equals(theme));
        fonts();
        edgeToEdge();

        FrameLayout root = new FrameLayout(this);
        scrim = new View(this);
        scrim.setBackgroundColor(0x80000000);
        scrim.setAlpha(0f);
        scrim.setOnClickListener(tapped -> close());
        root.addView(scrim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        card = new Sheet(this);
        GradientDrawable face = new GradientDrawable();
        face.setColor(pal.card);
        face.setCornerRadius(28 * dp);
        card.setBackground(face);
        card.setPadding(px(14), px(10), px(14), px(14));
        card.setElevation(8 * dp);
        FrameLayout.LayoutParams at = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        at.setMargins(px(16), px(16), px(16), px(16));
        root.addView(card, at);
        root.setOnApplyWindowInsetsListener((host, insets) -> {
            margins(insets);
            return insets;
        });

        View grab = new View(this);
        GradientDrawable pill = new GradientDrawable();
        pill.setColor((pal.sub & 0x00FFFFFF) | 0x66000000);
        pill.setCornerRadius(2 * dp);
        grab.setBackground(pill);
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(px(36), px(4));
        gp.gravity = Gravity.CENTER_HORIZONTAL;
        gp.bottomMargin = px(8);
        card.addView(grab, gp);

        scroll = new Scroll(this);
        scroll.maxH = Math.round(getResources().getDisplayMetrics().heightPixels * 0.7f);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        card.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        fill(list);

        setContentView(root);
        // The card rises from below the screen once it has a height, on a decelerating curve, and the dim comes up
        // with it. It opens scrolled to the row that was tapped, which glows for a moment.
        card.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                card.getViewTreeObserver().removeOnPreDrawListener(this);
                card.setTranslationY(card.getHeight() + 32 * dp);
                card.animate().translationY(0f).setDuration(280).setInterpolator(new DecelerateInterpolator(2f)).start();
                scrim.animate().alpha(1f).setDuration(280).start();
                focusOn(focus);
                return true;
            }
        });
        // drawn from what the phone knows, then from what the hub says now
        if (!rows.isEmpty()) read(0);
    }

    /** The rows, from the model and the state the widgets draw from. */
    private void fill(LinearLayout list) throws Exception {
        if (!HubStore.signedIn(app)) { list.addView(note("Open the app to sign in")); return; }
        JSONObject model = WidgetStore.model(app), state = WidgetStore.state(app);
        List<JSONObject> items = Widgets.pinnedItems(model);
        if (items.isEmpty()) { list.addView(note("Pin lights and rooms on Home")); return; }
        JSONArray all = model.optJSONArray("lights");
        for (JSONObject it : items) {
            Row r = new Row(it.getString("key"), it.getJSONObject("x"), all);
            r.level = levelFor(state, r);
            list.addView(rowView(r));
            rows.add(r);
        }
    }

    private View rowView(Row r) {
        LinearLayout line = new LinearLayout(this);
        line.setOrientation(LinearLayout.HORIZONTAL);
        line.setGravity(Gravity.CENTER_VERTICAL);
        int p = px(6);
        line.setPadding(p, p, p, p);
        r.glow = new GradientDrawable();
        r.glow.setColor(COPPER);
        r.glow.setCornerRadius(34 * dp);
        r.glow.setAlpha(0);
        line.setBackground(r.glow);
        r.view = line;

        r.bar = new Bar(this, r);
        line.addView(r.bar, new LinearLayout.LayoutParams(0, px(56), 1f));

        r.dot = new GradientDrawable();
        r.dot.setShape(GradientDrawable.OVAL);
        r.power = new ImageView(this);
        r.power.setBackground(r.dot);
        r.power.setImageResource(R.drawable.wi_power);
        r.power.setScaleType(ImageView.ScaleType.CENTER);
        r.power.setOnClickListener(tapped -> { press(tapped); toggle(r); });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(px(56), px(56));
        lp.setMarginStart(px(10));
        line.addView(r.power, lp);
        paintPower(r);
        r.bar.redraw();
        return line;
    }

    private TextView note(String words) {
        TextView line = new TextView(this);
        line.setText(words);
        line.setTextColor(pal.sub);
        line.setTypeface(regular);
        line.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        line.setGravity(Gravity.CENTER);
        int p = px(20);
        line.setPadding(p, p, p, p);
        return line;
    }

    /** Figtree, the app's font, where Android can pick its weights (9 and later); the system's otherwise. */
    private void fonts() {
        if (Build.VERSION.SDK_INT < 28) return;
        try {
            Typeface fig = getResources().getFont(R.font.figtree);
            regular = Typeface.create(fig, 400, false);
            bold = Typeface.create(fig, 700, false);
        } catch (Throwable missing) {
            regular = Typeface.SANS_SERIF;
            bold = Typeface.DEFAULT_BOLD;
        }
    }

    /** Drawn under the system bars on every Android, so the card's margin is measured from them the same way everywhere. */
    @SuppressWarnings("deprecation")
    private void edgeToEdge() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) w.setDecorFitsSystemWindows(false);
        else w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);
    }

    /** The card sits 16dp inside the system bars and any cutout. */
    @SuppressWarnings("deprecation")
    private void margins(WindowInsets insets) {
        int[] s = Build.VERSION.SDK_INT >= 30 ? Api30.bars(insets)
            : new int[] { insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom() };
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) card.getLayoutParams();
        int m = px(16);
        lp.setMargins(m + s[0], m + s[1], m + s[2], m + s[3]);
        card.setLayoutParams(lp);
    }

    @RequiresApi(30)
    private static final class Api30 {
        static int[] bars(WindowInsets insets) {
            android.graphics.Insets s = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            return new int[] { s.left, s.top, s.right, s.bottom };
        }
    }

    private int px(int v) { return Math.round(v * dp); }

    private static int clamp(int v) { return Math.max(0, Math.min(100, v)); }

    // ---------- opening and closing ----------
    private void focusOn(String key) {
        if (key == null || key.isEmpty()) return;
        for (Row r : rows) {
            if (!r.key.equals(key)) continue;
            scroll.scrollTo(0, Math.max(0, r.view.getTop() - (scroll.getHeight() - r.view.getHeight()) / 2));
            ValueAnimator glow = ValueAnimator.ofFloat(0f, 1f);
            glow.setStartDelay(220);
            glow.setDuration(1100);
            glow.addUpdateListener(anim -> {
                float f = (float) anim.getAnimatedValue();
                float k = f < 0.25f ? f / 0.25f : 1f - (f - 0.25f) / 0.75f;
                r.glow.setAlpha(Math.round(64 * k));
            });
            glow.start();
            return;
        }
    }

    /** A tap outside the card, Back, or the card pulled down: it fades out and goes. */
    private void close() {
        if (closing) return;
        closing = true;
        if (card == null || scrim == null) { leave(); return; }
        card.animate().cancel();
        card.animate().alpha(0f).translationY(card.getTranslationY() + 24 * dp).setDuration(200).setInterpolator(new AccelerateInterpolator()).start();
        scrim.animate().cancel();
        scrim.animate().alpha(0f).setDuration(220).withEndAction(this::leave).start();
    }

    @SuppressWarnings("deprecation")
    private void leave() {
        if (isFinishing()) return;
        finish();
        overridePendingTransition(0, 0);
    }

    private static void press(View view) {
        view.animate().cancel();
        view.setScaleX(0.9f);
        view.setScaleY(0.9f);
        view.animate().scaleX(1f).scaleY(1f).setDuration(180).setInterpolator(new DecelerateInterpolator()).start();
    }

    // ---------- acting ----------
    /** The power button: on or off for that item. */
    private void toggle(Row r) {
        boolean wasOn = r.level != 0;
        final String word = wasOn ? "off" : "on";
        r.level = wasOn ? 0 : -1;
        r.heldUntil = SystemClock.uptimeMillis() + 700;
        r.bar.redraw();
        paintPower(r);
        send(app, r.key, word);
        touched = true;
        final Context a = app;
        final String key = r.key;
        bg(a, () -> WidgetActions.expectLevel(a, key, word));
        // the level a light comes on at is the hub's to say
        read(900);
    }

    /** A level set by a finger (a drag let go, or a tap on the bar): into the widgets' state. */
    private void settled(Row r) {
        r.heldUntil = SystemClock.uptimeMillis() + 2500;
        touched = true;
        final Context a = app;
        final String key = r.key;
        final Object lv = r.level < 0 ? "on" : Integer.valueOf(r.level);
        bg(a, () -> WidgetActions.expectLevel(a, key, lv));
    }

    private void paintPower(Row r) {
        boolean on = r.level != 0;
        r.dot.setColor(on ? COPPER : pal.track);
        r.power.setColorFilter(on ? 0xFFFFFFFF : pal.ink);
        r.power.setContentDescription("Turn " + r.name + (on ? " off" : " on"));
    }

    /** Read the hub (after `delay` ms) and show what it says, on every row not just set here. */
    private void read(long delay) {
        final Context a = app;
        bg(a, () -> {
            if (delay > 0) nap(delay);
            WidgetActions.refreshNow(a);
            ui.post(this::reload);
        });
    }

    private void reload() {
        if (isFinishing() || isDestroyed() || closing) return;
        JSONObject state = WidgetStore.state(app);
        long now = SystemClock.uptimeMillis();
        for (Row r : rows) {
            if (r.bar.dragging || now < r.heldUntil) continue;
            int lv = levelFor(state, r);
            if (lv == r.level) continue;
            r.level = lv;
            r.bar.redraw();
            paintPower(r);
        }
    }

    /** A room's level is the mean of its lights that are lit (Widgets.litOf); -1 when it is on at a level not heard. */
    private static int levelFor(JSONObject state, Row r) {
        if (!r.room) return Widgets.levelIn(state, r.id);
        int[] o = Widgets.litIn(state, r.lights);
        return o[0] == 0 ? 0 : o[1] > 0 ? o[1] : -1;
    }

    /** Work off the main thread, where a throw is noted and goes no further. */
    private static void bg(Context a, Runnable work) {
        try {
            POOL.execute(() -> Safe.run(a, "quick panel", work));
        } catch (Throwable refused) {
            Safe.note(a, "quick panel", refused);
        }
    }

    private static void nap(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException woken) { Thread.currentThread().interrupt(); }
    }

    /**
     * A level for the hub, gated as the app's slider is: one request in flight per item, and while it is, only the
     * newest level waits to go next. Everything between is dropped, so a drag sends a handful, never a flood.
     */
    private static void send(Context a, String key, Object level) {
        synchronized (LATEST) {
            LATEST.put(key, level);
            if (!INFLIGHT.add(key)) return;
        }
        bg(a, () -> drain(a, key));
    }

    private static void drain(Context a, String key) {
        boolean empty = false;
        try {
            while (!empty) {
                Object lv;
                synchronized (LATEST) {
                    lv = LATEST.remove(key);
                    if (lv == null) { INFLIGHT.remove(key); empty = true; }
                }
                if (lv != null) sendNow(a, key, lv);
            }
        } catch (Throwable failed) {
            synchronized (LATEST) { INFLIGHT.remove(key); }
            Safe.note(a, "quick panel send", failed);
        }
    }

    private static void sendNow(Context a, String key, Object lv) {
        try {
            JSONObject act = new JSONObject().put("type", "level").put("target", key).put("level", lv);
            // a level under a finger lands at once, as the app's slider sends it
            if (lv instanceof Integer) act.put("fade", 0);
            HubClient.command(a, act);
        } catch (Throwable failed) {
            Safe.note(a, "quick panel send", failed);
        }
    }

    // ---------- the views ----------
    /** The card: no wider than 560dp, and pulled down (from the top of its list) it goes. */
    private final class Sheet extends LinearLayout {
        private float x0, y0;
        private long t0;
        private boolean pulling;

        Sheet(Context c) {
            super(c);
            setOrientation(VERTICAL);
        }

        @Override
        protected void onMeasure(int wSpec, int hSpec) {
            int max = Math.round(560 * dp);
            if (MeasureSpec.getSize(wSpec) > max) wSpec = MeasureSpec.makeMeasureSpec(max, MeasureSpec.EXACTLY);
            super.onMeasure(wSpec, hSpec);
        }

        @Override
        public boolean onInterceptTouchEvent(MotionEvent e) {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { begin(e); return false; }
            return e.getActionMasked() == MotionEvent.ACTION_MOVE && startsPull(e);
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    begin(e);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (!pulling) startsPull(e);
                    if (pulling) setTranslationY(Math.max(0f, e.getRawY() - y0));
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (pulling) {
                        pulling = false;
                        float moved = getTranslationY();
                        boolean flick = e.getEventTime() - t0 < 300 && moved > 32 * dp;
                        boolean far = moved > Math.min(getHeight() / 4f, 120 * dp);
                        if (e.getActionMasked() == MotionEvent.ACTION_UP && (far || flick)) QuickPanelActivity.this.close();
                        else animate().translationY(0f).setDuration(220).setInterpolator(new DecelerateInterpolator()).start();
                    }
                    return true;
                default:
                    return true;
            }
        }

        private void begin(MotionEvent e) {
            x0 = e.getRawX();
            y0 = e.getRawY();
            t0 = e.getEventTime();
            pulling = false;
        }

        private boolean startsPull(MotionEvent e) {
            float dx = e.getRawX() - x0, dy = e.getRawY() - y0;
            if (dy > slop && dy > Math.abs(dx) * 1.2f && !scroll.canScrollVertically(-1)) {
                pulling = true;
                y0 = e.getRawY();
                return true;
            }
            return false;
        }
    }

    /** The list, as tall as its rows up to most of the screen, then scrolling. */
    private static final class Scroll extends ScrollView {
        int maxH;

        Scroll(Context c) { super(c); }

        @Override
        protected void onMeasure(int wSpec, int hSpec) {
            if (maxH > 0) {
                int size = MeasureSpec.getMode(hSpec) == MeasureSpec.UNSPECIFIED ? maxH : Math.min(maxH, MeasureSpec.getSize(hSpec));
                hSpec = MeasureSpec.makeMeasureSpec(size, MeasureSpec.AT_MOST);
            }
            super.onMeasure(wSpec, hSpec);
        }
    }

    /**
     * A brightness bar, as the app's house bar: a 56dp pill with the fill in copper up to the level, a white knob
     * inside the end of the fill, and the item's name and level on it. A sideways drag moves it with the finger and
     * sends each level as it goes (gated); a tap sets the level where it lands. A light that only switches, or a
     * room of them, switches on a tap instead.
     */
    private final class Bar extends View {
        private final Row row;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint nameInk = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint levelInk = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private float downX, downY;
        private int startLevel;
        private boolean wordsLeft;
        boolean dragging;

        Bar(Context c, Row row) {
            super(c);
            this.row = row;
            nameInk.setTypeface(bold);
            nameInk.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 15, getResources().getDisplayMetrics()));
            levelInk.setTypeface(regular);
            levelInk.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 14, getResources().getDisplayMetrics()));
            setFocusable(true);
        }

        void redraw() {
            invalidate();
            int lv = row.level;
            setContentDescription(row.name + ", " + (lv == 0 ? "off" : lv > 0 ? lv + "%" : "on"));
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth(), h = getHeight(), rad = h / 2f;
            if (w <= 0 || h <= 0) return;
            int lv = row.level;
            boolean on = lv != 0;
            // the fill is never narrower than the knob's circle, so the knob always has its 8dp all round
            float end = h + (lv < 0 ? 1f : Math.min(100, lv) / 100f) * (w - h);
            box.set(0, 0, w, h);
            paint.setColor(pal.track);
            canvas.drawRoundRect(box, rad, rad, paint);
            box.set(0, 0, end, h);
            paint.setColor(on ? COPPER : pal.rest);
            canvas.drawRoundRect(box, rad, rad, paint);
            float kr = rad - 8 * dp, kx = end - rad;
            if (row.dimmable) {
                words(canvas, w, h, on, kx - kr, kx + kr);
                paint.setColor(0x38000000);
                canvas.drawCircle(kx, rad + 1.5f * dp, kr + 0.5f * dp, paint);
                paint.setColor(0xFFFFFFFF);
                canvas.drawCircle(kx, rad, kr, paint);
            } else {
                words(canvas, w, h, on, -w, -w);
            }
        }

        /**
         * The name and level, on whichever side of the knob has room for them: in the fill before it, or on the track
         * after it. They stay on their side until the other has clearly more, so a drag moves them across once.
         */
        private void words(Canvas canvas, float w, float h, boolean on, float knobL, float knobR) {
            int lv = row.level;
            String level = !on ? "Off" : lv > 0 ? lv + "%" : "On";
            float pad = 20 * dp, gap = 8 * dp, clear = 12 * dp;
            float levelW = levelInk.measureText(level);
            float need = nameInk.measureText(row.name) + gap + levelW;
            boolean left;
            float room;
            if (knobR < 0) {
                left = true;
                room = w - 2 * pad;
            } else {
                float leftRoom = knobL - clear - pad, rightRoom = w - pad - (knobR + clear);
                left = wordsLeft
                    ? !(leftRoom < need && rightRoom > leftRoom + 16 * dp)
                    : leftRoom >= need + 16 * dp || (rightRoom < need && leftRoom > rightRoom + 16 * dp);
                wordsLeft = left;
                room = Math.max(0f, left ? leftRoom : rightRoom);
            }
            float x = left ? pad : knobR + clear;
            // on the copper fill the words are white; on the track (or a switch that is off) they are the card's ink
            boolean onFill = left && on;
            nameInk.setColor(onFill ? 0xFFFFFFFF : pal.ink);
            levelInk.setColor(onFill ? 0xD9FFFFFF : pal.sub);
            float base = h / 2f - (nameInk.descent() + nameInk.ascent()) / 2f;
            float nameRoom = room - gap - levelW;
            if (nameRoom > 24 * dp) {
                String name = TextUtils.ellipsize(row.name, nameInk, nameRoom, TextUtils.TruncateAt.END).toString();
                canvas.drawText(name, x, base, nameInk);
                x += nameInk.measureText(name) + gap;
            }
            if (room >= levelW) canvas.drawText(level, x, base, levelInk);
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = e.getX();
                    downY = e.getY();
                    dragging = false;
                    startLevel = row.level < 0 ? 100 : row.level;
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    if (!dragging) {
                        float dx = e.getX() - downX, dy = e.getY() - downY;
                        if (!row.dimmable || Math.abs(dx) <= slop || Math.abs(dx) <= Math.abs(dy)) return true;
                        // from here the bar is the finger's: the list does not scroll and the card does not pull
                        dragging = true;
                        downX = e.getX();
                        if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                    }
                    float span = Math.max(1f, getWidth() - getHeight());
                    set(QuickPanelActivity.clamp(Math.round(startLevel + (e.getX() - downX) / span * 100f)), true);
                    return true;
                }
                case MotionEvent.ACTION_UP:
                    if (dragging) {
                        dragging = false;
                        QuickPanelActivity.this.settled(row);
                    } else if (!row.dimmable) {
                        QuickPanelActivity.this.toggle(row);
                    } else {
                        float span = Math.max(1f, getWidth() - getHeight());
                        set(QuickPanelActivity.clamp(Math.round((e.getX() - getHeight() / 2f) / span * 100f)), false);
                        QuickPanelActivity.this.settled(row);
                    }
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    if (dragging) {
                        dragging = false;
                        QuickPanelActivity.this.settled(row);
                    }
                    return true;
                default:
                    return true;
            }
        }

        /** A new level from the finger: drawn now, sent through the gate, and a tick felt at either end. */
        private void set(int lv, boolean moving) {
            if (lv == row.level) return;
            row.level = lv;
            if (moving && (lv == 0 || lv == 100)) performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            redraw();
            QuickPanelActivity.this.paintPower(row);
            QuickPanelActivity.send(app, row.key, lv);
        }

        @Override
        public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
            super.onInitializeAccessibilityNodeInfo(info);
            info.setClassName(row.dimmable ? "android.widget.SeekBar" : "android.widget.Button");
            if (row.dimmable) {
                info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD);
                info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD);
            }
        }

        @Override
        public boolean performAccessibilityAction(int action, Bundle args) {
            boolean up = action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD, down = action == AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
            if (row.dimmable && (up || down)) {
                int cur = row.level < 0 ? 100 : row.level;
                set(QuickPanelActivity.clamp(cur + (up ? 10 : -10)), false);
                QuickPanelActivity.this.settled(row);
                return true;
            }
            return super.performAccessibilityAction(action, args);
        }
    }
}
