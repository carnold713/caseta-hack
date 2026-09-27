package app.caseta.home;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Region;
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
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The quick panel: brightness that follows a finger, on a card over the home screen. A widget cannot be dragged
 * (RemoteViews has no slider), so the Dimmers widget and the Room widget open this: on a room it shows the room, its
 * own bar first and then each of its lights; on a light, that light and the others in its room; with nothing
 * chosen, what is pinned on Home. A tap on a pin in that list steps into it in place, with a short slide inside the
 * card, and the chevron in the title (or Back) steps out to the list again. It is plain Android views, with no
 * WebView and nothing of the app's, so it opens at once, and its own task (taskAffinity in the manifest) means
 * closing it goes back to the home screen, never into the app.
 *
 * Levels go to the hub through HubClient off the main thread, one request in flight per item with the newest value
 * next, as the app's gate does while a finger moves, so a drag never floods the hub. The panel keeps each light's
 * level itself: a room's bar is worked out from its lights (Widgets.roomLevel), so dragging the room moves every
 * light's bar with it and dragging a light moves the room's. What was set is written into the widgets' state and
 * the widgets are drawn from it, so the home screen already matches when the panel closes; the hub is read again
 * once it has.
 */
public class QuickPanelActivity extends ComponentActivity {
    /** The item to open on ("a:3", "d:5"), or "" for the list. */
    static final String FOCUS = "focus";
    /** The look of the widget it was opened from: Day is kept, everything else is Copper Night. */
    static final String THEME = "theme";

    private static final int COPPER = Widgets.COPPER;
    private static final int SLIDE_MS = 260;
    private static final ExecutorService POOL = Executors.newCachedThreadPool();
    // the gate: per item, the newest level waiting to go, and whether one is on its way
    private static final Map<String, Object> LATEST = new HashMap<>();
    private static final Set<String> INFLIGHT = new HashSet<>();

    private final Handler ui = new Handler(Looper.getMainLooper());
    // each light's level as the panel shows it (0 off, 1 to 100, -1 on at a level not heard yet), and until when
    // (uptime) a read of the hub leaves one alone because it was just set here
    private final Map<String, Integer> levels = new HashMap<>();
    private final Map<String, Long> held = new HashMap<>();
    private final Map<String, JSONObject> lightsById = new HashMap<>();
    private List<Item> shown = new ArrayList<>();
    private JSONObject model = new JSONObject();
    private String page = "";
    private Context app;
    private float dp;
    private int slop;
    private Palette pal;
    private Typeface regular = Typeface.SANS_SERIF;
    private Typeface bold = Typeface.DEFAULT_BOLD;
    private View scrim;
    private Sheet card;
    private Scroll scroll;
    private Pages pages;
    private TextView title;
    private ImageView chevron;
    private boolean closing, touched, reconciled, moving, fingerDown;

    /** Copper Night, or Day when the widget it was opened from is in Day. Copper is "on" in both. */
    private static final class Palette {
        int card, ink, sub, track, rest;

        Palette(boolean day) {
            if (day) { card = 0xFFF5F2EE; ink = 0xFF1A1A1A; sub = 0xFF6E6E6E; track = 0xFFE6E1DB; rest = 0xFFD3CCC4; }
            else { card = 0xFF1E1E1E; ink = 0xFFFFFFFF; sub = 0xFF9E9E9E; track = 0xFF2B2B2B; rest = 0xFF3D3D3D; }
        }
    }

    /** A room or a light on the page showing, and the views that show it. */
    private static final class Item {
        final String key, name, id;
        final boolean room, dimmable;
        /** A room's light ids. */
        final JSONArray lights;
        /** What its bar says: its name, or "Whole room" for a room's own bar on its page. */
        String label;
        /** On the list, a tap steps into it rather than setting a level. */
        boolean opens;
        LinearLayout view;
        GradientDrawable glow, dot;
        ImageView power;
        Bar bar;
        TextView says;

