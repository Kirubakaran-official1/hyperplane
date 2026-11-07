// AI Momentum SIP (Risk) — its own application (owner, 2026-11-06: "split into 2 apps"): the shared SIP page in stock
// mode (apps/sip.jsx): stocks only, spread wide, the RISK banner, /app/api/msip, saved kind "msip".
import React from "react";
import { SipView } from "./sip.jsx";

export default function MomentumSip(p) { return <SipView {...p} mode="stock"/>; }
