package com.wallcraft.app;

import android.Manifest;
import android.app.Dialog;
import android.app.WallpaperManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {

    private static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final int BG = Color.parseColor("#0B0B10");

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private Dialog popupDialog;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(BG);
        w.setNavigationBarColor(BG);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(BG);
        configure(webView);
        webView.setWebViewClient(new MainClient());
        webView.setWebChromeClient(new MainChrome());
        webView.addJavascriptInterface(new Bridge(), "WallcraftNative");
        setContentView(webView);

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (popupDialog != null && popupDialog.isShowing()) {
                    popupDialog.dismiss();
                    return;
                }
                webView.evaluateJavascript("(window.wallcraftBack && window.wallcraftBack()) ? '1' : '0'", value -> {
                    if (value != null && value.contains("1")) return;
                    if (webView.canGoBack()) webView.goBack();
                    else finish();
                });
            }
        });
    }

    private void configure(WebView v) {
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " WallcraftApp/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(v, true);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (popupDialog != null) popupDialog.dismiss();
        io.shutdown();
        super.onDestroy();
    }

    /* ---------------- WebView clients ---------------- */

    private class MainClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
            return true;
        }
    }

    private class MainChrome extends WebChromeClient {
        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            // Used for the Puter sign-in window.
            WebView popup = new WebView(MainActivity.this);
            popup.setBackgroundColor(Color.WHITE);
            configure(popup);
            popup.setWebViewClient(new WebViewClient());
            popup.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView window) {
                    if (popupDialog != null) popupDialog.dismiss();
                }
            });

            popupDialog = new Dialog(MainActivity.this, android.R.style.Theme_Material_Light_NoActionBar);
            popupDialog.setContentView(popup, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            popupDialog.setOnDismissListener(d -> {
                popup.stopLoading();
                popup.destroy();
            });
            popupDialog.show();

            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }
    }

    /* ---------------- JS bridge ---------------- */

    private void callback(String id, boolean ok, String msg) {
        String js = "window.__nativeCb && window.__nativeCb(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(msg == null ? "" : msg) + ")";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private static byte[] decode(String data) {
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
        return Base64.decode(data, Base64.DEFAULT);
    }

    private class Bridge {

        @JavascriptInterface
        public String deviceInfo() {
            int wpx, hpx;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Rect b = getWindowManager().getCurrentWindowMetrics().getBounds();
                wpx = b.width(); hpx = b.height();
            } else {
                DisplayMetrics m = new DisplayMetrics();
                getWindowManager().getDefaultDisplay().getRealMetrics(m);
                wpx = m.widthPixels; hpx = m.heightPixels;
            }
            int shortSide = Math.min(wpx, hpx), longSide = Math.max(wpx, hpx);
            return "{\"w\":" + shortSide + ",\"h\":" + longSide + ",\"model\":" + JSONObject.quote(Build.MANUFACTURER + " " + Build.MODEL) + "}";
        }

        @JavascriptInterface
        public void setWallpaper(String id, String base64, String target) {
            io.execute(() -> {
                try {
                    byte[] bytes = decode(base64);
                    WallpaperManager wm = WallpaperManager.getInstance(MainActivity.this);
                    int flags;
                    if ("home".equals(target)) flags = WallpaperManager.FLAG_SYSTEM;
                    else if ("lock".equals(target)) flags = WallpaperManager.FLAG_LOCK;
                    else flags = WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK;

                    if ("both".equals(target)) {
                        // Some launchers need each screen set separately to be reliable.
                        wm.setStream(new ByteArrayInputStream(bytes), null, true, WallpaperManager.FLAG_SYSTEM);
                        wm.setStream(new ByteArrayInputStream(bytes), null, true, WallpaperManager.FLAG_LOCK);
                    } else {
                        wm.setStream(new ByteArrayInputStream(bytes), null, true, flags);
                    }
                    callback(id, true, "ok");
                } catch (Exception e) {
                    callback(id, false, e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void saveImage(String id, String base64, String name) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                    ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 7));
                callback(id, false, "permission");
                return;
            }
            io.execute(() -> {
                try {
                    byte[] bytes = decode(base64);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentResolver r = getContentResolver();
                        ContentValues v = new ContentValues();
                        v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                        v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                        v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Wallcraft");
                        v.put(MediaStore.Images.Media.IS_PENDING, 1);
                        Uri uri = r.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                        if (uri == null) throw new Exception("Could not create file");
                        try (OutputStream os = r.openOutputStream(uri)) { os.write(bytes); }
                        v.clear();
                        v.put(MediaStore.Images.Media.IS_PENDING, 0);
                        r.update(uri, v, null, null);
                    } else {
                        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Wallcraft");
                        if (!dir.exists()) dir.mkdirs();
                        File f = new File(dir, name);
                        try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                        sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(f)));
                    }
                    callback(id, true, "ok");
                } catch (Exception e) {
                    callback(id, false, e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void shareImage(String id, String base64, String name, String text) {
            io.execute(() -> {
                try {
                    byte[] bytes = decode(base64);
                    File dir = new File(getCacheDir(), "shared");
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, name);
                    try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", f);
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("image/jpeg");
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    runOnUiThread(() -> startActivity(Intent.createChooser(send, "Share wallpaper")));
                    callback(id, true, "ok");
                } catch (Exception e) {
                    callback(id, false, e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
    }
}