        Item(String key, String name, String id, boolean room, boolean dimmable, JSONArray lights) {
            this.key = key;
            this.name = name;
            this.id = id;
            this.room = room;
            this.dimmable = dimmable;
            this.lights = lights;
            label = name;
        }
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        app = getApplicationContext();
        // Back steps out of a room to the list, and from the list closes the panel, fading out
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                QuickPanelActivity.this.back();
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
    private void build() {
        dp = getResources().getDisplayMetrics().density;
        slop = ViewConfiguration.get(this).getScaledTouchSlop();
        Intent in = getIntent();
        String theme = in == null ? null : in.getStringExtra(THEME);
        String focus = in == null ? null : in.getStringExtra(FOCUS);
        pal = new Palette("day".equals(theme));
        fonts();
        edgeToEdge();
        load();

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
        gp.bottomMargin = px(4);
        card.addView(grab, gp);
        card.addView(heading(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        scroll = new Scroll(this);
        scroll.maxH = Math.round(getResources().getDisplayMetrics().heightPixels * 0.66f);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        pages = new Pages(this);
        scroll.addView(pages, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        card.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        go(focus == null ? "" : focus, true);

        setContentView(root);
        // The card rises from below the screen once it has a height, on a decelerating curve, and the dim comes up
        // with it.
        card.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                card.getViewTreeObserver().removeOnPreDrawListener(this);
                card.setTranslationY(card.getHeight() + 32 * dp);
                card.animate().translationY(0f).setDuration(280).setInterpolator(new DecelerateInterpolator(2f)).start();
                scrim.animate().alpha(1f).setDuration(280).start();
                return true;
            }
        });
        // drawn from what the phone knows, then from what the hub says now
        if (HubStore.signedIn(app)) read(0);
    }

    /** The home as the widgets have it (WidgetStore): the rooms and lights, and each light's level. */
    private void load() {
        model = WidgetStore.model(app);
        JSONArray all = model.optJSONArray("lights");
        for (int i = 0; all != null && i < all.length(); i++) {
            JSONObject d = all.optJSONObject(i);
            if (d != null) lightsById.put(d.optString("id"), d);
        }
        JSONObject lv = WidgetStore.state(app).optJSONObject("levels");
        Iterator<String> ids = lv == null ? null : lv.keys();
        while (ids != null && ids.hasNext()) {
            String id = ids.next();
            levels.put(id, lv.optInt(id, 0));
        }
    }

    /** The title: a chevron back to the list while a room or a light is showing, and what is showing. */
    private View heading() {
        LinearLayout line = new LinearLayout(this);
        line.setOrientation(LinearLayout.HORIZONTAL);
        line.setGravity(Gravity.CENTER_VERTICAL);
        line.setMinimumHeight(px(48));
        line.setPadding(0, 0, 0, px(4));
        chevron = new ImageView(this);
        chevron.setImageResource(R.drawable.wi_chev);
        chevron.setRotation(180f);
        chevron.setScaleType(ImageView.ScaleType.CENTER);
        chevron.setColorFilter(pal.ink);
        chevron.setContentDescription("Back");
        chevron.setOnClickListener(tapped -> { press(tapped); back(); });
        line.addView(chevron, new LinearLayout.LayoutParams(px(44), px(44)));
        title = new TextView(this);
        title.setTextColor(pal.ink);
        title.setTypeface(bold);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setMaxLines(2);
        title.setEllipsize(TextUtils.TruncateAt.END);
        line.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return line;
    }

    /** The list: what is pinned on Home, each a bar that drags, and a tap steps into it. */
    private View listPage() {
        LinearLayout col = column();
        List<Item> now = new ArrayList<>();
        shown = now;
        if (!HubStore.signedIn(app)) { col.addView(note("Open the app to sign in")); return col; }
        List<JSONObject> pins;
        try { pins = Widgets.pinnedItems(model); } catch (Exception unreadable) { pins = new ArrayList<>(); }
        for (JSONObject p : pins) {
            Item it = itemFor(p.optString("key"));
            if (it == null) continue;
            it.opens = true;
            col.addView(barRow(it));
            now.add(it);
        }
        if (now.isEmpty()) col.addView(note("Pin lights and rooms on Home"));
        return col;
    }

