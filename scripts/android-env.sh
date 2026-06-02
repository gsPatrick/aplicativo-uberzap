#!/usr/bin/env bash
# Uso: source scripts/android-env.sh   (ou via npm run android:setup-check)

_android_env_fail() {
  echo ""
  echo "❌ Android SDK não encontrado."
  echo ""
  echo "1. Instale Android Studio: https://developer.android.com/studio"
  echo "2. Abra Android Studio → SDK Manager"
  echo "3. Instale: Android SDK Platform 35 + Build-Tools"
  echo ""
  echo "Caminho esperado no Mac: ~/Library/Android/sdk"
  echo ""
  return 1 2>/dev/null || exit 1
}

if [ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME" ]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  return 0 2>/dev/null || exit 0
fi

CANDIDATES=(
  "$HOME/Library/Android/sdk"
  "$HOME/Android/Sdk"
)

for dir in "${CANDIDATES[@]}"; do
  if [ -d "$dir" ]; then
    export ANDROID_HOME="$dir"
    export ANDROID_SDK_ROOT="$dir"
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
    echo "ANDROID_HOME=$ANDROID_HOME"
    return 0 2>/dev/null || exit 0
  fi
done

_android_env_fail
