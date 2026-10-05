# Finance4Life 🪙

A gamified web app that teaches **teens** the basics of finance — **saving** and **investing** — through interactive lessons (imported from your PowerPoint slides) and a **safe, pretend-money investing sandbox**.

> Launch focus: **Switzerland** 🇨🇭 (i18n-ready: DE / FR / IT / EN). Privacy by design — Swiss **FADP** + EU **GDPR-K** parental-consent flow built in. No real money, no ads, no chat.

---

## What's built (MVP backend)

- **Accounts & profiles** — parent accounts with verifiable **consent gate** before any child profile is created.
- **Lessons from PPTX** — import `.pptx` decks into interactive lessons (slides + speaker notes kept for future audio narration).
- **Gamified learning** — earn coins for completing lessons and answering quizzes.
- **Savings goals** — create goal "jars" and deposit coins toward a target.
- **Pretend-market investing sandbox** — buy/sell fictional, kid-friendly assets (LemonadeCo, SpaceToys, …) with **bounded volatility** so teens learn trends, not gambling.
- **Virtual wallet & portfolio** — every child starts with pretend cash; track holdings and total value.

## Tech stack

- **Backend:** FastAPI + SQLAlchemy 2.0 (SQLite for dev, swap to Postgres for prod)
- **Slide import:** `python-pptx`
- **Auth hashing:** `passlib` (pbkdf2_sha256)
- **Frontend:** React + Vite SPA styled with the brand palette (blue `#4294F7`, white, light-blue `#B8D9FA`, yellow `#F5D83C`)

## Run the frontend

```powershell
cd frontend
npm install
npm run dev     # http://localhost:5173  (proxies /api -> http://127.0.0.1:8000)
```

Start the backend (`python main.py`) first, then the frontend. The app has three
tabs — **Learn** (slide player + quizzes), **Save** (goal jars), and **Invest**
(pretend market) — with a live coin wallet in the header.

## Project layout

```
app/
  config.py         # Settings (locales, coin rewards, sandbox volatility caps)
  database.py       # Engine, session, Base, init_db
  models.py         # Parent/Child, Lesson/Slide/Quiz, Wallet, SavingsGoal, Asset/Portfolio, Badges
  schemas.py        # Pydantic request/response models
  security.py       # Password hashing
  market.py         # Pretend-market simulation + seed assets
  pptx_importer.py  # Import .pptx decks as lessons (also a CLI)
  main.py           # FastAPI app + endpoints
tests/
  test_smoke.py     # End-to-end test of the save + invest loop
main.py             # Dev entry point (uvicorn)
requirements.txt
```

## Getting started

```powershell
# 1. Install dependencies
python -m pip install -r requirements.txt

# 2. Run the API (http://127.0.0.1:8000, docs at /docs)
python main.py

# 3. Import a PowerPoint deck as a lesson
python -m app.pptx_importer "path\to\deck.pptx" --title "Saving Basics" --locale de-CH

# 4. Run tests
python -m pytest -s
```

Interactive API docs: **http://127.0.0.1:8000/docs**

## Key API endpoints

| Area | Method & path |
|------|---------------|
| Health | `GET /health` |
| Create parent | `POST /parents` |
| Record consent | `POST /parents/{id}/consent` |
| Create child | `POST /parents/{id}/children` |
| List / get lessons | `GET /lessons`, `GET /lessons/{id}` |
| Complete lesson | `POST /lessons/{id}/complete?child_id=` |
| Submit quiz | `POST /lessons/{id}/quiz` |
| Wallet | `GET /children/{id}/wallet` |
| Savings goals | `POST/GET /children/{id}/goals`, `POST /goals/{id}/deposit` |
| Market assets | `GET /market/assets`, `POST /market/tick` |
| Portfolio & trading | `GET /children/{id}/portfolio`, `POST /market/buy`, `POST /market/sell` |

## Roadmap

- **MVP (done)** — accounts + consent, PPTX lessons, wallet, savings goals, investing sandbox.
- **v1** — React frontend, avatars & cosmetics, badges engine, mini-games, streaks, DE/FR/IT localization.
- **v2** — classroom/teacher mode, leaderboards, parent dashboard & time limits, content authoring tools, Postgres + Alembic migrations.

## Children-safety notes

- Pretend money only — no deposits, withdrawals, or real tickers.
- Price moves are hard-capped (`max_daily_price_move_pct`) for safety.
- Parental consent is enforced server-side before profile creation.
- Keep data collection minimal; add data-deletion & parental dashboard before public launch.

