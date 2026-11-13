# Buy on Zerodha: Kite Publisher hand-off

Hyperplane can open **Kite**, Zerodha's own order page, with the stocks and quantities of a plan already filled in.

1. The customer reviews the orders in Hyperplane.
2. They press **Open Kite**. Their own browser goes to Kite, which asks them to sign in if needed.
3. They confirm the orders on Kite.

Each customer connects **their own free Kite Publisher app** once: they paste its API key in Hyperplane, which encrypts it and stores it against their account. Hyperplane never places an order, never sees the customer's Zerodha login and keeps no Zerodha token.

---

## 1. How it works

```
Hyperplane app                        Hyperplane server                      Zerodha (Kite)
──────────────                        ─────────────────                      ──────────────
Preview: stocks, qty  ── check ──▶    Zerodha symbol, lot, our price → limit
"Open Kite" (click)   ── prepare ─▶   re-checks, records the hand-off,
                      ◀── api_key + basket JSON
browser form POST  ──────────────────────────────────────────────────────▶  /connect/basket
                                                                            sign in if needed → review → confirm
                      ◀─ /app/#zerodha=success ◀── /app/api/zerodha/return ◀── redirect (status + token)
"Back from Zerodha"   ── returned ─▶  marks the hand-off "returned, not verified"
```

- **Offsite basket.** The browser posts a plain HTML form with two fields:
  - `api_key`: **the customer's own** Publisher app key (not the API secret), opened from the vault only for this hand-off.
  - `data`: the basket JSON.

  The form goes to `https://kite.zerodha.com/connect/basket`. This is Zerodha's documented "offsite order execution", which it recommends for every Publisher use.
- **Each basket line** has these values:
  - `variety: regular`, `exchange: NSE`, `product: CNC` (delivery);
  - `order_type: LIMIT` with a `price`;
  - `quantity`, `transaction_type` (BUY / SELL);
  - `validity: DAY`;
  - `readonly: false`, so the customer can still change the price or quantity on Kite;
  - `tag`: 8 characters.
- **Why LIMIT, not MARKET.** Developers on the Zerodha forum report that offsite baskets do not pass "market protection", so MARKET orders are rejected.
  - The limit is **our latest price +1%** to buy and **−1%** to sell, rounded to that instrument's tick size from Zerodha's list.
  - The +1% is the most the customer pays; the order fills at the best available price within that limit.
- **At most 10 orders a basket.** Kite Publisher documents a 10-order maximum.
  - Larger plans become "basket 1 of N". Each basket is opened by its own click from the Hyperplane tab (Kite opens in a new tab).
- **Swaps** are one basket: **SELL** the stock that left the plan, then **BUY** the new one.
  - The sell can be at most what the plan's tracking holds. The Analyser list has no quantities, so there the customer enters their own.
  - Kite may ask for the CDSL TPIN (or uses DDPI) to sell.

## 1b. Connect Zerodha (the customer, once)

**Connect Zerodha** sits in the top bar of every page (and under Profile → Account) for customers who hold "Buy on Zerodha". One pop-up guides them through 3 steps, each with an annotated screenshot (personal details covered):
1. **A free Kite developer account** at developers.kite.trade/signup. They use **only the email and mobile number of their Zerodha trading account**, and leave **IP Whitelist empty**.
2. **A Publisher app** (Create new app → Publisher, free): any name, the **Redirect URL** shown in the window (Copy button), and any description.
3. **The API key** of that app, pasted into the window → **Save**.

Then: **log in to Kite** (a new tab), and Buy on Zerodha opens Kite with the orders. A customer who presses Buy on Zerodha before connecting gets the same pop-up first. **Change key** and **Remove key** are in the same window. A changed key replaces the old one only once the new one is saved.

**How the key is kept** (`backend/app/vault.py`, table `zerodha_keys`):
- **Envelope encryption, AES-256-GCM:** each key is sealed under its own random 256-bit data key, and that data key is sealed under the master key.
- **The master key** is the file `secrets/zerodha_kek` on the server. It is not in git, not in `.env` and not in the database, and it is mounted read-only into the customer service only. The admin app and the worker cannot open any key.
- **Bound to its owner:** each seal names the purpose and the customer. A sealed key copied onto another account, or with one byte changed, fails to open instead of giving a wrong key.
- **No part of the key is ever shown or stored readable.** The customer sees an **encrypted key ID** (e.g. `8CBF-593D`): an HMAC of the key under the master key, which reveals nothing about it. The key is never logged, never sent back, and is opened only inside the hand-off.
- **Row-level security:** each customer's row is visible to that customer only. Remove key deletes the row.
- With Publisher, Hyperplane still cannot know whether the customer is signed in to Kite right now. That is why the chip says "connected" (a key is saved), never "logged in".

