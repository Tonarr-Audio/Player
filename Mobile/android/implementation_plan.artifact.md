# Implementation Plan - Bug Fixes and Code Quality Improvements

This plan addresses several identified bugs, potential crashes, and code quality issues in the SoundSphere-AIO project.

## User Review Required

> [!IMPORTANT]
> The changes include updating how album art is fetched on newer Android versions. This should improve performance and reliability but relies on standard MediaStore behavior.

## Proposed Changes

### MediaPlaybackService

#### [MODIFY] [MediaPlaybackService.java](file:///C:/Users/NoahYTK/Documents/LRC/android/app/src/main/java/com/soundsphere/aio/MediaPlaybackService.java)
- **Fix Artwork Loading**: Replace the single-thread executor with a mechanism that cancels previous artwork loads when a new one is requested. This prevents the wrong artwork from appearing if the user skips tracks quickly.
- **Improve Audio Focus**: Handle `AUDIOFOCUS_GAIN` to automatically resume playback if it was paused due to `AUDIOFOCUS_LOSS_TRANSIENT`.
- **Handle Deprecations**:
    - Use `NotificationCompat.Builder`'s modern foreground service handling.
    - Update audio focus request to use `AudioFocusRequest` on API 26+.
    - Update `stopForeground` usage for API 33+.

### MainActivity

#### [MODIFY] [MainActivity.java](file:///C:/Users/NoahYTK/Documents/LRC/android/app/src/main/java/com/soundsphere/aio/MainActivity.java)
- **Safety Checks**: Add null checks for `webView` before calling `evaluateJavascript`.
- **Code Cleanup**: Address lint warnings (Locale in `String.format`, method references, etc.).
- **System Bar Consistency**: Ensure system bars match the dark theme consistently.

### SoundSphereBridge

#### [MODIFY] [SoundSphereBridge.java](file:///C:/Users/NoahYTK/Documents/LRC/android/app/src/main/java/com/soundsphere/aio/SoundSphereBridge.java)
- **Improved Album Art**: Use `ContentResolver.loadThumbnail` on Android Q+ for more efficient and reliable album art retrieval.
- **Vibration Refinement**: Use `VibrationEffect` properly for different types of feedback.
- **Code Cleanup**: Fix deprecations and lint warnings.

## Verification Plan

### Automated Tests
- Run `gradle :app:assembleDebug` to ensure no regression in build.

### Manual Verification
- Deploy to a device/emulator.
- Test background playback and notification controls.
- Test fast track skipping to verify artwork updates correctly.
- Test audio focus by playing media in another app (e.g., YouTube) and returning.
- Verify "Local Device Tracks" still loads correctly.
