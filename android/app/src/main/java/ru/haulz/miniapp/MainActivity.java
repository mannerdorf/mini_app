package ru.haulz.miniapp;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        disableWebViewTextSelection();
    }

    /** Не показывать системное «Копировать» при long-press в WebView. */
    private void disableWebViewTextSelection() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.setLongClickable(false);
        webView.setOnLongClickListener(view -> true);
    }
}