## 1c. After Kite: the check-in, swaps, reminders (round 21)

- **Check-in.** Hyperplane cannot see what happened on Kite, so after every basket the customer tells it: *placed as planned*, *edit what I placed* (quantity and price per stock), or *not placed*.
  - The next basket is offered only after that.
  - Nothing is ever marked placed by itself.
  - Kite's tab (the return page) offers the same check-in, and the Hyperplane tab hears it.
- **New tab, always.** Kite never opens in the Hyperplane tab. If the browser blocks the new tab, a button opens it with one more click.
- **Swaps are two steps.** First the customer **sells** the old stock and checks in. Then they **buy** the new one and check in. After that the swap is *done* and is never offered again. If the customer doesn't hold the old stock, "I don't hold it / sold it already" skips the sell.
- **SIP reminder.** The customer picks a day of the month, 1–28. On that day an Inbox item asks for the instalment, with Buy on Zerodha and Open the plan. Checking in the instalment as placed closes the item. Sending the same instalment twice needs "Send it again anyway".
- **On Zerodha section.** Each saved portfolio shows its instalments, planned against placed, its swaps' steps, any baskets waiting for a check-in, and the holdings the check-ins add up to. It sits beside the model tracking.

## 2. Symbols: our ticker vs Zerodha's ticker

Our prices come from ChartInk, which uses **NSE symbols**. Zerodha uses the same NSE trading symbol for normal (EQ-series) stocks and ETFs. The difference is the **series**: a stock in the trade-to-trade segment is listed on Kite as `SYMBOL-BE` or `SYMBOL-BZ`, and SME stocks as `-SM` or `-ST`.

**Authority: Zerodha's own instrument list.**
- Source: `https://api.kite.trade/instruments/NSE`, the documented daily dump.
- It is fetched **once a day after 08:35 IST**, as Zerodha advises ("request once a day around 08:30 and store it"). It is not scraped and not polled.
- It holds the exact `tradingsymbol`, `tick_size` and `lot_size` of each instrument.
- **Sanity gate:** the list is kept only if the columns are exactly the documented ones, it holds at least 1,500 NSE stocks and ETFs, and it did not shrink by more than 20%. Otherwise the previous list stays, and Admin shows why.
- If Zerodha ever requires a login for this file, the daily refresh will fail visibly (Admin → Zerodha) and baskets stop after 5 days. Nothing wrong is sent.

**Crosswalk** (in this order, never by company name):

| Case | Rule | Shown to the customer |
|---|---|---|
| Admin correction | `zerodha_symbol_map`: our symbol → a Zerodha symbol that is on today's list, or Blocked | ✓ "Matched by the admin" / ✗ "Not sent" |
| Same symbol | `tradingsymbol == our symbol` | ✓ "Same symbol on Zerodha" |
| One series form | exactly one of `SYM-BE`, `SYM-BZ`, `SYM-SM`, `SYM-ST` | ⚠ "Different symbol on Zerodha (SYM-BE) — trade-to-trade" |
| Anything else | none, or more than one match | ✗ "Not on Zerodha" (the line cannot be sent) |

**On 13 Nov 2026**, all 2,717 published stocks and ETFs were found on Zerodha:
- 2,557 with the same symbol;
- 160 under a series form (156 `-BE`, 4 `-BZ`);
- 0 missing.

Research never depends on this. A stock that is not on Zerodha can still be studied; only its basket line is disabled.

## 3. Setup (owner, once on the server)

1. Create the master key, on the server, in the `hyperplane` folder:
   ```
   mkdir -p secrets && openssl rand -base64 32 > secrets/zerodha_kek && chmod 600 secrets/zerodha_kek
   ```
   **Never delete or change this file.** Without it no saved key can be opened, and every customer would have to paste theirs again. Keep a copy in your password manager.
