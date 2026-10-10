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
import androidx.core.view.WindowCompat;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String HOME_URL = "https://workstation-abbtg-a.vercel.app/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            // Keep WebView content below system bars on Android 15+ (target SDK 35).
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
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

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    // Weekly Off is a separate PWA at /weekly-off/index.html. Add an
                    // app-shell-only entry to the existing responsive navigation.
                    String script =
                        "(function(){try{" +
                        "var nav=document.getElementById('views');" +
                        "if(!nav||document.getElementById('weeklyOffEntry'))return;" +
                        "var a=document.createElement('a');a.id='weeklyOffEntry';" +
                        "a.href='/weekly-off/index.html';a.className='weekly-off-entry';" +
                        "a.setAttribute('aria-label','Weekly Off');" +
                        "a.innerHTML='<svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg><span>Weekly Off</span>';" +
                        "var css=document.createElement('style');css.id='weeklyOffEntryStyle';" +
                        "css.textContent='body:not(.auth-out) #views .weekly-off-entry{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 12px;border:2px solid transparent;border-radius:12px;background:transparent;color:inherit;text-decoration:none;box-sizing:border-box;font:inherit;cursor:pointer;}'+" +
                        "'@media(max-width:767px){body:not(.auth-out) #views .weekly-off-entry{flex:1 1 0;min-width:0;min-height:0;height:64px;flex-direction:column;gap:2px;padding:3px 1px;font-size:10px;line-height:1.1;white-space:nowrap;overflow:hidden;}body:not(.auth-out) #views .weekly-off-entry .ic{width:30px;height:30px;flex:0 0 30px;padding:5px;box-sizing:border-box;}body:not(.auth-out) #views .weekly-off-entry span{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;}}'+" +
                        "'@media(min-width:768px){body:not(.auth-out) #views .weekly-off-entry{min-height:46px;justify-content:flex-start;gap:12px;padding:10px 14px;}body:not(.auth-out) #views .weekly-off-entry .ic{width:22px;height:22px;}}';" +
                        "document.head.appendChild(css);nav.appendChild(a);" +
                        "}catch(e){}})();";
                    view.evaluateJavascript(script, null);
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
