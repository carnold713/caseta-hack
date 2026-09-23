package app.caseta.home;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/** The app: the hub's own web app in a WebView, with the Hub plugin for the pieces outside it. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HubPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
