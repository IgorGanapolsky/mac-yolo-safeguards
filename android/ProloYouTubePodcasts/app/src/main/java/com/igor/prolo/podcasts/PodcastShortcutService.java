package com.igor.prolo.podcasts;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;

public final class PodcastShortcutService extends AccessibilityService {
    private static final String TAG = "ProloPodcasts";
    private static final String YOUTUBE_MUSIC = "com.google.android.apps.youtube.music";
    private static final long TIMEOUT_MS = 25_000;
    private static final long RETRY_MS = 450;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Step step = Step.IDLE;
    private long deadline;
    private int runId;

    private enum Step {
        IDLE,
        OPEN_LIBRARY,
        OPEN_PODCASTS,
        OPEN_NEW_EPISODES,
        PLAY_TOP
    }

    @Override
    protected void onServiceConnected() {
        AccessibilityServiceInfo info = getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS
                | AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        setServiceInfo(info);
        Log.i(TAG, "Service connected; waiting for F13");
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        if (event.getKeyCode() != KeyEvent.KEYCODE_F13) return false;
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            beginNavigation();
        }
        return true;
    }

    private void beginNavigation() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(YOUTUBE_MUSIC);
        if (launch == null) {
            Toast.makeText(this, R.string.youtube_music_not_installed, Toast.LENGTH_LONG).show();
            return;
        }

        runId++;
        deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        step = Step.OPEN_LIBRARY;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        startActivity(launch);
        Toast.makeText(this, R.string.opening_newest_podcast, Toast.LENGTH_SHORT).show();
        scheduleDrive(runId, 700);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (step == Step.IDLE) return;
        CharSequence packageName = event.getPackageName();
        if (packageName != null && YOUTUBE_MUSIC.contentEquals(packageName)) {
            scheduleDrive(runId, 50);
        }
    }

    @Override
    public void onInterrupt() {
        step = Step.IDLE;
        runId++;
    }

    private void scheduleDrive(int expectedRun, long delayMs) {
        handler.postDelayed(() -> {
            if (expectedRun == runId) drive(expectedRun);
        }, delayMs);
    }

    private void drive(int expectedRun) {
        if (step == Step.IDLE || expectedRun != runId) return;
        if (SystemClock.uptimeMillis() >= deadline) {
            fail(getString(R.string.navigation_failed));
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !YOUTUBE_MUSIC.equals(String.valueOf(root.getPackageName()))) {
            scheduleDrive(expectedRun, RETRY_MS);
            return;
        }

        boolean clicked = false;
        switch (step) {
            case OPEN_LIBRARY:
                clicked = clickFirst(root, NavigationLabels.LIBRARY);
                if (clicked) step = Step.OPEN_PODCASTS;
                break;
            case OPEN_PODCASTS:
                clicked = clickFirst(root, NavigationLabels.PODCASTS);
                if (clicked) step = Step.OPEN_NEW_EPISODES;
                break;
            case OPEN_NEW_EPISODES:
                clicked = clickFirst(root, NavigationLabels.NEW_EPISODES);
                if (clicked) step = Step.PLAY_TOP;
                break;
            case PLAY_TOP:
                clicked = clickFirst(root, NavigationLabels.PLAY);
                if (clicked) {
                    step = Step.IDLE;
                    Toast.makeText(this, R.string.playing_new_episodes, Toast.LENGTH_SHORT).show();
                    Log.i(TAG, "New Episodes play action clicked");
                    return;
                }
                break;
            default:
                return;
        }

        scheduleDrive(expectedRun, clicked ? 700 : RETRY_MS);
    }

    private boolean clickFirst(AccessibilityNodeInfo root, String[] labels) {
        AccessibilityNodeInfo match = findFirst(root, labels);
        if (match == null) return false;

        AccessibilityNodeInfo clickable = match;
        while (clickable != null && !clickable.isClickable()) {
            clickable = clickable.getParent();
        }
        if (clickable == null) return false;

        boolean result = clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        if (result) Log.i(TAG, "Clicked " + describe(match));
        return result;
    }

    private AccessibilityNodeInfo findFirst(AccessibilityNodeInfo node, String[] labels) {
        if (NavigationLabels.matchesAny(node.getText(), labels)
                || NavigationLabels.matchesAny(node.getContentDescription(), labels)) {
            return node;
        }
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child == null) continue;
            AccessibilityNodeInfo match = findFirst(child, labels);
            if (match != null) return match;
        }
        return null;
    }

    private String describe(AccessibilityNodeInfo node) {
        if (node.getText() != null) return node.getText().toString();
        if (node.getContentDescription() != null) return node.getContentDescription().toString();
        return node.getClassName() == null ? "node" : node.getClassName().toString();
    }

    private void fail(String message) {
        step = Step.IDLE;
        runId++;
        Log.w(TAG, message);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