    /**
     * A room: its own bar first (the whole room), then each of its lights. A light: its bar, then the others in its
     * room under the room's name. A light that only switches has its power button and no bar.
     */
    private View itemPage(Item top) {
        LinearLayout col = column();
        List<Item> now = new ArrayList<>();
        shown = now;
        List<String> rest = new ArrayList<>();
        String roomName = null;
        if (top.room) {
            top.label = "Whole room";
            for (int i = 0; top.lights != null && i < top.lights.length(); i++) rest.add(top.lights.optString(i));
        } else {
            JSONObject d = lightsById.get(top.id);
            JSONObject room = d == null ? null : Widgets.find(model.optJSONArray("rooms"), "id", d.optString("room"));
            JSONArray ids = room == null ? null : room.optJSONArray("lights");
            for (int i = 0; ids != null && i < ids.length(); i++) if (!top.id.equals(ids.optString(i))) rest.add(ids.optString(i));
            if (room != null) roomName = room.optString("name");
        }
        col.addView(rowOf(top));
        now.add(top);
        if (!rest.isEmpty()) {
            if (roomName != null && !roomName.isEmpty()) col.addView(caption(roomName));
            else col.addView(new View(this), new LinearLayout.LayoutParams(1, px(10)));
        }
        for (String id : rest) {
            Item it = itemFor("d:" + id);
            if (it == null) continue;
            col.addView(rowOf(it));
            now.add(it);
        }
        return col;
    }

    /** A room or a light from the model, or null when the model no longer has it. */
    private Item itemFor(String key) {
        if (key == null) return null;
        if (key.startsWith("a:")) {
            JSONObject room = Widgets.find(model.optJSONArray("rooms"), "id", key.substring(2));
            if (room == null) return null;
            JSONArray ids = room.optJSONArray("lights");
            boolean dim = false;
            for (int i = 0; ids != null && i < ids.length() && !dim; i++) dim = dims(ids.optString(i));
            return new Item(key, room.optString("name"), room.optString("id"), true, dim, ids);
        }
        if (key.startsWith("d:")) {
            JSONObject d = lightsById.get(key.substring(2));
            if (d == null) return null;
            return new Item(key, d.optString("name"), d.optString("id"), false, d.optBoolean("dim", true), null);
        }
        return null;
    }

    private View rowOf(Item it) { return it.dimmable ? barRow(it) : switchRow(it); }

    /** A bar and its power button. */
    private View barRow(Item it) {
        LinearLayout line = rowLine(it);
        it.bar = new Bar(this, it);
        line.addView(it.bar, new LinearLayout.LayoutParams(0, px(56), 1f));
        line.addView(powerOf(it), powerAt());
        paint(it);
        return line;
    }

    /** A light that only switches: its name, on or off, and its power button. */
    private View switchRow(Item it) {
        LinearLayout line = rowLine(it);
        line.setMinimumHeight(px(68));
        TextView name = new TextView(this);
        name.setText(it.label);
        name.setTextColor(pal.ink);
        name.setTypeface(bold);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        name.setMaxLines(2);
        name.setPadding(px(20), 0, px(8), 0);
        line.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        it.says = new TextView(this);
        it.says.setTextColor(pal.sub);
        it.says.setTypeface(regular);
        it.says.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        line.addView(it.says, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        line.addView(powerOf(it), powerAt());
        paint(it);
        return line;
    }

    private LinearLayout rowLine(Item it) {
        LinearLayout line = new LinearLayout(this);
        line.setOrientation(LinearLayout.HORIZONTAL);
        line.setGravity(Gravity.CENTER_VERTICAL);
        int p = px(6);
        line.setPadding(p, p, p, p);
        it.glow = new GradientDrawable();
        it.glow.setColor(COPPER);
        it.glow.setCornerRadius(34 * dp);
        it.glow.setAlpha(0);
        line.setBackground(it.glow);
        it.view = line;
        return line;
    }

    private View powerOf(Item it) {
        it.dot = new GradientDrawable();
        it.dot.setShape(GradientDrawable.OVAL);
        it.power = new ImageView(this);
        it.power.setBackground(it.dot);
        it.power.setImageResource(R.drawable.wi_power);
        it.power.setScaleType(ImageView.ScaleType.CENTER);
        it.power.setOnClickListener(tapped -> { press(tapped); toggle(it); });
        return it.power;
    }

    private LinearLayout.LayoutParams powerAt() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(px(56), px(56));
        lp.setMarginStart(px(10));
        return lp;
    }

    private LinearLayout column() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        return col;
    }

