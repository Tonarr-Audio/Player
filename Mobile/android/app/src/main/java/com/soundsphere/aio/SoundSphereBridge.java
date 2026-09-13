package com.soundsphere.aio;

import android.app.Activity;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

public class SoundSphereBridge {

    private final MainActivity activity;
    private final Vibrator vibrator;

    public SoundSphereBridge(MainActivity activity) {
        this.activity = activity;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vibratorManager = (VibratorManager) activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            this.vibrator = vibratorManager != null ? vibratorManager.getDefaultVibrator() : (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        } else {
            this.vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    @JavascriptInterface
    public boolean isAndroid() {
        return true;
    }

    @JavascriptInterface
    public void updatePlaybackState(String title, String artist, String album, String coverUrl,
                                    boolean isPlaying, double positionSec, double durationSec) {
        activity.runOnUiThread(() -> {
            long posMs = (long) (positionSec * 1000);
            long durMs = (long) (durationSec * 1000);
            activity.updateMediaNotification(title, artist, album, coverUrl, isPlaying, posMs, durMs);
        });
    }

    @JavascriptInterface
    public void vibrateClick() {
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(15, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(15);
            }
        }
    }

    @JavascriptInterface
    public void vibrateLight() {
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(8, 60));
            } else {
                vibrator.vibrate(8);
            }
        }
    }

    @JavascriptInterface
    public void vibrateSuccess() {
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 20, 50, 25}, -1));
            } else {
                vibrator.vibrate(50);
            }
        }
    }

    @JavascriptInterface
    public void showToast(String message) {
        if (message != null && !message.isEmpty()) {
            activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
        }
    }

    @JavascriptInterface
    public void openServerConfig() {
        activity.runOnUiThread(activity::promptServerUrl);
    }

    @JavascriptInterface
    public void setSwipeRefreshEnabled(boolean enabled) {
        activity.setSwipeRefreshEnabled(enabled);
    }

    @JavascriptInterface
    public void openInBrowser(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            activity.runOnUiThread(() -> Toast.makeText(activity, "Browser konnte nicht geöffnet werden.", Toast.LENGTH_SHORT).show());
        }
    }

    @JavascriptInterface
    public void pickFolder() {
        activity.runOnUiThread(activity::openFolderPicker);
    }

    @JavascriptInterface
    public String getLocalDeviceTracksJsonFiltered(String folderUrisJson) {
        JSONArray jsonArray = new JSONArray();
        try {
            List<String> folderUris = new ArrayList<>();
            if (folderUrisJson != null && !folderUrisJson.isEmpty()) {
                JSONArray foldersArr = new JSONArray(folderUrisJson);
                for (int i = 0; i < foldersArr.length(); i++) {
                    folderUris.add(foldersArr.getString(i));
                }
            }

            if (folderUris.isEmpty()) return "[]";

            Uri collection;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
            } else {
                collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            }

            String[] projection = new String[]{
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.DATA,
                    MediaStore.Audio.Media.ALBUM_ID
            };

            // We filter manually by path or use a complex query. 
            // For simplicity and accuracy with SAF URIs, we might need to match DATA paths if available
            // or use specific MediaStore queries if the URIs are from specific volumes.
            
            try (Cursor cursor = activity.getContentResolver().query(
                    collection,
                    projection,
                    MediaStore.Audio.Media.IS_MUSIC + " != 0",
                    null,
                    MediaStore.Audio.Media.TITLE + " ASC"
            )) {
                if (cursor != null) {
                    int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                    int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                    int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                    int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                    int durCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                    int dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                    int albumIdCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);

                    while (cursor.moveToNext()) {
                        String filePath = cursor.getString(dataCol);
                        
                        // Filter by folders
                        boolean inFolder = false;
                        if (filePath != null) {
                            for (String folderUriStr : folderUris) {
                                // This is a rough check. Real SAF to Path mapping is complex.
                                // If the user picked a folder via SAF, we try to see if the file path contains typical mount points.
                                // For now, we assume filePath is available.
                                if (filePath.contains(folderUriStr) || isPathInSafUri(filePath, folderUriStr)) {
                                    inFolder = true;
                                    break;
                                }
                            }
                        }
                        
                        if (!inFolder) continue;

                        long id = cursor.getLong(idCol);
                        String rawTitle = cursor.getString(titleCol);
                        String artist = cursor.getString(artistCol);
                        String album = cursor.getString(albumCol);
                        long durationMs = cursor.getLong(durCol);
                        long albumId = cursor.getLong(albumIdCol);

                        String title = rawTitle;
                        if (title == null || title.isEmpty()) {
                            if (filePath != null) {
                                title = new File(filePath).getName();
                            } else {
                                title = "Unbekannter Titel";
                            }
                        }

                        Uri contentUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
                        Uri artworkUri = ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId);

                        long totalSec = durationMs / 1000;
                        String durationStr = String.format(Locale.ROOT, "%02d:%02d", totalSec / 60, totalSec % 60);

                        JSONObject trackObj = new JSONObject();
                        trackObj.put("id", "local_" + id);
                        trackObj.put("file_path", contentUri.toString());
                        trackObj.put("native_path", Objects.requireNonNullElse(filePath, ""));
                        trackObj.put("title", title);
                        trackObj.put("artist", (artist != null && !Objects.equals(artist, "<unknown>")) ? artist : "Unbekannter Interpret");
                        trackObj.put("album", (album != null && !Objects.equals(album, "<unknown>")) ? album : "Unbekanntes Album");
                        trackObj.put("duration", (double) totalSec);
                        trackObj.put("duration_str", durationStr);
                        trackObj.put("cover_url", (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ? contentUri.toString() : artworkUri.toString());
                        trackObj.put("source", "android_local");
                        trackObj.put("status", "synced");

                        jsonArray.put(trackObj);
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return jsonArray.toString();
    }

    private boolean isPathInSafUri(String path, String folderUriStr) {
        // Simple heuristic: check if path contains part of the URI's document ID
        try {
            Uri uri = Uri.parse(folderUriStr);
            String docId = DocumentsContract.getTreeDocumentId(uri);
            if (docId != null) {
                String[] parts = docId.split(":");
                if (parts.length > 1) {
                    return path.contains(parts[1]);
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    @JavascriptInterface
    public String getLocalDeviceTracksJson() {
        // Legacy support if needed, but we prefer the filtered one
        return "[]";
    }
}
