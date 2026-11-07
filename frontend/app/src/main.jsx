// Hyperplane by QuantFriday — customer edition (/app). Entry: theme, the shell's styles and the shell itself. Every
// application (Research view, AI Mode, AI Portfolio Analyser, AI Portfolio Builder) and Docs are separate modules,
// downloaded only when the customer opens them (see shell.jsx).
import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./shell.jsx";
import { addCss, getTheme } from "./core.jsx";
import { DS_CSS } from "./ds.css.js";
import { CSS } from "./shell.css.js";
import { QUICK_CSS } from "./quick.jsx";

document.documentElement.dataset.theme = getTheme();
addCss("ds", DS_CSS);                     // design system first (tokens + ds-* components); screens build on it
addCss("shell", CSS + QUICK_CSS);
// /app/portfolio/<ID>: a public portfolio — only that page, no sign-in, no app shell (owner 2026-11-07)
const pub = /^\/app\/portfolio\/([A-Za-z0-9-]{1,40})\/?$/.exec(window.location.pathname);
const PublicPortfolio = lazy(() => import("./public.jsx"));
createRoot(document.getElementById("root")).render(pub
  ? <Suspense fallback={null}><PublicPortfolio code={decodeURIComponent(pub[1])}/></Suspense>
  : <App/>);
