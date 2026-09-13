package com.soundsphere.aio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MediaPlaybackService extends Service implements AudioManager.OnAudioFocusChangeListener {

    public static final String ACTION_PLAY = "com.soundsphere.aio.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.soundsphere.aio.ACTION_PAUSE";
    public static final String ACTION_NEXT = "com.soundsphere.aio.ACTION_NEXT";
    public static final String ACTION_PREV = "com.soundsphere.aio.ACTION_PREV";
    public static final String ACTION_STOP = "com.soundsphere.aio.ACTION_STOP";

    private static final String CHANNEL_ID = "soundsphere_playback_channel";
    private static final int NOTIFICATION_ID = 1001;

    private final IBinder binder = new LocalBinder();
    private MediaSessionCompat mediaSession;
    private NotificationManager notificationManager;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private boolean isPlaying = false;
    private boolean resumeOnFocusGain = false;
    private String currentTitle = "SoundSphere";
    private String currentArtist = "Musik";
    private String currentAlbum = "";
    private String currentCoverUrl = "";
    private Bitmap currentCoverBitmap = null;
    private long currentDurationMs = 0;
    private long currentPositionMs = 0;

    public interface MediaActionListener {
        void onMediaAction(String action, long extraLong);
    }

    private static MediaActionListener mediaActionListener;

    public static void setMediaActionListener(MediaActionListener listener) {
        mediaActionListener = listener;
    }

    public class LocalBinder extends Binder {
        public MediaPlaybackService getService() {
            return MediaPlaybackService.this;
        }
    }

    private final BroadcastReceiver becomingNoisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                if (mediaActionListener != null) {
                    mediaActionListener.onMediaAction("pause", 0);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        createNotificationChannel();
        initMediaSession();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(becomingNoisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(becomingNoisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
            }
        } catch (Exception ignored) {
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "SoundSphere Wiedergabe",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mediensteuerung und Sperrbildschirm-Anzeige für SoundSphere");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, "SoundSphereMediaSession");
        mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                requestAudioFocus();
                if (mediaActionListener != null) mediaActionListener.onMediaAction("play", 0);
            }

            @Override
            public void onPause() {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("pause", 0);
            }

            @Override
            public void onSkipToNext() {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("next", 0);
            }

            @Override
            public void onSkipToPrevious() {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("prev", 0);
            }

            @Override
            public void onSeekTo(long pos) {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("seek", pos);
            }

            @Override
            public void onStop() {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("stop", 0);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE);
                } else {
                    stopForeground(true);
                }
                stopSelf();
            }
        });

        mediaSession.setActive(true);
    }

    public void updatePlaybackState(String title, String artist, String album, String coverUrl,
                                    boolean playing, long positionMs, long durationMs) {
        this.currentTitle = (title != null && !title.isEmpty()) ? title : "SoundSphere";
        this.currentArtist = (artist != null && !artist.isEmpty()) ? artist : "";
        this.currentAlbum = Objects.requireNonNullElse(album, "");
        this.isPlaying = playing;
        this.currentPositionMs = Math.max(0, positionMs);
        this.currentDurationMs = Math.max(0, durationMs);

        long actions = PlaybackStateCompat.ACTION_PLAY |
                PlaybackStateCompat.ACTION_PAUSE |
                PlaybackStateCompat.ACTION_PLAY_PAUSE |
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                PlaybackStateCompat.ACTION_SEEK_TO |
                PlaybackStateCompat.ACTION_STOP;

        int state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        float speed = playing ? 1.0f : 0.0f;

        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, currentPositionMs, speed);

        mediaSession.setPlaybackState(stateBuilder.build());

        // Update artwork asynchronously if URL changed
        if (coverUrl != null && !coverUrl.equals(this.currentCoverUrl)) {
            this.currentCoverUrl = coverUrl;
            loadArtworkAsync(coverUrl);
        } else {
            pushMetadata();
            showNotification();
        }
    }

    private void pushMetadata() {
        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDurationMs);

        if (currentCoverBitmap != null) {
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentCoverBitmap);
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, currentCoverBitmap);
        }

        mediaSession.setMetadata(metaBuilder.build());
    }

    private void loadArtworkAsync(final String coverUrl) {
        executor.execute(() -> {
            Bitmap bmp = null;
            try {
                if (coverUrl.startsWith("http://") || coverUrl.startsWith("https://")) {
                    URL url = new URL(coverUrl);
                    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                    connection.setDoInput(true);
                    connection.setConnectTimeout(4000);
                    connection.setReadTimeout(4000);
                    connection.connect();
                    try (InputStream input = connection.getInputStream()) {
                        bmp = BitmapFactory.decodeStream(input);
                    }
                } else if (coverUrl.startsWith("content://") || coverUrl.startsWith("file://")) {
                    try (InputStream input = getContentResolver().openInputStream(Uri.parse(coverUrl))) {
                        bmp = BitmapFactory.decodeStream(input);
                    }
                }
            } catch (Exception ignored) {
            }

            final Bitmap resultBmp = bmp;
            if (Objects.equals(coverUrl, this.currentCoverUrl)) {
                currentCoverBitmap = resultBmp;
                pushMetadata();
                showNotification();
            }
        });
    }

    private void showNotification() {
        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingContentIntent = PendingIntent.getActivity(
                this, 0, contentIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        PendingIntent prevPending = PendingIntent.getService(
                this, 1, new Intent(this, MediaPlaybackService.class).setAction(ACTION_PREV),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent playPausePending = PendingIntent.getService(
                this, 2, new Intent(this, MediaPlaybackService.class).setAction(isPlaying ? ACTION_PAUSE : ACTION_PLAY),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent nextPending = PendingIntent.getService(
                this, 3, new Intent(this, MediaPlaybackService.class).setAction(ACTION_NEXT),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int playPauseIcon = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playPauseTitle = isPlaying ? "Pause" : "Play";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSubText(currentAlbum)
                .setContentIntent(pendingContentIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setOngoing(isPlaying)
                .addAction(android.R.drawable.ic_media_previous, "Vorheriger", prevPending)
                .addAction(playPauseIcon, playPauseTitle, playPausePending)
                .addAction(android.R.drawable.ic_media_next, "Nächster", nextPending)
                .setStyle(new MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));

        if (currentCoverBitmap != null) {
            builder.setLargeIcon(currentCoverBitmap);
        }

        Notification notification = builder.build();
        if (isPlaying) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
            } catch (Exception e) {
                if (notificationManager != null) {
                    notificationManager.notify(NOTIFICATION_ID, notification);
                }
            }
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_DETACH);
            } else {
                stopForeground(false);
            }
            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_PLAY.equals(action)) {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("play", 0);
            } else if (ACTION_PAUSE.equals(action)) {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("pause", 0);
            } else if (ACTION_NEXT.equals(action)) {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("next", 0);
            } else if (ACTION_PREV.equals(action)) {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("prev", 0);
            } else if (ACTION_STOP.equals(action)) {
                if (mediaActionListener != null) mediaActionListener.onMediaAction("stop", 0);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE);
                } else {
                    stopForeground(true);
                }
                stopSelf();
            }
        }
        return START_NOT_STICKY;
    }

    private void requestAudioFocus() {
        if (audioManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(this)
                    .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    @Override
    public void onAudioFocusChange(int focusChange) {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
                if (mediaActionListener != null && isPlaying) {
                    resumeOnFocusGain = false;
                    mediaActionListener.onMediaAction("pause", 0);
                }
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                if (mediaActionListener != null && isPlaying) {
                    resumeOnFocusGain = true;
                    mediaActionListener.onMediaAction("pause", 0);
                }
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                if (resumeOnFocusGain && mediaActionListener != null) {
                    resumeOnFocusGain = false;
                    mediaActionListener.onMediaAction("play", 0);
                }
                break;
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            unregisterReceiver(becomingNoisyReceiver);
        } catch (Exception ignored) {
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
            } else {
                audioManager.abandonAudioFocus(this);
            }
        }
        executor.shutdown();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }
}
