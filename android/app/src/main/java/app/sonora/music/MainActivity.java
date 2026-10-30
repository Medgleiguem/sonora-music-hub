package app.sonora.music;

import com.getcapacitor.BridgeActivity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    static final String UI_PREFERENCES = "sonora_ui";
    static final String FULLSCREEN = "fullscreen";

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SonoraMediaPlugin.class);
        registerPlugin(PlaybackPlugin.class);
        super.onCreate(savedInstanceState);
        // After the app theme is in place: Sonora is dark, so the system bars are transparent with light icons and no scrim.
        EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
        // Hidden bars return briefly with a swipe from the screen edge.
        WindowCompat.getInsetsController(window, window.getDecorView())
            .setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        applyFullscreen();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('sonora:back'))", null);
            }
        });
    }

    // Dialogs, the notification shade and other apps can bring the bars back; restore the choice on return.
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyFullscreen();
    }

    void applyFullscreen() {
        boolean fullscreen = getSharedPreferences(UI_PREFERENCES, MODE_PRIVATE).getBoolean(FULLSCREEN, true);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (fullscreen) controller.hide(WindowInsetsCompat.Type.systemBars());
        else controller.show(WindowInsetsCompat.Type.systemBars());
    }
}
