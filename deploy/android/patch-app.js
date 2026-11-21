// Runs inside the build container after `bubblewrap update` (which regenerates the project every time) and adds what Bubblewrap
// does not make:
//   round 27f  getDisplayMode() (cutout.java.txt): full screen, drawn into the camera-cutout strip too
//   round 29   the app's own notifications (owner: "like WhatsApp"): Firebase Cloud Messaging, HpMessaging.java.txt (receive, decrypt,
//              show, one Android channel per kind), launcher-notify.java.txt (Android's Allow once + the hand-over to the page)
// Prints one "… in place" line per part; build-apk.sh stops when one is missing.
const fs = require("fs"), path = require("path");
const W = "/work", SRC = __dirname;
const find = (d, name) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? find(path.join(d, e.name), name) : e.name === name ? [path.join(d, e.name)] : []);
const twa = JSON.parse(fs.readFileSync(path.join(W, "twa-manifest.json"), "utf8"));
const edit = (file, fn) => { const s = fs.readFileSync(file, "utf8"), t = fn(s); if (t !== s) fs.writeFileSync(file, t); return t; };
const ok = (what, yes) => console.log(`${what}: ${yes ? "in place" : "MISSING"}`);

// ── LauncherActivity: camera strip + notification hand-over ──
const [launcher] = find(path.join(W, "app/src/main/java"), "LauncherActivity.java");
const dir = path.dirname(launcher);
let src = edit(launcher, s => {
  if (!s.includes("LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES")) s = s.replace(/}\s*$/, fs.readFileSync(path.join(SRC, "cutout.java.txt"), "utf8"));
  if (!s.includes("hpWithHandOver")) {
    s = s.replace(/}\s*$/, fs.readFileSync(path.join(SRC, "launcher-notify.java.txt"), "utf8").replace("__VERSION__", String(twa.appVersionCode)) + "}\n");
    s = s.replace("super.onCreate(savedInstanceState);", "super.onCreate(savedInstanceState);\n        hpStart();");
    s = s.replace(/(Uri uri = super\.getLaunchingUrl\(\);[\s\S]*?)return uri;/, "$1return hpWithHandOver(uri);");
  }
  return s;
});
ok("camera strip override", src.includes("LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES"));
ok("notification hand-over", src.includes("hpStart();") && src.includes("return hpWithHandOver(uri);"));

// ── the white status-bar icon (notify-icon/, from icons/badge-96.png) — Bubblewrap only makes one for Chrome's own route ──
for (const d of fs.readdirSync(path.join(SRC, "notify-icon"))) {
  fs.mkdirSync(path.join(W, "app/src/main/res", d), { recursive: true });
  fs.copyFileSync(path.join(SRC, "notify-icon", d, "ic_hp_notify.png"), path.join(W, "app/src/main/res", d, "ic_hp_notify.png"));
}
ok("notification icon", fs.existsSync(path.join(W, "app/src/main/res/drawable-xxhdpi/ic_hp_notify.png")));

// ── the receiver + the channels (made when the app starts) ──
fs.writeFileSync(path.join(dir, "HpMessaging.java"), fs.readFileSync(path.join(SRC, "HpMessaging.java.txt"), "utf8")
  .replace("__PKG__", twa.packageId).replace("__HOST__", twa.host));
src = edit(path.join(dir, "Application.java"), s => s.includes("HpMessaging.channels") ? s
  : s.replace("super.onCreate();", "super.onCreate();\n      HpMessaging.channels(this);"));
ok("notification channels", src.includes("HpMessaging.channels(this);"));

// ── Firebase: the library, the receiver in the manifest, and the project's four public values (no Google build plugin needed) ──
src = edit(path.join(W, "app/build.gradle"), s => s.includes("firebase-messaging") ? s
  : s.replace(/dependencies \{/, "dependencies {\n    implementation 'com.google.firebase:firebase-messaging:24.1.0'"));
ok("firebase library", src.includes("firebase-messaging:24.1.0"));
src = edit(path.join(W, "app/src/main/AndroidManifest.xml"), s => {
  if (!s.includes("android.permission.POST_NOTIFICATIONS"))
    s = s.replace(/(<manifest[^>]*>)/, '$1\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>');
  if (!s.includes(".HpMessaging")) s = s.replace("</application>", `        <service android:name=".HpMessaging" android:exported="false">
            <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT"/></intent-filter>
        </service>
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="hp_general"/>
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_hp_notify"/>
    </application>`);
  return s;
});
ok("notification receiver", src.includes(".HpMessaging") && src.includes("POST_NOTIFICATIONS"));
const g = JSON.parse(fs.readFileSync("/keys/google-services.json", "utf8"));
const cl = (g.client || []).find(c => ((c.client_info || {}).android_client_info || {}).package_name === twa.packageId);
if (cl) {
  const esc = v => String(v).replace(/[<>&"']/g, ch => `&#${ch.charCodeAt(0)};`);
  fs.writeFileSync(path.join(W, "app/src/main/res/values/firebase.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="google_app_id" translatable="false">${esc(cl.client_info.mobilesdk_app_id)}</string>
    <string name="gcm_defaultSenderId" translatable="false">${esc(g.project_info.project_number)}</string>
    <string name="google_api_key" translatable="false">${esc(cl.api_key[0].current_key)}</string>
    <string name="project_id" translatable="false">${esc(g.project_info.project_id)}</string>
</resources>
`);
}
ok("firebase project values", !!cl);
