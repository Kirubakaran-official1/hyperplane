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

// "yes" (can be turned on here) · "ios" (iPhone: only inside the Home Screen app) · "no" (this browser cannot)
export function pushSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return IOS && !installed() ? "ios" : "no";
  return "yes";
}
const reg = async () => (await navigator.serviceWorker.getRegistration("/app/")) || navigator.serviceWorker.ready;

export async function pushState() {
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
  useEffect(() => { pushState().then(setSt).catch(() => setSt("off")); }, []);
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
      {st === "on" ? <>
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
