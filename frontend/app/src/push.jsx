// Round 28: phone notifications (owner 2026-11-18: "the Planner reminders … I want to see that on my mobile, like Teams").
// Turn them on for this phone / browser: the browser asks once ("Allow notifications"), then it gets its own encrypted address at its
// push service, which the server keeps (own rows only). Off = that address is removed. Nothing is ever shown without the customer's yes.
import React, { useEffect, useState } from "react";
import { api } from "./core.jsx";

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () => !!((window.matchMedia && window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches) || navigator.standalone);
const deviceName = () => { const u = navigator.userAgent || ""; return IOS ? "iPhone / iPad" : /Android/.test(u) ? "Android phone" : /Windows/.test(u) ? "Windows computer" : /Mac/.test(u) ? "Mac" : "This browser"; };

// Round 29 (owner: "not like a random notification from Chrome … like WhatsApp"): inside the Android app (APK 1.0.5+) the app itself
// receives and shows the notifications. At every open it hands the page "#hpn=<address>.<key>.<allowed 1/0>.<version>" — a fragment, so
// it never reaches the server's logs; it is read here once and cleared from the address bar at once. Android's own "Allow" is the yes.
// An older app (opened by the app, no #hpn) is told to update.
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } } };
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* storage blocked */ } } };
(() => {
  const m = /^#hpn=([^&]*)/.exec(window.location.hash || "");
  if (m) {
    const [token = "", key = "", allowed = "0", v = "0"] = decodeURIComponent(m[1]).split(".");
    ls.set("hp-app", JSON.stringify({ token, allowed: allowed === "1", v: +v || 0 }));
    ss.set("hp-app-key", key);                                     // the phone's own key: this visit only, sent to the server once
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* ignore */ }
  } else if (/^android-app:\/\/in\.quantfriday\.hyperplane/.test(document.referrer || "")) {
    ls.set("hp-app", JSON.stringify({ token: "", allowed: false, v: 0 }));   // the app, but too old to bring its notifications
  }
})();
// only inside the app (full screen): the same phone's Chrome tabs share this storage and stay on the browser's own notifications
export const appInfo = () => { if (!installed()) return null; try { return JSON.parse(ls.get("hp-app") || "null"); } catch { return null; } };
const appOn = async a => {
  const key = ss.get("hp-app-key");
  if (!a.token || !key) return "app-reopen";                     // opened from inside without the app's hand-over: reopen the app
  await api("/app/api/push/native", { method: "POST", json: { token: a.token, key, device: "Android app" } });
  ls.set("hp-app-off", null); ls.set("hp-app-reg", a.token);
  await webOffQuiet();                                           // this phone's old Chrome notifications stop (no doubles, never "Chrome")
  return "app-on";
};
const webOffQuiet = async () => {
  try {
    const r = "serviceWorker" in navigator && await navigator.serviceWorker.getRegistration("/app/");
    const sub = r && r.pushManager && await r.pushManager.getSubscription();
    if (sub) { await api("/app/api/push/unsubscribe", { method: "POST", json: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* nothing to stop */ }
};
// once signed in (shell.jsx): the app's address goes to the server when it is new or changed — unless turned off on this phone
export async function appPushSync() {
  const a = appInfo();
  if (!a || !a.v || !a.allowed || ls.get("hp-app-off") === "1" || ls.get("hp-app-reg") === a.token) return;
  try { await appOn(a); } catch { /* tried again at the next open */ }
}

// "yes" (can be turned on here) · "ios" (iPhone: only inside the Home Screen app) · "no" (this browser cannot)
export function pushSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return IOS && !installed() ? "ios" : "no";
  return "yes";
}
const reg = async () => (await navigator.serviceWorker.getRegistration("/app/")) || navigator.serviceWorker.ready;

export async function pushState() {
  const a = appInfo();
  if (a) {
    if (!a.v) return "app-old";
    if (!a.allowed) return "app-blocked";
    return (await api("/app/api/push/status", { method: "POST", json: { token: a.token } })).native ? "app-on" : "app-off";
  }
  const s = pushSupport();
  if (s !== "yes") return s;
  if (Notification.permission === "denied") return "blocked";
  const r = await reg(); const sub = r && await r.pushManager.getSubscription();
  if (!sub) return "off";
  return (await api("/app/api/push/status", { method: "POST", json: { endpoint: sub.endpoint } })).on ? "on" : "off";
}

export async function pushOn() {
  const p = await Notification.requestPermission();
  if (p !== "granted") return p === "denied" ? "blocked" : "off";
  const { key } = await api("/app/api/push/key");
  const r = await reg();
  let sub = await r.pushManager.getSubscription();
  const had = sub && sub.options && sub.options.applicationServerKey;
  if (sub && had && b64u(had) !== key) { await sub.unsubscribe(); sub = null; }          // made for another key: start again
  sub = sub || await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) });
  await api("/app/api/push/subscribe", { method: "POST", json: { endpoint: sub.endpoint, p256dh: b64u(sub.getKey("p256dh")),
    auth: b64u(sub.getKey("auth")), device: deviceName() } });
  return "on";
}

