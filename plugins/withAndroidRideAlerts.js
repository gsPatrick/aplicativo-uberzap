const {
  withAndroidManifest,
  withMainActivity,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const OVERLAY_MODULE_KOTLIN = `package com.ubezap.overlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class UbezapOverlayModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "UbezapOverlay"

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject("OVERLAY_ERROR", e)
    }
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + reactApplicationContext.packageName)
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OVERLAY_ERROR", e)
    }
  }

  @ReactMethod
  fun wakeScreen(promise: Promise) {
    try {
      val activity = reactApplicationContext.currentActivity
      activity?.runOnUiThread {
        activity.window?.addFlags(
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )
        val pm = reactApplicationContext.getSystemService(PowerManager::class.java)
        @Suppress("DEPRECATION")
        val wakeLock = pm?.newWakeLock(
          PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
          "UbeZap:RideAlert"
        )
        wakeLock?.acquire(10000L)
        promise.resolve(true)
      } ?: promise.resolve(false)
    } catch (e: Exception) {
      promise.reject("WAKE_ERROR", e)
    }
  }
}
`;

const OVERLAY_PACKAGE_KOTLIN = `package com.ubezap.overlay

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class UbezapOverlayPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(UbezapOverlayModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

function addPermissions(androidManifest) {
  const permissions = [
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.USE_FULL_SCREEN_INTENT',
    'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    'android.permission.DISABLE_KEYGUARD',
    'android.permission.WAKE_LOCK',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.VIBRATE',
    'android.permission.POST_NOTIFICATIONS',
  ];

  if (!androidManifest.manifest['uses-permission']) {
    androidManifest.manifest['uses-permission'] = [];
  }

  const existing = androidManifest.manifest['uses-permission'].map(
    (p) => p.$['android:name']
  );

  permissions.forEach((perm) => {
    if (!existing.includes(perm)) {
      androidManifest.manifest['uses-permission'].push({
        $: { 'android:name': perm },
      });
    }
  });

  return androidManifest;
}

function withWakeScreenFlags(config) {
  return withMainActivity(config, (modConfig) => {
    let contents = modConfig.modResults.contents;

    if (!contents.includes('FLAG_TURN_SCREEN_ON')) {
      const onCreateMatch = contents.match(/override fun onCreate\([^)]*\)\s*\{/);
      if (onCreateMatch) {
        const insertAt = onCreateMatch.index + onCreateMatch[0].length;
        const wakeFlags = `
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
    }`;
        contents =
          contents.slice(0, insertAt) + wakeFlags + contents.slice(insertAt);
      }
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

function withOverlayNativeModule(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const overlayDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'ubezap',
        'overlay'
      );

      fs.mkdirSync(overlayDir, { recursive: true });
      fs.writeFileSync(path.join(overlayDir, 'UbezapOverlayModule.kt'), OVERLAY_MODULE_KOTLIN);
      fs.writeFileSync(path.join(overlayDir, 'UbezapOverlayPackage.kt'), OVERLAY_PACKAGE_KOTLIN);

      return modConfig;
    },
  ]);
}

function withOverlayPackageRegistration(config) {
  return withMainApplication(config, (modConfig) => {
    let contents = modConfig.modResults.contents;

    if (!contents.includes('UbezapOverlayPackage')) {
      if (!contents.includes('import com.ubezap.overlay.UbezapOverlayPackage')) {
        contents = contents.replace(
          /^(package .+\n)/m,
          '$1import com.ubezap.overlay.UbezapOverlayPackage\n'
        );
      }

      contents = contents.replace(
        /(packages\.apply\s*\{)/,
        '$1\n              add(UbezapOverlayPackage())'
      );

      if (!contents.includes('packages.apply')) {
        contents = contents.replace(
          /(override fun getPackages\(\): List<ReactPackage> \{[\s\S]*?return PackageList\(this\)\.packages)/,
          '$1.apply {\n              add(UbezapOverlayPackage())\n            }'
        );
      }
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

function withAndroidRideAlerts(config) {
  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = addPermissions(modConfig.modResults);
    return modConfig;
  });
  config = withWakeScreenFlags(config);
  config = withOverlayNativeModule(config);
  config = withOverlayPackageRegistration(config);
  return config;
}

module.exports = withAndroidRideAlerts;
