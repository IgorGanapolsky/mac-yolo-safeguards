# Prolo YouTube Podcasts

Android-only receiver for the Prolo Ring profile action `Touch > Triple Tap > F13`.

The service opens `com.google.android.apps.youtube.music` and uses semantic accessibility labels to select:

`Library > Podcasts > New Episodes > Play`

It does not use ADB after installation and does not contain a macOS, Apple Music, or Spotify fallback.

The exact Prolo `Tap + Hold` gesture cannot be assigned in Prolo Studio 1.0.7 build 20260811; it is firmware-reserved for Temporary Cursor / Joystick Assist. Triple Tap is the nearest free programmable gesture.
