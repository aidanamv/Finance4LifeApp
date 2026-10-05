"""Pretend-market simulation.

A deliberately simplified, *bounded* random-walk with optional scripted
"event cards" to teach cause/effect. Everything uses pretend money only.
"""

from __future__ import annotations

import random

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Asset, PriceHistory


# Kid-friendly fictional assets (never real tickers).
SEED_ASSETS = [
    ("LEMON", "LemonadeCo", "A sunny lemonade-stand company.", 10.0, 0.03),
    ("SPACE", "SpaceToys", "Rockets and toys — exciting but bouncy!", 20.0, 0.06),
    ("GREEN", "GreenFarm", "Steady veggies and fruit — slow and steady.", 15.0, 0.02),
    ("PIXEL", "PixelGames", "A video-game studio, popular with trends.", 25.0, 0.05),
    ("SAVER", "Safe Savings Bond", "Very steady — like a piggy bank that grows.", 100.0, 0.005),
]


def seed_assets(db: Session) -> None:
    """Insert the fictional assets if they don't exist yet."""
    for symbol, name, desc, price, vol in SEED_ASSETS:
        if not db.query(Asset).filter_by(symbol=symbol).first():
            asset = Asset(
                symbol=symbol,
                name=name,
                description=desc,
                current_price=price,
                volatility=vol,
            )
            db.add(asset)
            db.flush()
            db.add(PriceHistory(asset_id=asset.id, price=price, tick=0))
    db.commit()


def step_market(db: Session) -> list[Asset]:
    """Advance the simulated market by one tick.

    Price moves are capped by ``max_daily_price_move_pct`` so a teen can
    never be wiped out and the lesson stays about trends, not gambling.
    """
    assets = db.query(Asset).all()
    cap = settings.max_daily_price_move_pct
    for asset in assets:
        # Gaussian shock scaled by the asset's volatility, then hard-capped.
        move = random.gauss(0, asset.volatility)
        move = max(-cap, min(cap, move))
        new_price = round(max(0.5, asset.current_price * (1 + move)), 2)
        last_tick = (
            db.query(PriceHistory)
            .filter_by(asset_id=asset.id)
            .order_by(PriceHistory.tick.desc())
            .first()
        )
        next_tick = (last_tick.tick + 1) if last_tick else 0
        asset.current_price = new_price
        db.add(PriceHistory(asset_id=asset.id, price=new_price, tick=next_tick))
    db.commit()
    return assets

