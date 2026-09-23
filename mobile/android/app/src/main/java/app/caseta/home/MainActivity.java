package app.caseta.home;

import android.os.Build;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import java.util.Locale;

/** The app: the hub's own web app in a WebView, with the Hub plugin for the pieces outside it. */
public class MainActivity extends BridgeActivity {
    /** Android's back, handed to the page. */
    private OnBackPressedCallback back;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HubPlugin.class);
        // A page that starts loading has not said yet whether it has anywhere to go back to (an older web app never
        // will), so until it does, back is the app's again.
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageStarted(WebView webView) {
                setPageCanGoBack(true);
            }
        });
        super.onCreate(savedInstanceState);

        // Android's back (the edge swipe, or the button) steps back through the app, as it does in any app: a sheet
        // closes, a room goes back to Rooms, a tab goes back to Home. The page keeps that history itself (one entry
        // per step, app.js), and since Android 14 it also follows the swipe as it happens (M13, predictive back,
        // web/ui/predictiveback.js): each part of the gesture is handed to window.__caseta.back in the page, which
        // shows the page it would go back to, springs back on a cancel, and takes the step itself on a commit, so it
        // animates. Older Androids only ever call handleOnBackPressed, which is the same step without the swipe.
        //
        // Only on Home, with nowhere left to go back to, does back leave, and then the app goes to the background
        // rather than closing, so it opens again at once. On Android 13 and later the page says when that is and
        // this steps aside there, so the system's own swipe back to the home screen plays (and does the same). If
        // the page does not answer at all (an older web app, the offline page), back is the WebView's own history.
        back = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackStarted(@NonNull BackEventCompat event) {
                String edge = event.getSwipeEdge() == BackEventCompat.EDGE_RIGHT ? "right" : "left";
                page(String.format(Locale.US, "start('%s', %s, %s)", edge, css(event.getTouchX()), css(event.getTouchY())), null);
            }

            @Override
            public void handleOnBackProgressed(@NonNull BackEventCompat event) {
                page(String.format(Locale.US, "progress(%.4f, %s, %s)", event.getProgress(), css(event.getTouchX()), css(event.getTouchY())), null);
            }

            @Override
            public void handleOnBackCancelled() {
                page("cancel()", null);
            }

            @Override
            public void handleOnBackPressed() {
                page("commit()", took -> {
                    if (!"true".equals(took)) plainBack();
                });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, back);
    }

    /**
     * Whether the page has anywhere to go back to (Hub plugin, backable). Where it has not (Home, at the bottom),
     * Android 13 and later handle back themselves, with their own swipe back to the home screen. Before 13 the
     * system would close the app there instead, so this keeps it and moves the app to the background itself.
     */
    void setPageCanGoBack(boolean can) {
        if (back != null) back.setEnabled(can || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU);
    }

    /** Back as it was before the page followed it: the WebView's own history, or the background at its start. */
    private void plainBack() {
        WebView web = webView();
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    private WebView webView() {
        return getBridge() == null ? null : getBridge().getWebView();
    }

    /** A touch point in the page's own pixels. */
    private String css(float px) {
        float density = getResources().getDisplayMetrics().density;
        return String.format(Locale.US, "%.1f", density > 0 ? px / density : px);
    }

    /**
     * One call on window.__caseta.back in the page, on the main thread (where every back callback runs). The
     * answer is "true" only when the page has that call and it said yes; a page without it answers "false".
     */
    private void page(String call, ValueCallback<String> answer) {
        WebView web = webView();
        if (web == null) {
            if (answer != null) answer.onReceiveValue(null);
            return;
        }
        String js = "(function(){try{var b=window.__caseta&&window.__caseta.back;return b?b." + call + "===true:false}catch(e){return false}})()";
        web.evaluateJavascript(js, answer);
    }
}
