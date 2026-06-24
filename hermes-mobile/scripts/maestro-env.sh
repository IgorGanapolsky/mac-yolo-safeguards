# shellcheck shell=bash
# Shared Maestro + Java env for Hermes Mobile E2E scripts. Source, do not execute.
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-180000}"

if [ -z "${JAVA_HOME:-}" ] || ! "$JAVA_HOME/bin/java" -version >/dev/null 2>&1; then
  for candidate in \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home"; do
    if [ -d "$candidate" ] && "$candidate/bin/java" -version >/dev/null 2>&1; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
  if [ -z "${JAVA_HOME:-}" ]; then
    for candidate in /opt/homebrew/Cellar/openjdk@17/*/libexec/openjdk.jdk/Contents/Home \
      /usr/local/Cellar/openjdk@17/*/libexec/openjdk.jdk/Contents/Home; do
      if [ -d "$candidate" ] && "$candidate/bin/java" -version >/dev/null 2>&1; then
        export JAVA_HOME="$candidate"
        break
      fi
    done
  fi
fi

if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ -d "$HOME/.maestro/bin" ]; then
  export PATH="$HOME/.maestro/bin:$PATH"
fi
