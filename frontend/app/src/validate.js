// Sign-in / sign-up validation (round 17c, owner 2026-11-07: "the email must be a Gmail id — no corporate id · no numbers in the name · all
// proper validation"). These rules MIRROR backend/app/signup_guard.py: here they only help the person (instant, friendly messages); the
// server checks everything again and never trusts this page.
export const GMAIL_RE = /^(?=[a-z0-9.]{6,30}@)[a-z0-9](?:[a-z0-9]|\.(?!\.))*[a-z0-9]@gmail\.com$/;
export const GMAIL_MSG = "Please use your own Gmail address (yourname@gmail.com). Other and company email addresses are not accepted.";
const COMMON = new Set(["password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "11111111", "iloveyou", "welcome1", "welcome123", "admin123", "letmein1", "abc12345", "abcd1234", "india123", "india@123", "test1234", "hyperplane",
  "hyperplane1", "hyperplane123", "trading123", "stocks123", "money123", "monkey123", "dragon123", "football1", "sunshine1", "master123", "login123"]);
const PUNCT = " .'’-";
const isLetter = c => /\p{L}/u.test(c), isMark = c => /\p{M}/u.test(c);

// what may be typed in a name / place box: letters (any language), marks, space . ' - — everything else (numbers, symbols, markup) is dropped as typed
export const lettersOnly = v => Array.from(v).filter(c => isLetter(c) || isMark(c) || PUNCT.includes(c)).join("").replace(/\s{2,}/g, " ").replace(/^\s+/, "");
export const noSpaces = v => v.replace(/[\s​-‏‪-‮⁠﻿]/g, "");

export function nameError(raw) {
  const n = raw.trim().replace(/\s+/g, " ");
  if (!n) return "Please enter your full name.";
  if (/\p{Nd}|\d/u.test(n)) return "Numbers are not allowed in the name — please use letters only.";
  if (!Array.from(n).every(c => isLetter(c) || isMark(c) || PUNCT.includes(c))) return "Please use letters only in the name (spaces, dots, apostrophes and hyphens are fine).";
  if (n.length < 2 || Array.from(n).filter(isLetter).length < 2) return "Please enter your full name.";
  if (!isLetter(n[0]) || !(isLetter(n[n.length - 1]) || isMark(n[n.length - 1]) || n[n.length - 1] === ".")) return "The name must start and end with a letter.";
  if (/[ .'’-]{2,}/.test(n.replace(". ", " "))) return "Please check the name — it has repeated spaces or symbols.";
  if (n.length > 60) return "The name is too long (at most 60 characters).";
  if (n.split(" ").some(w => w.length > 30)) return "Please enter your full name.";
  return "";
}
export function emailError(raw, gmailOnly) {
  const e = raw.trim().toLowerCase();
  if (!e) return "Please enter your email address.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e)) return "Please enter a valid email address (like yourname@gmail.com).";
  if (gmailOnly && !GMAIL_RE.test(e)) {
    const [local, dom] = e.split("@");
    if (dom !== "gmail.com") return GMAIL_MSG;
    if (local.includes("+")) return "Please use your Gmail address without a + part (yourname@gmail.com).";
    return "Gmail names are 6–30 letters, numbers or dots, and start and end with a letter or number.";
  }
  return "";
}
export function placeError(v, label, required = true) {
  const s = v.trim();
  if (!s) return required ? `Please enter your ${label}.` : "";
  if (/\d/.test(s) || !Array.from(s).every(c => isLetter(c) || isMark(c) || PUNCT.includes(c))) return `Please use letters only for your ${label}.`;
  if (required && s.length < 2) return `Please enter your ${label}.`;
  if (/[ .'’-]{2,}/.test(s.replace(". ", " ")) || !isLetter(s[0]) || !(isLetter(s[s.length - 1]) || isMark(s[s.length - 1]) || s[s.length - 1] === ".")) return `Please check your ${label} — use letters, with single spaces or hyphens between words.`;
  return "";
}
export function passwordError(pw, email = "", name = "") {
  if (pw.length < 8 || pw.length > 128) return "Password must be 8 to 128 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password needs at least one letter and one number.";
  const low = pw.toLowerCase(), digits = low.replace(/\D/g, "");
  const seq = "01234567890123456789", rev = "98765432109876543210";
  if (COMMON.has(low) || new Set(low).size <= 2 || (digits.length >= low.length - 2 && (seq.includes(digits) || rev.includes(digits)))) return "That password is too easy to guess — please choose another.";
  const local = email.toLowerCase().split("@")[0].replace(/\./g, "");
  if (local.length >= 4 && (low === local || (low.includes(local) && low.length - local.length <= 2))) return "Your password must not be your email name.";
  const first = (name.trim().split(/\s+/)[0] || "").toLowerCase();
  if (first.length >= 4 && low.startsWith(first) && low.length - first.length <= 3) return "Your password must not be your name.";
  return "";
}
// how strong a password looks (0–4) for the little meter
export function passwordScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return passwordError(pw) ? 1 : Math.max(s, 2);
}
