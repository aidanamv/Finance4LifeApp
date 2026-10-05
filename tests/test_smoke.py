"""End-to-end smoke test for the core save + invest loop.

Run with:  pytest -s  (or)  python -m tests.test_smoke
"""

import os
import tempfile

# Use an isolated temp database so tests never touch dev data.
os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(tempfile.gettempdir(), 'f4l_test.db')}")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def test_full_flow():
    with TestClient(app) as c:
        assert c.get("/health").json()["status"] == "ok"

        parent = c.post("/parents", json={"email": "mom@example.ch", "password": "pw"})
        # Email may already exist from a previous run; tolerate that.
        if parent.status_code == 201:
            pid = parent.json()["id"]
        else:
            pid = 1

        # Consent is required before a child profile can be created.
        c.post(f"/parents/{pid}/consent")
        child = c.post(f"/parents/{pid}/children", json={"display_name": "Max"})
        assert child.status_code == 201, child.text
        cid = child.json()["id"]

        assets = c.get("/market/assets").json()
        assert len(assets) >= 3

        start = c.get(f"/children/{cid}/portfolio").json()
        assert start["cash"] > 0

        a0 = assets[0]
        bought = c.post("/market/buy", json={"child_id": cid, "asset_id": a0["id"], "shares": 10})
        assert bought.status_code == 200, bought.text
        assert bought.json()["cash"] < start["cash"]

        c.post("/market/tick")
        after = c.get(f"/children/{cid}/portfolio").json()
        assert after["total_value"] > 0

        goal = c.post(f"/children/{cid}/goals", json={"name": "New bike", "target_amount": 100})
        assert goal.status_code == 201, goal.text
        print("\nAll core flows passed ✅", after)


if __name__ == "__main__":
    test_full_flow()

