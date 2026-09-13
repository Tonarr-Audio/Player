package com.soundsphere.aio;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MenuItem;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Size;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final String PREFS_NAME = "SoundSpherePrefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_URL = "file:///android_asset/www/index.html";
    private static final int PERMISSION_REQUEST_CODE = 101;

    private MediaPlaybackService playbackService;
    private boolean isServiceBound = false;
    private static final int FOLDER_PICKER_CODE = 202;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            MediaPlaybackService.LocalBinder binder = (MediaPlaybackService.LocalBinder) service;
            playbackService = binder.getService();
            isServiceBound = true;
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            playbackService = null;
            isServiceBound = false;
        }
    };

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0b0d14"));
        setContentView(webView);

        requestAppPermissions();
        bindPlaybackService();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Register Native JavaScript Bridge
        webView.addJavascriptInterface(new SoundSphereBridge(this), "AndroidBridge");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                return super.onConsoleMessage(consoleMessage);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    Uri uri = request.getUrl();
                    String scheme = uri.getScheme();
                    if ("content".equalsIgnoreCase(scheme)) {
                        try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                Bitmap thumb = getContentResolver().loadThumbnail(uri, new Size(300, 300), null);
                                if (thumb != null) {
                                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                    thumb.compress(Bitmap.CompressFormat.JPEG, 90, baos);
                                    return new WebResourceResponse("image/jpeg", "UTF-8", new ByteArrayInputStream(baos.toByteArray()));
                                }
                            }
                        } catch (Exception ignored) {}

                        try {
                            InputStream stream = getContentResolver().openInputStream(uri);
                            if (stream != null) {
                                return new WebResourceResponse("image/jpeg", "UTF-8", stream);
                            }
                        } catch (Exception ignored) {}
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("soundsphere://callback")) {
                    handleOAuthCallback(url);
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    String failedUrl = request.getUrl().toString();
                    if (!failedUrl.startsWith("file:///android_asset/")) {
                        Toast.makeText(MainActivity.this, "⚠️ Server nicht erreichbar. Lade Offline-Modus...", Toast.LENGTH_LONG).show();
                        webView.loadUrl(DEFAULT_URL);
                    }
                }
            }
        });

        String initialUrl = getSavedUrl();
        webView.loadUrl(initialUrl);

        // Modern Android Gesture Navigation Back Handler
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBackAction();
            }
        });

        // Check for deep link on startup
        handleDeepLink(getIntent());
    }

    private void handleDeepLink(Intent intent) {
        if (intent != null && intent.getData() != null) {
            String url = intent.getData().toString();
            if (url.startsWith("soundsphere://callback")) {
                handleOAuthCallback(url);
            }
        }
    }

    private void setupSystemBars() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#0b0d14"));
        window.setNavigationBarColor(Color.parseColor("#0b0d14"));
    }

    private void bindPlaybackService() {
        Intent intent = new Intent(this, MediaPlaybackService.class);
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);

        MediaPlaybackService.setMediaActionListener((action, extraLong) -> runOnUiThread(() -> {
            if (webView != null) {
                String js = String.format(Locale.ROOT, "if (window.handleNativeMediaAction) { window.handleNativeMediaAction('%s', %d); }", action, extraLong);
                webView.evaluateJavascript(js, null);
            }
        }));
    }

    public void openFolderPicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, FOLDER_PICKER_CODE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FOLDER_PICKER_CODE && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) {
                getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                String js = String.format("if (window.onFolderPicked) { window.onFolderPicked('%s'); }", uri.toString());
                webView.evaluateJavascript(js, null);
            }
        }
    }

    public void updateMediaNotification(String title, String artist, String album, String coverUrl,
                                       boolean isPlaying, long positionMs, long durationMs) {
        if (playbackService != null) {
            playbackService.updatePlaybackState(title, artist, album, coverUrl, isPlaying, positionMs, durationMs);
        }
    }

    public void setSwipeRefreshEnabled(boolean enabled) {
        // Disabled: no pull-to-refresh on scroll
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean hasAudio = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
            boolean hasNotif = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            if (!hasAudio || !hasNotif) {
                ActivityCompat.requestPermissions(this, new String[]{
                        Manifest.permission.READ_MEDIA_AUDIO,
                        Manifest.permission.POST_NOTIFICATIONS
                }, PERMISSION_REQUEST_CODE);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, PERMISSION_REQUEST_CODE);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (webView != null) {
                webView.evaluateJavascript("if (typeof loadInitialTracks === 'function') { loadInitialTracks(); }", null);
            }
        }
    }

    private String getSavedUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        return prefs.getString(KEY_SERVER_URL, DEFAULT_URL);
    }

    public void promptServerUrl() {
        EditText input = new EditText(this);
        input.setHint("z.B. http://192.168.1.100:8001");
        String current = getSavedUrl();
        if (!current.startsWith("file://")) {
            input.setText(current);
        }
        new AlertDialog.Builder(this)
                .setTitle("🌐 SoundSphere Server Verbindung")
                .setMessage("Gib die IP / URL deines SoundSphere Desktop-Servers im selben WLAN ein (oder leer lassen für lokale Offline-Ansicht):")
                .setView(input)
                .setPositiveButton("Verbinden", (dialog, which) -> {
                    String val = input.getText().toString().trim();
                    String targetUrl;
                    if (val.isEmpty()) {
                        targetUrl = DEFAULT_URL;
                    } else {
                        if (!val.startsWith("http://") && !val.startsWith("https://")) {
                            targetUrl = "http://" + val;
                        } else {
                            targetUrl = val;
                        }
                    }
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_SERVER_URL, targetUrl).apply();
                    webView.loadUrl(targetUrl);
                })
                .setNeutralButton("Lokale Offline-App", (dialog, which) -> {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_SERVER_URL, DEFAULT_URL).apply();
                    webView.loadUrl(DEFAULT_URL);
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, 1, 0, "🌐 Server-IP ändern");
        menu.add(0, 2, 0, "📱 Offline-Modus laden");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(@NonNull MenuItem item) {
        if (item.getItemId() == 1) {
            promptServerUrl();
            return true;
        } else if (item.getItemId() == 2) {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_SERVER_URL, DEFAULT_URL).apply();
            webView.loadUrl(DEFAULT_URL);
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    private long lastBackPressTime = 0;

    private void handleBackAction() {
        webView.evaluateJavascript("window.handleAndroidBack ? (window.handleAndroidBack() === true ? 'BACK_HANDLED' : 'BACK_UNHANDLED') : 'NO_HANDLER'", value -> {
            boolean handled = value != null && value.contains("BACK_HANDLED");
            if (!handled) {
                long currentTime = System.currentTimeMillis();
                if (currentTime - lastBackPressTime < 2000) {
                    // Terminate audio playback and close the app completely
                    webView.evaluateJavascript("if (window.stopAudioCompletely) { window.stopAudioCompletely(); }", null);
                    if (playbackService != null) {
                        playbackService.stopForeground(true);
                        playbackService.stopSelf();
                    }
                    finishAffinity();
                    System.exit(0);
                } else {
                    lastBackPressTime = currentTime;
                    Toast.makeText(MainActivity.this, "Nochmal drücken zum Beenden", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (isServiceBound) {
            unbindService(serviceConnection);
            isServiceBound = false;
        }
    }

    private void handleOAuthCallback(String url) {
        // Extract fragments or query params and pass to JS
        // e.g., soundsphere://callback#access_token=...
        String js = String.format("if (window.handleNativeOAuthCallback) { window.handleNativeOAuthCallback('%s'); }", url);
        webView.evaluateJavascript(js, null);
    }
}
