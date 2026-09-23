# Wallcraft — Android app

Native Android version of Wallcraft with the same design and features, plus
**one-tap wallpaper setting** for the Home screen, Lock screen, or Both.

## Get the APK (no coding tools needed)

1. Create a free GitHub account and a new repository.
2. Upload **all files of this project** (including the hidden `.github` folder) to it.
3. Open the **Actions** tab → *Build Wallcraft APK* → **Run workflow**.
4. After ~3–5 minutes, open the finished run and download **Wallcraft-APK**.
5. Unzip it, copy `Wallcraft.apk` to your phone and open it
   (allow "Install unknown apps" when Android asks).

## Build with Android Studio (alternative)

1. Copy `index.html`, `app.js` and `icon.svg` into `android/app/src/main/assets/www/`.
2. Open the `android` folder in Android Studio.
3. *Build → Build Bundle(s) / APK(s) → Build APK(s)*.

## Notes

- Package name: `com.wallcraft.app` · Min Android 8.0 · Target Android 14
- Icon: violet adaptive icon (phone + landscape + AI sparkle), supports
  Android 13 themed icons.
- The APK is signed with a debug key so it installs directly. Use your own
  keystore before publishing to Google Play.
- Requires internet (AI generation and your saved wallpapers live in your
  Puter account).
