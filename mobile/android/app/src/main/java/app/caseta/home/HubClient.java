package app.caseta.home;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/**
 * The hub's own API, from outside the page: the same POST /api/command the app sends, with the same sign-in.
 * Blocking; callers run it off the main thread (a tile's click, a receiver's goAsync).
 */
final class HubClient {
    private HubClient() {}

    static final class Result {
        final int status;
        final String body;
        Result(int status, String body) { this.status = status; this.body = body; }
        boolean ok() { return status >= 200 && status < 300; }
    }

    static Result command(Context c, JSONObject action) {
        return request(c, "POST", "/api/command", action.toString());
    }

    /** Every light and switch off: the one thing the tile and the widget's button do. */
    static Result allOff(Context c) {
        try {
            return command(c, new JSONObject().put("type", "level").put("target", "h:all").put("level", "off"));
        } catch (Exception e) {
            return new Result(0, e.toString());
        }
    }

    /**
     * How many lights are on and how bright on average, read from the hub's snapshot: what the widget shows when
     * it refreshes by itself. Null when the hub cannot be reached or this phone is not signed in.
     */
    static int[] house(Context c) {
        Result r = request(c, "GET", "/api/snapshot", null);
        if (!r.ok()) return null;
        try {
            JSONObject snap = new JSONObject(r.body);
            JSONObject devices = snap.getJSONObject("inventory").getJSONObject("devices");
            JSONObject states = snap.optJSONObject("states");
            int on = 0, sum = 0;
            Iterator<String> ids = devices.keys();
            while (ids.hasNext()) {
                String id = ids.next();
                JSONObject d = devices.getJSONObject(id);
                String domain = d.optString("domain", "");
                if (!domain.equals("light") && !domain.equals("switch")) continue;
                JSONObject s = states == null ? null : states.optJSONObject(id);
                int lv = s == null ? 0 : s.optInt("level", 0);
                if (lv > 0) { on++; sum += lv; }
            }
            return new int[] { on, on == 0 ? 0 : Math.round(sum / (float) on) };
        } catch (Exception e) {
            return null;
        }
    }

    static Result request(Context c, String method, String path, String body) {
        if (!HubStore.signedIn(c)) return new Result(401, "not signed in");
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(HubStore.url(c) + path).openConnection();
            conn.setRequestMethod(method);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(12000);
            conn.setRequestProperty("authorization", "Bearer " + HubStore.token(c));
            conn.setRequestProperty("content-type", "application/json");
            if (body != null) {
                conn.setDoOutput(true);
                try (OutputStream out = conn.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
            }
            int status = conn.getResponseCode();
            if (status == 401) HubStore.clear(c);   // signed out elsewhere: the tile and widget say so until the app signs in again
            InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            return new Result(status, in == null ? "" : read(in));
        } catch (Exception e) {
            return new Result(0, e.toString());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        in.close();
        return buf.toString("UTF-8");
    }

    /** A target the app handed over as text: "d:5", or a JSON list for a room's timer ("[\"d:5\",\"d:6\"]"). */
    static Object target(String t) {
        if (t != null && t.startsWith("[")) {
            try { return new JSONArray(t); } catch (Exception ignored) { /* a plain string then */ }
        }
        return t;
    }
}
