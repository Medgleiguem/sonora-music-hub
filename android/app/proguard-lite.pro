# Sonora Lite shrinks third-party code only. Sonora's own classes are small and stay whole and unrenamed,
# so Capacitor's reflective plugin calls, the playback service, logs and instrumentation tests see the
# same classes as in the standard build.
-keep class app.sonora.music.** { *; }
-dontobfuscate

# Capacitor finds plugins, methods, callbacks and permissions through annotations and reflection at runtime
# (shrinking its permission annotations crashed downloads), so the bridge layer is kept whole.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keep class com.getcapacitor.** { *; }
-keep @interface com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }

# youtubedl-android unpacks the Python and FFmpeg runtimes with commons-compress, which instantiates its
# ZIP extra-field handlers reflectively. Without this every download and the extractor fallback fail.
-keep class * implements org.apache.commons.compress.archivers.zip.ZipExtraField { <init>(); }
-keep class com.yausername.** { *; }
