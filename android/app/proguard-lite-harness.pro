# Only when instrumentation tests target Sonora Lite (-PsonoraTestBuildType=lite), never in published builds.
# The test runner loads these libraries from the app APK, so they must not be shrunk there. This only keeps
# more code than the shipped APK; everything the shipped APK keeps is still kept.
-keep class kotlin.** { *; }
-keep class androidx.tracing.** { *; }
-keep class androidx.concurrent.** { *; }
-keep class com.google.common.util.concurrent.ListenableFuture { *; }
# PlaybackServiceTest connects a MediaController, which the app itself never creates.
-keep class androidx.media3.session.** { *; }