2. Deploy (`docker compose up -d --build web api portal worker`).
3. Test with your own Customer Admin login:
   - Connect Zerodha with your own Publisher app;
   - place a **one-share** order of a cheap stock;
   - check Kite → Orders.
4. When you are happy, give "Buy on Zerodha" to other roles in **🔐 Access manager**:
   - `sip:zerodha`, `msip:zerodha`, `builder:zerodha`, `portfolio:zerodha`;
   - for everyone: add them to the default Customer role.

## 4. Pre-launch checklist (before customers other than the owner get it)

- [ ] Written confirmation from Zerodha that this commercial use of Publisher is within its terms. "Free, no approval" covers the standard buttons, not the whole business.
- [ ] A **SEBI review**. Hyperplane chooses stocks and quantities for customers. Check with a SEBI-registered Research Analyst / Investment Adviser professional which registration this needs, and how disclosures must read.
- [ ] The "For education only, not investment advice" wording is reviewed with that professional.
- [ ] The manual smoke test below has passed on the live server.
- [ ] The "trade-to-trade" wording for `-BE` stocks is acceptable to you.

## 5. Manual smoke test (live server, your own account)

1. Admin → Zerodha: the list date is today (after 08:35).
2. Customer app, signed in as the Customer Admin: Connect Zerodha with your own Publisher key. Then AI Portfolio Builder → a small portfolio → **Buy on Zerodha**.
   - The preview lists every stock with ✓ / ⚠.
   - Untick everything except one cheap stock and set the quantity to 1.
3. Tick the market-risk notice, then **Open Kite**. Kite opens in a new tab; if you are signed out it asks you to sign in. The order shows LIMIT, CNC, DAY, quantity 1.
4. Confirm or cancel on Kite. That tab comes back to Hyperplane and shows "Back from Zerodha" with the tag.
5. Kite → Orders shows the order, with that tag if Kite displays tags.
6. Admin → Zerodha → Hand-offs shows the row as "Back from Kite (not verified)".
7. Check on a phone as well (Kite web in the phone browser).

## 6. Not built (on purpose)

- No direct order API and no orders from the server.
- No orders on timers, signals or in the background: only the customer's own click, then their own confirmation on Kite.
- No Zerodha login of ours, and no request token, access token, password or TOTP kept.
- No holdings, funds, order book or fill status from Zerodha. Hyperplane cannot know whether an order was placed or filled.
- No F&O, MIS, AMO, GTT or BSE.

## 7. Security notes

- Every line is checked again on the server at the moment of the hand-off:
  - the symbol against Zerodha's list;
  - the price comes from our data, never from the browser;
  - whole lots, a 10-line maximum, and SELL only in a swap of the customer's own plan.
- The Publisher key reaches the browser only in the answer to a hand-off, for customers who hold the permission.
- The return URL ignores everything Kite sends except one status word. The request token is not stored and not written to the access log.
  - A return is matched only to **that signed-in customer's** newest hand-off of the last 2 hours.
  - A forged, replayed or other-tab return changes nothing; it is only recorded for review.
- The page's Content-Security-Policy lets a form go to `https://kite.zerodha.com` and nowhere else outside this site.
- `zerodha_handoffs` has row-level security: each customer sees and writes only their own rows. The portal can never rewrite what was sent.

## 8. References

- Kite Publisher (free, no approval): https://kite.trade/publisher/
- Offsite order execution (basket form, parameters, redirect): https://kite.trade/docs/connect/v3/basket/
- Publisher JS (10 orders a basket, 8-character tag, offsite recommended, iOS WebView note): https://kite.trade/docs/connect/v3/publisher/
- Instrument list (daily dump, store it, fetch around 08:30): https://kite.trade/docs/connect/v3/market-data-and-instruments/
- Kite Connect FAQs: https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs
- Tag length discrepancy (20 vs 8): https://kite.trade/forum/discussion/14814/tags-while-placing-orders
- Redirect behaviour for offsite baskets: https://kite.trade/forum/discussion/10242/mass-retail-query-offsite-order-execution
- Market protection not passed in offsite baskets (why LIMIT): https://kite.trade/forum/discussion/15961/offsite-basket-does-not-support-market-protection-undocumented-causes-market-order-failures
- NSE securities available for trading (exchange master, for manual cross-checks): https://www.nseindia.com/static/market-data/securities-available-for-trading
