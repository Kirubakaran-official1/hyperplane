# Hyperplane LENS

QuantFriday's back-testing lab. It lives in the `lens/` folder of the Hyperplane repo, but it is a **separate application**: its own
Docker containers, database and sign-in.
- **If Lens stops, Hyperplane is not affected.**
- **Admin:** Hyperplane's dashboard → **⚙ Admin → 🔭 Lens admin**. There you approve or block people, see every sign-in, and later the
  Fyers Data Lab.
- **Address:** Hyperplane's front door (Caddy) passes `lens.quantfriday.in` to Lens over the shared Docker network `qf-edge`.

## First time on the server (once)
1. DNS (Hostinger): add an **A record** `lens` → `130.210.46.117`.
2. Deploy Hyperplane as usual. This brings the `lens/` folder:
   ```
   cd ~/hyperplane && bash deploy/deploy.sh
   ```
3. Add the address, then set Lens up:
   ```
   echo "LENS_DOMAIN=lens.quantfriday.in" >> .env
   bash lens/deploy/setup.sh
   ```
   The setup script:
   - makes `lens/.env` with Lens's own random secrets;
   - adds one shared admin key to Hyperplane's `.env`;
   - makes the `qf-edge` network;
   - starts Lens and restarts Hyperplane's admin server.

After that, `bash deploy/deploy.sh` updates Hyperplane and then Lens. A Lens problem only prints a warning.

## On this computer
Run `bash lens/deploy/setup.sh`, then open http://127.0.0.1:8081.

## Never commit
`lens/.env`, `lens/data/` and `lens/backups/` are git-ignored. Back up `lens/.env` somewhere safe.
