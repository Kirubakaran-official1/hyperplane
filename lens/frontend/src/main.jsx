// Hyperplane LENS web app: sign-in / request access, then the Lens home. (Admin is in Hyperplane's admin dashboard: Admin → Lens admin.)
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { COPIED_CSS } from "./copied.css.js";
import { LENS_CSS } from "./lens.css.js";
import { api, Brand } from "./ui.jsx";
import { AuthScreen } from "./auth.jsx";

const style = document.createElement("style");
style.textContent = COPIED_CSS + LENS_CSS;
document.head.appendChild(style);
document.documentElement.dataset.theme = "light";                 // as Hyperplane opens

function Home({ me, onOut }) {
  return (
    <div className="la">
      <header className="la-top"><Brand/><span className="muted la-me">{me.name}</span>
        <button type="button" className="ghost" onClick={onOut} id="home-out">Sign out</button></header>
      <section className="card la-body" id="lens-home">
        <h1 style={{ margin: 0, font: "600 22px/30px var(--sans)" }}>Welcome, {me.name.split(" ")[0]}</h1>
        <p className="muted">Lens is being built. Back-testing will open here first; we'll let you know when it's ready.</p>
      </section>
    </div>);
}

function App() {
  const [me, setMe] = useState(undefined), [notice, setNotice] = useState("");
  const load = () => api("/api/me").then(setMe).catch(() => setMe(null));
  useEffect(() => { load(); }, []);
  const out = async () => { await api("/api/logout", { method: "POST" }).catch(() => {}); setMe(null); };
  if (me === undefined) return <div className="loading muted">Loading…</div>;
  if (!me) return <AuthScreen onIn={load} notice={notice}/>;
  return <Home me={me} onOut={out}/>;
}

createRoot(document.getElementById("root")).render(<App/>);
