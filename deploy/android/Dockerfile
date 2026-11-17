# Round 27: builds the Hyperplane Android app (APK) — a Trusted Web Activity that opens https://<DOMAIN>/app/ full screen.
# Everything the build needs lives in this image (JDK 17, Node, the Android SDK, Google's Bubblewrap); nothing is installed on
# the laptop. Used by deploy/android/build-apk.sh — the signing key is mounted at run time and never baked into the image.
FROM eclipse-temurin:17-jdk AS jdk

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH=/opt/java/openjdk/bin:$PATH ANDROID_HOME=/opt/android-sdk

# Android command-line tools in their standard place (cmdline-tools/latest), plus the platform and the build tools Bubblewrap 1.27
# compiles with (compileSdk 36, build-tools 36.1.0). Bubblewrap only checks that $ANDROID_HOME/bin exists, so bin/ holds a link to
# sdkmanager — the tools must NOT be unpacked into the SDK root itself: their source.properties there makes Gradle read the whole
# SDK as one old-style package and it never finds the platform ("Failed to find target with hash string 'android-36'").
RUN curl -fsSL -o /tmp/clt.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
 && mkdir -p $ANDROID_HOME/cmdline-tools $ANDROID_HOME/bin && unzip -q /tmp/clt.zip -d /tmp/clt \
 && mv /tmp/clt/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && rm -rf /tmp/clt /tmp/clt.zip \
 && ln -s $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager $ANDROID_HOME/bin/sdkmanager \
 && yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null \
 && $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-36" "build-tools;36.1.0" > /dev/null

RUN npm install -g @bubblewrap/cli@1.27.0 --no-audit --no-fund \
 && mkdir -p /root/.bubblewrap \
 && echo '{"jdkPath":"/opt/java/openjdk","androidSdkPath":"/opt/android-sdk"}' > /root/.bubblewrap/config.json

WORKDIR /work
