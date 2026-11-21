// Sign in / create an account — the same layout as Hyperplane's sign-in (hero on the left, the form card on the right), Lens's words.
// It talks only to Lens's own API (/api/…). A new account waits for QuantFriday's approval before it can sign in.
import React, { useState } from "react";
import { api, Brand, PwBox } from "./ui.jsx";

function Hero() {
  const feats = [
    ["Test before you trade", "Run an idea over years of real market minutes and see how it would really have done."],
    ["Futures and options included", "Index futures and option chains, minute by minute, not just closing prices."],
    ["Honest results", "Every result shows its losing streaks and worst drops next to the gains."],
  ];
  return (
    <div className="hero">
      <div className="hero-grid"/>
      <Brand/>
      <div className="hero-k">Back-testing lab for Indian markets</div>
      <h2 className="hero-h">Test the idea<br/><span>before you risk the money.</span></h2>
      <p className="hero-p">Lens replays the market minute by minute, so you can see how a trading idea would have done on NIFTY, BANKNIFTY
        and SENSEX, before a single rupee goes in.</p>
      <ul className="feats">{feats.map(([h, t]) => <li key={h}><span className="tick">✓</span><div><b>{h}</b><span>{t}</span></div></li>)}</ul>
    </div>);
}

export function AuthScreen({ onIn, notice = "" }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", confirm: "", accept: false });
  const [msg, setMsg] = useState(notice), [ok, setOk] = useState(""), [busy, setBusy] = useState(false), [bad, setBad] = useState({});
  const set = k => e => { const v = e.target.type === "checkbox" ? e.target.checked : e.target.value; setBad(o => ({ ...o, [k]: "" })); setF(p => ({ ...p, [k]: v })); };
  const go = m => { setMode(m); setMsg(""); setBad({}); setF(p => ({ ...p, password: "", confirm: "" })); };
  const reg = mode === "register";
  const submit = async e => {
    e.preventDefault(); setMsg(""); setOk("");
    const email = f.email.trim().toLowerCase();
    if (reg && f.confirm !== f.password) { setBad({ confirm: "The two passwords do not match." }); return; }
    setBusy(true);
    try {
      if (reg) {
        const r = await api("/api/signup", { method: "POST", json: { name: f.name.trim(), email, phone: `+91 ${f.phone.replace(/\D/g, "")}`, password: f.password, accept: f.accept } });
        go("login"); setOk(r.message);
      } else {
        await api("/api/login", { method: "POST", json: { email, password: f.password } });
        onIn();
      }
    } catch (x) {
      if (x.field) setBad({ [x.field]: x.message }); else setMsg(x.message);
    } finally { setBusy(false); }
  };
  const Field = (label, input, k, hint) => <label className={`field ${bad[k] ? "bad" : ""}`} htmlFor={`f-${k}`}><span>{label}</span>{input}
    {bad[k] ? <span className="fe" role="alert">{bad[k]}</span> : hint ? <span className="fh">{hint}</span> : null}</label>;
  return (
    <div className="auth-page">
      <Hero/>
      <div className="auth-side">
        <form className="auth" onSubmit={submit} noValidate id={reg ? "auth-register" : "auth-login"}>
          <h1>{reg ? "Request access" : "Welcome back"}</h1>
          <p className="muted">{reg ? "Tell us who you are. You can sign in as soon as QuantFriday approves your request." : "Sign in to Hyperplane LENS."}</p>
          {ok && <div className="ok" id="auth-ok">{ok}</div>}
          {reg && Field("Full name", <input id="f-name" value={f.name} onChange={set("name")} maxLength={60} autoComplete="name" autoFocus/>, "name")}
          {Field("Email", <input id="f-email" type="email" value={f.email} onChange={set("email")} maxLength={254} autoComplete="email" autoFocus={!reg}/>, "email")}
          {reg && Field("Mobile number", <input id="f-phone" inputMode="numeric" value={f.phone} onChange={set("phone")} maxLength={10} autoComplete="tel-national" placeholder="10-digit mobile"/>, "phone")}
          {reg ? <div className="grid2">
            {Field("Password", <PwBox id="f-password" value={f.password} onChange={set("password")} autoComplete="new-password" invalid={!!bad.password}/>, "password", "8+ characters with letters and numbers")}
            {Field("Confirm password", <PwBox id="f-confirm" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" invalid={!!bad.confirm}/>, "confirm")}
          </div> : Field("Password", <PwBox id="f-password" value={f.password} onChange={set("password")} autoComplete="current-password"/>, "password")}
          {reg && <label className={`field agree-l ${bad.accept ? "bad" : ""}`} htmlFor="f-accept" style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", fontWeight: 500 }}>
            <input id="f-accept" type="checkbox" checked={f.accept} onChange={set("accept")}/>
            <span>I agree to use Lens for my own research only. {bad.accept && <span className="fe" role="alert">{bad.accept}</span>}</span></label>}
          {msg && <div className="err" role="alert" id="auth-err">{msg}</div>}
          <button className="primary" disabled={busy} id="auth-go">{busy ? "Please wait…" : reg ? "Send request" : "Sign in"}</button>
          <div className="switch">{reg ? <>Already approved? <a href="#" onClick={e => { e.preventDefault(); go("login"); }}>Sign in</a></>
            : <>New to Lens? <a href="#" id="to-register" onClick={e => { e.preventDefault(); go("register"); }}>Request access</a></>}</div>
        </form>
        <p className="fine center">Hyperplane LENS is a research tool by QuantFriday. It is separate from Hyperplane: a Hyperplane account does not sign in here.</p>
      </div>
    </div>);
}
