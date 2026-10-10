package com.spxtools.workstationabbtga;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.content.Intent;
import android.net.Uri;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String HOME_URL = "https://workstation-abbtg-a.vercel.app/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            getWindow().setStatusBarColor(Color.rgb(248, 248, 245));
            getWindow().setNavigationBarColor(Color.rgb(248, 248, 245));
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            );

            webView = new WebView(this);
            webView.setBackgroundColor(Color.rgb(248, 248, 245));
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            settings.setLoadsImagesAutomatically(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

            webView.setWebChromeClient(new WebChromeClient());
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    String host = uri.getHost();
                    if ("https".equals(uri.getScheme()) &&
                        ("workstation-abbtg-a.vercel.app".equals(host) ||
                         (host != null && host.endsWith(".vercel.app")))) {
                        return false;
                    }
                    if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        } catch (Exception ignored) { }
                    }
                    return true;
                }
            });
            setContentView(webView);
            if (savedInstanceState != null) {
                webView.restoreState(savedInstanceState);
                if (webView.getUrl() == null) webView.loadUrl(HOME_URL);
            } else {
                webView.loadUrl(HOME_URL);
            }
        } catch (Throwable error) {
            android.util.Log.e("WorkstationABBTGA", "Startup failed", error);
            android.widget.TextView fallback = new android.widget.TextView(this);
            fallback.setText("เปิด Workstation ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
            fallback.setTextSize(18);
            fallback.setTextColor(Color.rgb(23, 37, 59));
            fallback.setGravity(android.view.Gravity.CENTER);
            fallback.setPadding(32, 32, 32, 32);
            setContentView(fallback);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
