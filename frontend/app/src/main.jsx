// Hyperplane by QuantFriday — customer edition (/app). Entry: theme, the shell's styles and the shell itself. Every
// application (Research view, AI Mode, AI Portfolio Analyser, AI Portfolio Builder) and Docs are separate modules,
// downloaded only when the customer opens them (see shell.jsx).
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./shell.jsx";
import { addCss, getTheme } from "./core.jsx";
import { CSS } from "./shell.css.js";
import { QUICK_CSS } from "./quick.jsx";

document.documentElement.dataset.theme = getTheme();
addCss("shell", CSS + QUICK_CSS);
createRoot(document.getElementById("root")).render(<App/>);
