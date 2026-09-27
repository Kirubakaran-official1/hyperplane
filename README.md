# Hyperplane

Your ChartInk scanner + the Hyperplane dashboard as one website on your Oracle server.

- The scanner runs by itself at **09:45** and **14:30 IST** on weekdays, and when you press **⟳ Sync now**.
- Every collection is stored in PostgreSQL. The dashboard opens on the **latest** one; a date picker loads any older day, a whole day, or a date range.
- **⏱ Intraday Compare** shows how every stock moved between two collections (e.g. 09:45 → 14:30).
- **⚙ Admin**: collection times, holidays, retention, Telegram on/off, run history with logs, stored collections (download Excel / delete), import old Excel files.
- Login users and passwords live only in `config.ini`.

```
hyperplane/
├── backend/
│   ├── app/                 API (main.py), collector (worker.py), storage, schedule
│   ├── scanner/chartink_fast.py   ← your scanner (replace this file to update it)
│   ├── Dockerfile  requirements.txt
├── frontend/
│   ├── src/dashboard.jsx    ← all dashboard widgets (same code as the Hyperplane page)
│   ├── src/server.jsx       login, date picker, Sync, Admin, Intraday Compare
│   ├── Caddyfile  Dockerfile  package.json
├── deploy/                  deploy.sh, backup.sh, restore.sh
├── .github/workflows/deploy.yml   auto-deploy on every push
├── docker-compose.yml
├── config.example.ini       → copy to config.ini (users, secret key, Telegram)
└── .env.example             → copy to .env (domain, database password)
```

---

## Part 1 — On your computer (one time)

1. Install **Git** (git-scm.com), **Docker Desktop** (docker.com) and **VS Code**.
2. Put this project in a folder, e.g. `D:\Trading\oracle server\hyperplane`.
3. Open a terminal in that folder and create your two private files:
   ```
   copy config.example.ini config.ini
   copy .env.example .env
   ```
   - In `config.ini` set `secret_key` to any long random text and set your user ID / password under `[users]`.
   - In `.env` set `DOMAIN=:80` (for testing on your computer) and any `POSTGRES_PASSWORD`.
4. Start everything locally:
   ```
   docker compose up -d --build
   ```
   The first build takes a few minutes. Open **http://localhost**, log in, press **⟳ Sync now**.
   Follow the collector with `docker compose logs -f worker`.

> `config.ini` and `.env` are in `.gitignore`, so your passwords never go to GitHub.

## Part 2 — GitHub (one time)

1. On github.com create a **private** repository named `hyperplane` (no README).
2. In the project folder:
   ```
   git init
   git add .
   git commit -m "Hyperplane first version"
   git branch -M main
   git remote add origin https://github.com/<your-user>/hyperplane.git
   git push -u origin main
   ```

## Part 3 — Oracle server (one time)

SSH into the server (`ssh ubuntu@<server-ip>`), then:

1. **Open ports 80 and 443** — Oracle blocks them in two places:
   - Oracle Cloud console → your instance → Subnet → Security List → *Add Ingress Rules*:
     source `0.0.0.0/0`, TCP, destination ports `80,443`.
   - On the server's own firewall:
     ```
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
2. **Install Docker**:
   ```
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   ```
   Log out and back in.
3. **Let the server read your private repo** (a read-only deploy key):
   ```
   ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
   cat ~/.ssh/github_deploy.pub
   ```
   GitHub repo → Settings → Deploy keys → *Add deploy key* → paste it (leave "write access" off). Then:
   ```
   printf "Host github.com\n  IdentityFile ~/.ssh/github_deploy\n" >> ~/.ssh/config
   git clone git@github.com:<your-user>/hyperplane.git ~/hyperplane
   cd ~/hyperplane
   ```
4. **DuckDNS name** — on duckdns.org sign in, create a name (e.g. `hyperplane-kiruba`), put the server's public IP in it and copy your token.
5. **Private files on the server**:
   ```
   cp config.example.ini config.ini && nano config.ini      # users, secret_key (openssl rand -hex 32), Telegram
   cp .env.example .env && nano .env                        # DOMAIN=hyperplane-kiruba.duckdns.org, passwords, DuckDNS token
   chmod 600 config.ini .env
   ```
6. **Start it**:
   ```
   docker compose --profile duckdns up -d --build
   ```
   Open **https://hyperplane-kiruba.duckdns.org** — the HTTPS certificate is created automatically in the first minute.
7. **Stop the old scanner cron job** for `chartink_fast.py` (`crontab -e`, put `#` in front of that line) so it doesn't run twice. Your other cron jobs are not affected.
8. **Load your history**: Admin → *Import old Excel files* → select your old `detailed_signals_*.xlsx` files.

## Part 4 — Automatic updates on every push (one time)

1. On the server, create a key that GitHub Actions uses to log in:
   ```
   ssh-keygen -t ed25519 -f ~/.ssh/actions_deploy -N ""
   cat ~/.ssh/actions_deploy.pub >> ~/.ssh/authorized_keys
   cat ~/.ssh/actions_deploy          # copy this PRIVATE key
   ```
2. GitHub repo → Settings → Secrets and variables → Actions → add three secrets:
   `SERVER_HOST` = server IP, `SERVER_USER` = `ubuntu`, `SERVER_SSH_KEY` = the private key you copied.

From now on:

## Your everyday workflow

```
edit on your computer  →  docker compose up -d --build  (check http://localhost)  →  git commit + git push
```
GitHub updates the server in about 1–2 minutes (see the repo's **Actions** tab). Only what changed is rebuilt:
a dashboard change rebuilds the `web` part only, a scanner change rebuilds `api` + `worker`. Stored data is never touched.

| I want to… | Do this |
|---|---|
| Change a widget / add a dashboard feature | edit `frontend/src/dashboard.jsx`, push |
| Update the scanner rules | replace `backend/scanner/chartink_fast.py`, push |
| Change collection times, holidays, retention, Telegram | **Admin** tab — no code change |
| Add a user / change a password | edit `config.ini` on the server — picked up instantly |
| Collect right now | **⟳ Sync now** in the header |
| See what the collector is doing | Admin → Collection history, or `docker compose logs -f worker` |
| Update the server by hand | `cd ~/hyperplane && bash deploy/deploy.sh` |
| Restore a backup | `bash deploy/restore.sh backups/hyperplane_YYYYMMDD_HHMM.dump` |

## Data and backups

- Database: `data/postgres/`   · Excel files and collector work folders: `data/files/`   · HTTPS certificates: `data/caddy/`
- A full database dump is written to `backups/` every night at 02:30 and kept 14 days (`BACKUP_KEEP_DAYS` in `.env`).
  Copy that folder somewhere else now and then (e.g. to your computer with `scp`).
- Each collection takes about 2 MB, so two a day is under 1.5 GB per year. Set *Keep collections for N days* in Admin if you want a limit.

## Resource use on the Ampere server

PostgreSQL is limited to 512 MB (it normally uses about 100 MB), the API 512 MB, the website 128 MB, and the collector 2 GB while Chromium runs.
The containers run alongside your existing cron jobs without touching them.
