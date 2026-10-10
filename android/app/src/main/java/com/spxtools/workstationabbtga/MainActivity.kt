package com.spxtools.workstationabbtga

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import android.widget.LinearLayout
import android.widget.Button
import android.graphics.Color
import android.view.Gravity
import android.view.WindowManager
import android.content.Intent

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val homeUrl = "https://workstation-abbtg-a.vercel.app/"
    private var errorView: View? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(248, 248, 245)
        window.navigationBarColor = Color.rgb(248, 248, 245)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
            View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR

        webView = WebView(this)
        webView.setBackgroundColor(Color.rgb(248, 248, 245))
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.setSupportMultipleWindows(false)
        webView.settings.loadsImagesAutomatically = true
        webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && (uri.host == "workstation-abbtg-a.vercel.app" ||
                        uri.host?.endsWith(".vercel.app") == true)) {
                    return false
                }
                if (uri.scheme == "http" || uri.scheme == "https") {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                errorView?.let { (it.parent as? android.view.ViewGroup)?.removeView(it) }
                errorView = null
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) showConnectionError()
            }
        }
        setContentView(webView)
        if (savedInstanceState == null) {
            webView.loadUrl(homeUrl)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun showConnectionError() {
        if (!isOnline() || webView.url.isNullOrBlank()) {
            val panel = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(40, 40, 40, 40)
                setBackgroundColor(Color.rgb(248, 248, 245))
            }
            panel.addView(TextView(this).apply {
                text = "เชื่อมต่อ Workstation ไม่สำเร็จ"
                textSize = 20f
                setTextColor(Color.rgb(23, 37, 59))
                gravity = Gravity.CENTER
            })
            panel.addView(TextView(this).apply {
                text = "ตรวจสอบอินเทอร์เน็ต แล้วลองอีกครั้ง"
                textSize = 15f
                setTextColor(Color.rgb(70, 80, 90))
                gravity = Gravity.CENTER
                setPadding(0, 16, 0, 24)
            })
            panel.addView(Button(this).apply {
                text = "ลองอีกครั้ง"
                setOnClickListener { errorView?.let { (it.parent as? android.view.ViewGroup)?.removeView(it) }; errorView = null; webView.loadUrl(homeUrl) }
            })
            addContentView(panel, WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT
            ))
            errorView = panel
        }
    }

    private fun isOnline(): Boolean {
        val manager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
