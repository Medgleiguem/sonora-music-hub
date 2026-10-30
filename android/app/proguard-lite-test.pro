# Only for the instrumentation test APK that runs against Sonora Lite; never applied to the shipped app.
# Compile-time annotation libraries reference the javac API, which does not exist on Android.
-dontwarn javax.lang.model.**
-dontobfuscate