    private TextView caption(String words) {
        TextView line = new TextView(this);
        line.setText(words);
        line.setTextColor(pal.sub);
        line.setTypeface(bold);
        line.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        line.setPadding(px(26), px(14), px(26), px(4));
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

    private float sp(float v) { return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, getResources().getDisplayMetrics()); }

    private static int clamp(int v) { return Math.max(0, Math.min(100, v)); }

    // ---------- moving between the list and an item ----------
    /** Show the list ("") or a room or a light: in place at first, then with a slide (forward into an item, back out). */
    private void go(String key, boolean forward) {
        if (moving) return;
        Item top = key.isEmpty() ? null : itemFor(key);
        String from = page;
        page = top == null ? "" : key;
        View next = top == null ? listPage() : itemPage(top);
        title.setText(top == null ? "Pinned" : top.name);
        chevron.setVisibility(top == null ? View.GONE : View.VISIBLE);
        title.setPadding(top == null ? px(12) : px(2), 0, px(8), 0);
        FrameLayout.LayoutParams fill = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        if (pages.getChildCount() == 0 || pages.getWidth() == 0) {
            pages.removeAllViews();
            pages.addView(next, fill);
            return;
        }
        title.setAlpha(0f);
        title.animate().alpha(1f).setDuration(180).start();
        slide(next, fill, forward);
        // back on the list, the pin that was open is where the eye is, lit for a moment
        if (top == null && !from.isEmpty()) pages.postDelayed(() -> glowRow(from), SLIDE_MS);
    }

    private void back() {
        if (moving) return;
        if (!page.isEmpty()) go("", false);
        else close();
    }

