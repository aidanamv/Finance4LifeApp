# Finance for Life — Stitch Web UI

The polished, brand-themed web UI generated with Stitch (Material Design color
tokens, Plus Jakarta Sans, Tailwind CDN). Three connected pages with the top-nav
wired between them:

| Page | File | Nav label |
|------|------|-----------|
| Learning Quests (slides + quiz) | `index.html` | Learning Quests |
| Interactive Sims (trading sandbox) | `sims.html` | Interactive Sims |
| Savings Vault (savings goals) | `vault.html` | Savings Vault |

## Run it

These are self-contained static pages (Tailwind + fonts load from CDN), so you
can simply open `index.html` in a browser, or serve the folder:

```powershell
cd ui
# Option A: Python (no install)
python -m http.server 5500
# then open http://localhost:5500

# Option B: Node
npx serve .
```

## Notes

- The top navigation links (`index.html`, `sims.html`, `vault.html`)
  connect the pages. The FFL logo links back to Learning Quests.
- All interactivity (quiz feedback, audio toggle, trade sandbox, market-dip
  simulation, budget 50/30/20 slider, leaderboard tabs, live countdown) is
  handled by the inline scripts on each page.
- Data shown is demo content. To connect it to the FastAPI backend (`app/`),
  replace the hard-coded values and inline handlers with `fetch('/api/...')`
  calls (see `../README.md` for the API surface).

