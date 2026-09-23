package app.caseta.home;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/** The app: the hub's own web app in a WebView, with the Hub plugin for the pieces outside it. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HubPlugin.class);
        super.onCreate(savedInstanceState);

        // Android's back (the edge swipe, or the button) steps back through the app, as it does in any app: a sheet
        // closes, a room goes back to Rooms, a tab goes back to Home. The page keeps that history itself (one entry
        // per step, app.js). Only on Home, with nowhere left to go back to, does it leave, and then it goes to the
        // background rather than closing, so it opens again at once. Without this, back closed the app from anywhere.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() == null ? null : getBridge().getWebView();
                if (web != null && web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            }
        });
    }
}