    /**
     * The page showing slides a little and fades out as the next one slides in from the other side, and the card's
     * height follows from the one to the other rather than jumping (the list's height is held fixed while it moves).
     */
    private void slide(View next, FrameLayout.LayoutParams fill, boolean forward) {
        final View prev = pages.getChildAt(pages.getChildCount() - 1);
        final ViewGroup.LayoutParams lp = scroll.getLayoutParams();
        int w = pages.getWidth();
        int from = scroll.getHeight();
        pages.addView(next, fill);
        next.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        int to = Math.min(next.getMeasuredHeight(), scroll.maxH);
        scroll.scrollTo(0, 0);
        moving = true;
        float shift = w * 0.3f * (forward ? 1 : -1);
        next.setTranslationX(shift);
        next.setAlpha(0f);
        next.animate().translationX(0f).alpha(1f).setDuration(SLIDE_MS).setInterpolator(new DecelerateInterpolator(1.5f)).start();
        prev.animate().translationX(-shift).alpha(0f).setDuration(200).setInterpolator(new AccelerateInterpolator()).withEndAction(() -> pages.removeView(prev)).start();
        lp.height = from;
        scroll.setLayoutParams(lp);
        ValueAnimator grow = ValueAnimator.ofInt(from, to);
        grow.setDuration(SLIDE_MS);
        grow.setInterpolator(new DecelerateInterpolator(1.5f));
        grow.addUpdateListener(anim -> {
            lp.height = (int) anim.getAnimatedValue();
            scroll.setLayoutParams(lp);
        });
        grow.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator done) {
                lp.height = ViewGroup.LayoutParams.WRAP_CONTENT;
                scroll.setLayoutParams(lp);
                moving = false;
            }
        });
        grow.start();
    }

    private void glowRow(String key) {
        if (isFinishing() || isDestroyed()) return;
        for (Item it : shown) {
            if (!it.key.equals(key) || it.view == null) continue;
            scroll.smoothScrollTo(0, Math.max(0, it.view.getTop() - (scroll.getHeight() - it.view.getHeight()) / 2));
            final GradientDrawable glow = it.glow;
            ValueAnimator pulse = ValueAnimator.ofFloat(0f, 1f);
            pulse.setDuration(1000);
            pulse.addUpdateListener(anim -> {
                float f = (float) anim.getAnimatedValue();
                float k = f < 0.25f ? f / 0.25f : 1f - (f - 0.25f) / 0.75f;
                glow.setAlpha(Math.round(64 * k));
            });
            pulse.start();
            return;
        }
    }

    // ---------- opening and closing ----------
    /** A tap outside the card, Back from the list, or the card pulled down: it fades out and goes. */
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

    // ---------- levels ----------
    private int lv(String id) {
        Integer v = levels.get(id);
        return v == null ? 0 : v;
    }

    private boolean dims(String id) {
        JSONObject d = lightsById.get(id);
        return d == null || d.optBoolean("dim", true);
    }

    /** A light's level, or a room's worked out from its lights (the same rule as Widgets.roomLevel). */
    private int levelOf(Item it) {
        if (!it.room) return lv(it.id);
        int on = 0, sum = 0, known = 0;
        for (int i = 0; it.lights != null && i < it.lights.length(); i++) {
            String id = it.lights.optString(i);
            int v = lv(id);
            if (v != 0) on++;
            if (v > 0 && dims(id)) { sum += v; known++; }
        }
        return on == 0 ? 0 : known == 0 ? -1 : Math.round(sum / (float) known);
    }

    private List<String> idsOf(Item it) {
        List<String> out = new ArrayList<>();
        if (!it.room) out.add(it.id);
        for (int i = 0; it.room && it.lights != null && i < it.lights.length(); i++) out.add(it.lights.optString(i));
        return out;
    }

    /**
     * A level from a finger. A room sets every light in it, as the hub does with the room's command: the ones that
     * dim to the level, the ones that switch on or off with it. Each bar showing redraws from that at once.
     */
    private void setFromFinger(Item it, int level) {
        long until = SystemClock.uptimeMillis() + 2500;
        for (String id : idsOf(it)) {
            levels.put(id, !it.room || dims(id) ? level : level > 0 ? 100 : 0);
            held.put(id, until);
        }
        send(app, it.key, level);
        redraw();
    }

    /** A level set by a finger (a drag let go, or a tap on a bar): into the widgets' state. */
    private void settled(Item it) {
        touched = true;
        int now = levelOf(it);
        final Context a = app;
        final String key = it.key;
        final Object says = now < 0 ? "on" : Integer.valueOf(now);
        bg(a, () -> WidgetActions.expectLevel(a, key, says));
    }

    /** The power button: on or off for that item. */
    private void toggle(Item it) {
        boolean wasOn = levelOf(it) != 0;
        final String word = wasOn ? "off" : "on";
        long until = SystemClock.uptimeMillis() + 700;
        for (String id : idsOf(it)) {
            if (wasOn) levels.put(id, 0);
            else if (lv(id) == 0) levels.put(id, -1);
            held.put(id, until);
        }
        redraw();
        send(app, it.key, word);
        touched = true;
        final Context a = app;
        final String key = it.key;
        bg(a, () -> WidgetActions.expectLevel(a, key, word));
        // the level a light comes on at is the hub's to say
        read(900);
    }

    /** Every bar, button and word on the page showing, from the levels. */
    private void redraw() {
        for (Item it : shown) paint(it);
    }

    private void paint(Item it) {
        int level = levelOf(it);
        boolean on = level != 0;
        if (it.dot != null) {
            it.dot.setColor(on ? COPPER : pal.track);
            it.power.setColorFilter(on ? 0xFFFFFFFF : pal.ink);
            it.power.setContentDescription("Turn " + it.name + (on ? " off" : " on"));
        }
        if (it.bar != null) it.bar.redraw();
        if (it.says != null) it.says.setText(on ? "On" : "Off");
    }

    /** Read the hub (after `delay` ms) and show what it says, on every light not just set here. */
    private void read(long delay) {
        final Context a = app;
        bg(a, () -> {
            if (delay > 0) nap(delay);
            WidgetActions.refreshNow(a);
            ui.post(this::reload);
        });
    }

    private void reload() {
        if (isFinishing() || isDestroyed() || closing || fingerDown) return;
        JSONObject lv = WidgetStore.state(app).optJSONObject("levels");
        if (lv == null) return;
        long now = SystemClock.uptimeMillis();
        Iterator<String> ids = lv.keys();
        while (ids.hasNext()) {
            String id = ids.next();
            Long until = held.get(id);
            if (until != null && now < until) continue;
            levels.put(id, lv.optInt(id, 0));
        }
        redraw();
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

    /** The pages, as tall as the one showing up to most of the screen, then scrolling. */
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

    /** Where the pages slide: while one is sliding, a touch waits for it to finish. */
    private final class Pages extends FrameLayout {
        Pages(Context c) { super(c); }

        @Override
        public boolean onInterceptTouchEvent(MotionEvent e) {
            return moving || super.onInterceptTouchEvent(e);
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            return moving || super.onTouchEvent(e);
        }
    }

    /**
     * A brightness bar, as the app's house bar: a 56dp pill with the fill in copper up to the level and a white knob
     * inside the end of the fill. The name sits at the left and the level at the right, always whole: over the fill
     * they are white, over the empty track the card's ink, and where the knob passes over them they are dark, so they
     * read wherever the knob is. A name too long for the room left (past about 24 letters at phone width) steps down
     * a size, then takes two lines; it is only ever cut short past that.
     *
     * A sideways drag moves it with the finger and sends each level as it goes (gated). A tap sets the level where it
     * lands, or on the list steps into the item. A room of lights that only switch switches on a tap instead.
     */
    private final class Bar extends View {
        private final Item row;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint nameInk = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint levelInk = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private final Path fillPath = new Path();
        private final Path knobPath = new Path();
        private final List<String> lines = new ArrayList<>(2);
        private float laidW = -1;
        private String laidLabel = null;
        private float downX, downY;
        private int startLevel;
        private boolean dragging;

        Bar(Context c, Item row) {
            super(c);
            this.row = row;
            nameInk.setTypeface(bold);
            levelInk.setTypeface(regular);
            levelInk.setTextSize(sp(14));
            setFocusable(true);
        }

        void redraw() {
            invalidate();
            int lv = QuickPanelActivity.this.levelOf(row);
            setContentDescription(row.label + ", " + (lv == 0 ? "off" : lv > 0 ? lv + "%" : "on"));
        }

        /** The name's lines and size for this width: 15sp, else 13sp, else two lines at 13sp. */
        private void lay(float w) {
            String name = row.label == null ? "" : row.label;
            if (w == laidW && name.equals(laidLabel)) return;
            laidW = w;
            laidLabel = name;
            lines.clear();
            float room = w - 40 * dp - levelInk.measureText("100%") - 12 * dp;
            nameInk.setTextSize(sp(15));
            if (nameInk.measureText(name) <= room) { lines.add(name); return; }
            nameInk.setTextSize(sp(13));
            if (nameInk.measureText(name) <= room) { lines.add(name); return; }
            int cut = -1;
            for (int i = name.indexOf(' '); i > 0; i = name.indexOf(' ', i + 1)) {
                if (nameInk.measureText(name, 0, i) <= room) cut = i;
                else break;
            }
            if (cut <= 0) { lines.add(TextUtils.ellipsize(name, nameInk, room, TextUtils.TruncateAt.END).toString()); return; }
            lines.add(name.substring(0, cut));
            String more = name.substring(cut + 1);
            lines.add(nameInk.measureText(more) <= room ? more : TextUtils.ellipsize(more, nameInk, room, TextUtils.TruncateAt.END).toString());
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth(), h = getHeight(), rad = h / 2f;
            if (w <= 0 || h <= 0) return;
            int lv = QuickPanelActivity.this.levelOf(row);
            boolean on = lv != 0;
            lay(w);
            // the fill is never narrower than the knob's circle, so the knob always has its 8dp all round
            float end = h + (lv < 0 ? 1f : Math.min(100, lv) / 100f) * (w - h);
            box.set(0, 0, w, h);
            paint.setColor(pal.track);
            canvas.drawRoundRect(box, rad, rad, paint);
            box.set(0, 0, end, h);
            paint.setColor(on ? COPPER : pal.rest);
            canvas.drawRoundRect(box, rad, rad, paint);
            fillPath.reset();
            fillPath.addRoundRect(box, rad, rad, Path.Direction.CW);
            String level = !on ? "Off" : lv > 0 ? lv + "%" : "On";

            canvas.save();
            canvas.clipPath(fillPath);
            words(canvas, w, h, level, on ? 0xFFFFFFFF : pal.ink, on ? 0xD9FFFFFF : pal.sub);
            canvas.restore();
            canvas.save();
            clipOut(canvas, fillPath);
            words(canvas, w, h, level, pal.ink, pal.sub);
            canvas.restore();
            if (!row.dimmable) return;

            float kr = rad - 8 * dp, kx = end - rad;
            paint.setColor(0x38000000);
            canvas.drawCircle(kx, rad + 1.5f * dp, kr + 0.5f * dp, paint);
            paint.setColor(0xFFFFFFFF);
            canvas.drawCircle(kx, rad, kr, paint);
            knobPath.reset();
            knobPath.addCircle(kx, rad, kr, Path.Direction.CW);
            canvas.save();
            canvas.clipPath(knobPath);
            words(canvas, w, h, level, 0xFF1A1A1A, 0xFF5A5A5A);
            canvas.restore();
        }

        private void words(Canvas canvas, float w, float h, String level, int ink, int sub) {
            float pad = 20 * dp;
            nameInk.setColor(ink);
            levelInk.setColor(sub);
            float lineH = nameInk.descent() - nameInk.ascent();
            float top = h / 2f - lineH * lines.size() / 2f;
            for (int i = 0; i < lines.size(); i++) canvas.drawText(lines.get(i), pad, top + i * lineH - nameInk.ascent(), nameInk);
            float base = h / 2f - (levelInk.descent() + levelInk.ascent()) / 2f;
            canvas.drawText(level, w - pad - levelInk.measureText(level), base, levelInk);
        }

        @SuppressWarnings("deprecation")
        private void clipOut(Canvas canvas, Path p) {
            if (Build.VERSION.SDK_INT >= 26) canvas.clipOutPath(p);
            else canvas.clipPath(p, Region.Op.DIFFERENCE);
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: {
                    downX = e.getX();
                    downY = e.getY();
                    dragging = false;
                    int lv = QuickPanelActivity.this.levelOf(row);
                    startLevel = lv < 0 ? 100 : lv;
                    return true;
                }
                case MotionEvent.ACTION_MOVE: {
                    if (!dragging) {
                        float dx = e.getX() - downX, dy = e.getY() - downY;
                        if (!row.dimmable || Math.abs(dx) <= slop || Math.abs(dx) <= Math.abs(dy)) return true;
                        // from here the bar is the finger's: the list does not scroll and the card does not pull
                        dragging = true;
                        fingerDown = true;
                        downX = e.getX();
                        if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                    }
                    float span = Math.max(1f, getWidth() - getHeight());
                    set(QuickPanelActivity.clamp(Math.round(startLevel + (e.getX() - downX) / span * 100f)), true);
                    return true;
                }
                case MotionEvent.ACTION_UP:
                    if (dragging) {
                        letGo();
                    } else if (row.opens) {
                        QuickPanelActivity.this.go(row.key, true);
                    } else if (!row.dimmable) {
                        QuickPanelActivity.this.toggle(row);
                    } else {
                        float span = Math.max(1f, getWidth() - getHeight());
                        set(QuickPanelActivity.clamp(Math.round((e.getX() - getHeight() / 2f) / span * 100f)), false);
                        QuickPanelActivity.this.settled(row);
                    }
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    if (dragging) letGo();
                    return true;
                default:
                    return true;
            }
        }

        private void letGo() {
            dragging = false;
            fingerDown = false;
            QuickPanelActivity.this.settled(row);
        }

        /** A new level from the finger: every bar showing follows, it goes through the gate, and either end ticks. */
        private void set(int lv, boolean sliding) {
            if (lv == QuickPanelActivity.this.levelOf(row)) return;
            if (sliding && (lv == 0 || lv == 100)) performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            QuickPanelActivity.this.setFromFinger(row, lv);
        }

        @Override
        public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
            super.onInitializeAccessibilityNodeInfo(info);
            info.setClassName(row.dimmable ? "android.widget.SeekBar" : "android.widget.Button");
            if (row.dimmable) {
                info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD);
                info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD);
            }
            if (row.opens) info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK);
        }

        @Override
        public boolean performAccessibilityAction(int action, Bundle args) {
            boolean up = action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD, down = action == AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
            if (row.dimmable && (up || down)) {
                int cur = QuickPanelActivity.this.levelOf(row);
                set(QuickPanelActivity.clamp((cur < 0 ? 100 : cur) + (up ? 10 : -10)), false);
                QuickPanelActivity.this.settled(row);
                return true;
            }
            if (row.opens && action == AccessibilityNodeInfo.ACTION_CLICK) {
                QuickPanelActivity.this.go(row.key, true);
                return true;
            }
            return super.performAccessibilityAction(action, args);
        }
    }
}