export async function pushOff() {
  const r = await reg(); const sub = r && await r.pushManager.getSubscription();
  if (sub) { await api("/app/api/push/unsubscribe", { method: "POST", json: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  return "off";
}

// the switch, with its plain-words state: used in the Planner (under Reminders) and in the Account window
export function PhonePush({ id = "hp-push" }) {
  const [st, setSt] = useState("…"); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setSt).catch(() => setSt(appInfo() ? "app-off" : "off")); }, []);
  const a = appInfo();
  const appOff = async () => {
    await api("/app/api/push/native/off", { method: "POST", json: { token: a.token } });
    ls.set("hp-app-off", "1"); ls.set("hp-app-reg", null); return "app-off";
  };
  const run = async fn => {
    setBusy(true); setMsg("");
    try { setSt(await fn()); } catch (e) { setMsg(e.message || "Could not change it — please try again"); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true); setMsg("");
    try { await api("/app/api/push/test", { method: "POST" }); setMsg("Sent — it arrives in a few seconds."); } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <div className="hp-push" id={id} data-state={st}>
      {st === "app-on" ? <>
        <span className="hp-push-t"><i className="ok"/>On · from the Hyperplane app. Choose which kinds in Android Settings → Apps → Hyperplane → Notifications.</span>
        <span className="hp-push-b"><button type="button" className="px-btn sm" onClick={test} disabled={busy} id={`${id}-test`}>Send a test</button>
          <button type="button" className="px-btn sm" onClick={() => run(appOff)} disabled={busy} id={`${id}-off`}>Turn off</button></span>
      </> : st === "app-off" ? <>
        <span className="hp-push-t">Get new Inbox items and Planner reminders as phone notifications</span>
        <button type="button" className="px-btn sm primary" onClick={() => run(() => appOn(a))} disabled={busy} id={`${id}-on`}>Turn on</button>
      </> : st === "app-blocked" ? <span className="hp-push-t">Notifications are off for the Hyperplane app. Turn them on in Android Settings →
        Apps → Hyperplane → Notifications, then close and reopen the app.</span>
      : st === "app-reopen" ? <span className="hp-push-t">Close the Hyperplane app and open it again, then tap Turn on.</span>
      : st === "app-old" ? <>
        <span className="hp-push-t">Update the Hyperplane app to get notifications on this phone.</span>
        <a className="px-btn sm primary" href="/app/download/hyperplane.apk" download="Hyperplane.apk" id={`${id}-update`}>Update the app</a>
      </> : st === "on" ? <>
        <span className="hp-push-t"><i className="ok"/>Notifications are on for this {IOS ? "iPhone" : "device"}</span>
        <span className="hp-push-b"><button type="button" className="px-btn sm" onClick={test} disabled={busy} id={`${id}-test`}>Send a test</button>
          <button type="button" className="px-btn sm" onClick={() => run(pushOff)} disabled={busy} id={`${id}-off`}>Turn off</button></span>
      </> : st === "off" ? <>
        <span className="hp-push-t">Get the reminders as phone notifications</span>
        <button type="button" className="px-btn sm primary" onClick={() => run(pushOn)} disabled={busy} id={`${id}-on`}>Turn on</button>
      </> : st === "blocked" ? <span className="hp-push-t">Notifications are blocked for Hyperplane. Allow them in your phone's settings
        (Settings → Apps → Hyperplane or Chrome → Notifications), then come back here.</span>
      : st === "ios" ? <span className="hp-push-t">On iPhone, notifications work in the Hyperplane app: add it to your Home Screen first
        (your name → Mobile app → iPhone), then turn them on there.</span>
      : st === "no" ? <span className="hp-push-t">This browser cannot show notifications. Use Chrome, or the Hyperplane mobile app.</span>
      : <span className="hp-push-t">Checking…</span>}
      {msg && <span className="hp-push-m" role="status">{msg}</span>}
    </div>);
}

// round 29: an older Android app (version code below APP_LATEST — raise it with each new APK) shows one slim line to update; ✕ = 3 days
export const APP_LATEST = 6;
export function AppUpdateBar() {
  const a = appInfo();
  const [hide, setHide] = useState(() => +(ls.get("hp-app-upd-hide") || 0) > Date.now());
  if (!a || a.v >= APP_LATEST || hide) return null;
  return (
    <div className="hp-appupd" id="hp-appupd" role="status">
      <span>A new version of the Hyperplane app is ready: update to get notifications like any other app.</span>
      <a className="px-btn sm primary" href="/app/download/hyperplane.apk" download="Hyperplane.apk" id="hp-appupd-go">Update</a>
      <button type="button" className="hp-appupd-x" aria-label="Hide for now" id="hp-appupd-x"
        onClick={() => { ls.set("hp-app-upd-hide", String(Date.now() + 3 * 864e5)); setHide(true); }}>✕</button>
    </div>);
}
