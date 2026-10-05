from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.database import SessionLocal, get_db, init_db
from app.market import seed_assets, step_market
from app.security import hash_password, verify_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_assets(db)
    except Exception as exc:  # pragma: no cover - don't let seeding crash boot
        import logging

        logging.getLogger("uvicorn.error").warning("seed_assets failed: %s", exc)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# Allow the (future) React dev server to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _credit(db: Session, child: models.ChildProfile, amount: int, reason: str) -> None:
    wallet = child.wallet
    wallet.coins += amount
    db.add(models.WalletTransaction(wallet_id=wallet.id, amount=amount, reason=reason))


def _get_child(db: Session, child_id: int) -> models.ChildProfile:
    child = db.get(models.ChildProfile, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")
    return child


# Each level needs this many XP. XP is derived from total coins ever earned.
_XP_PER_LEVEL = 500


def _compute_stats(db: Session, child: models.ChildProfile) -> dict:
    """Derive gamification stats (XP, level, streak) from real progress."""
    wallet = child.wallet
    earned = 0
    if wallet:
        earned = (
            db.query(models.WalletTransaction)
            .filter(
                models.WalletTransaction.wallet_id == wallet.id,
                models.WalletTransaction.amount > 0,
            )
            .with_entities(models.WalletTransaction.amount)
            .all()
        )
        earned = sum(a for (a,) in earned)
    xp = int(earned)
    level = 1 + xp // _XP_PER_LEVEL
    lessons_completed = (
        db.query(models.Progress)
        .filter(models.Progress.child_id == child.id, models.Progress.completed.is_(True))
        .count()
    )
    return {
        "coins": wallet.coins if wallet else 0,
        "xp": xp,
        "level": level,
        "xp_into_level": xp % _XP_PER_LEVEL,
        "xp_for_level": _XP_PER_LEVEL,
        "streak": child.streak_count or 0,
        "lessons_completed": lessons_completed,
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name, "locale": settings.default_locale}


# ---------------------------------------------------------------------------
# Accounts & profiles
# ---------------------------------------------------------------------------
@app.post("/parents", status_code=201)
def create_parent(payload: schemas.ParentCreate, db: Session = Depends(get_db)) -> dict:
    if db.query(models.ParentAccount).filter_by(email=payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    parent = models.ParentAccount(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        locale=payload.locale,
    )
    db.add(parent)
    db.commit()
    db.refresh(parent)
    return {"id": parent.id, "email": parent.email}


@app.post("/parents/login", response_model=schemas.ParentLoginOut)
def login_parent(payload: schemas.ParentLogin, db: Session = Depends(get_db)):
    """Log an existing parent in and return their child profiles."""
    parent = db.query(models.ParentAccount).filter_by(email=payload.email).first()
    if not parent or not verify_password(payload.password, parent.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "id": parent.id,
        "email": parent.email,
        "consent_given": parent.consent_given,
        "children": parent.children,
    }


@app.post("/parents/{parent_id}/consent")
def give_consent(parent_id: int, db: Session = Depends(get_db)) -> dict:
    """Record verifiable parental consent (GDPR-K / Swiss FADP)."""
    from datetime import datetime, timezone

    parent = db.get(models.ParentAccount, parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")
    parent.consent_given = True
    parent.consent_at = datetime.now(timezone.utc)
    db.commit()
    return {"consent_given": True}


@app.post("/parents/{parent_id}/children", response_model=schemas.ChildOut, status_code=201)
def create_child(
    parent_id: int, payload: schemas.ChildCreate, db: Session = Depends(get_db)
) -> models.ChildProfile:
    parent = db.get(models.ParentAccount, parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")
    if not parent.consent_given:
        raise HTTPException(status_code=403, detail="Parental consent required before creating a child profile")

    child = models.ChildProfile(
        parent_id=parent_id,
        display_name=payload.display_name,
        age_band=payload.age_band,
        avatar=payload.avatar,
        locale=payload.locale,
    )
    db.add(child)
    db.flush()
    # Give every child a wallet and a pretend-money portfolio.
    db.add(models.Wallet(child_id=child.id, coins=0))
    db.add(models.Portfolio(child_id=child.id, cash=settings.starting_pretend_balance))
    db.commit()
    db.refresh(child)
    return child


# ---------------------------------------------------------------------------
# User settings (persisted per child)
# ---------------------------------------------------------------------------
@app.get("/children/{child_id}/settings", response_model=schemas.ChildSettingsOut)
def get_settings(child_id: int, db: Session = Depends(get_db)):
    return _get_child(db, child_id)


@app.put("/children/{child_id}/settings", response_model=schemas.ChildSettingsOut)
def update_settings(
    child_id: int, payload: schemas.ChildSettingsUpdate, db: Session = Depends(get_db)
):
    child = _get_child(db, child_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(child, field, value)
    db.commit()
    db.refresh(child)
    return child


# ---------------------------------------------------------------------------
# Gamification stats (streak / XP / level)
# ---------------------------------------------------------------------------
@app.get("/children/{child_id}/stats", response_model=schemas.ChildStatsOut)
def get_stats(child_id: int, db: Session = Depends(get_db)):
    return _compute_stats(db, _get_child(db, child_id))


@app.post("/children/{child_id}/activity", response_model=schemas.ChildStatsOut)
def register_activity(child_id: int, db: Session = Depends(get_db)):
    """Record daily activity and update the consecutive-day streak."""
    from datetime import date, timedelta

    child = _get_child(db, child_id)
    today = date.today()
    last = child.last_active
    if last == today:
        pass  # already counted today
    elif last == today - timedelta(days=1):
        child.streak_count = (child.streak_count or 0) + 1
    else:
        child.streak_count = 1
    child.last_active = today
    db.commit()
    db.refresh(child)
    return _compute_stats(db, child)


# ---------------------------------------------------------------------------
# Lessons
# ---------------------------------------------------------------------------
@app.get("/lessons", response_model=list[schemas.LessonSummary])
def list_lessons(locale: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Lesson).order_by(models.Lesson.order_index)
    if locale:
        query = query.filter_by(locale=locale)
    return query.all()


@app.get("/lessons/{lesson_id}", response_model=schemas.LessonOut)
def get_lesson(lesson_id: int, db: Session = Depends(get_db)):
    lesson = db.get(models.Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return _serialize_lesson(lesson)


def _serialize_lesson(lesson: models.Lesson) -> dict:
    """Build a LessonOut-compatible dict with per-slide quizzes (options as
    a list, correct answers withheld from the client)."""
    return {
        "id": lesson.id,
        "title": lesson.title,
        "description": lesson.description,
        "age_band": lesson.age_band,
        "locale": lesson.locale,
        "slides": [
            {
                "id": s.id,
                "order_index": s.order_index,
                "title": s.title,
                "body": s.body,
                "image_path": s.image_path,
                "notes": s.notes,
                "quiz": [
                    {
                        "id": q.id,
                        "prompt": q.prompt,
                        "options": q.options_list,
                        "slide_id": q.slide_id,
                    }
                    for q in s.quiz
                ],
            }
            for s in lesson.slides
        ],
    }


def _lesson_progress(db: Session, child_id: int, lesson: models.Lesson) -> dict:
    """Compute quiz-based progress for a single lesson."""
    quiz_slide_ids = [s.id for s in lesson.slides if s.quiz]
    total = len(quiz_slide_ids)
    passed = 0
    if total:
        passed = (
            db.query(models.SlideQuizResult)
            .filter(
                models.SlideQuizResult.child_id == child_id,
                models.SlideQuizResult.slide_id.in_(quiz_slide_ids),
                models.SlideQuizResult.passed.is_(True),
            )
            .count()
        )
    progress = (
        db.query(models.Progress)
        .filter_by(child_id=child_id, lesson_id=lesson.id)
        .first()
    )
    percent = int(round((passed / total) * 100)) if total else (100 if progress and progress.completed else 0)
    completed = bool(progress and progress.completed) or (total > 0 and passed == total)
    return {
        "lesson_id": lesson.id,
        "completed": completed,
        "quiz_score": progress.quiz_score if progress else 0,
        "slides_total": total,
        "slides_passed": passed,
        "percent": percent,
    }


@app.get("/children/{child_id}/progress", response_model=list[schemas.ProgressOut])
def list_progress(child_id: int, db: Session = Depends(get_db)):
    _get_child(db, child_id)
    lessons = db.query(models.Lesson).order_by(models.Lesson.order_index).all()
    return [_lesson_progress(db, child_id, lesson) for lesson in lessons]


@app.post("/lessons/{lesson_id}/complete")
def complete_lesson(lesson_id: int, child_id: int, db: Session = Depends(get_db)) -> dict:
    child = _get_child(db, child_id)
    lesson = db.get(models.Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    progress = (
        db.query(models.Progress).filter_by(child_id=child_id, lesson_id=lesson_id).first()
    )
    if progress and progress.completed:
        return {"coins_awarded": 0, "coins": child.wallet.coins, "message": "Already completed"}

    if not progress:
        progress = models.Progress(child_id=child_id, lesson_id=lesson_id)
        db.add(progress)
    progress.completed = True
    _credit(db, child, settings.coins_per_lesson, f"Completed lesson {lesson_id}")
    db.commit()
    return {"coins_awarded": settings.coins_per_lesson, "coins": child.wallet.coins}


@app.post("/slides/{slide_id}/quiz", response_model=schemas.SlideQuizResultOut)
def submit_slide_quiz(
    slide_id: int, payload: schemas.QuizSubmission, db: Session = Depends(get_db)
):
    child = _get_child(db, payload.child_id)
    slide = db.get(models.Slide, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    questions = {q.id: q for q in slide.quiz}
    if not questions:
        raise HTTPException(status_code=404, detail="No quiz for this slide")

    correct = 0
    results = []
    for ans in payload.answers:
        q = questions.get(ans.question_id)
        if not q:
            continue
        is_correct = ans.selected_index == q.correct_index
        correct += int(is_correct)
        results.append(
            {
                "question_id": q.id,
                "correct": is_correct,
                "correct_index": q.correct_index,
                "explanation": q.explanation,
            }
        )

    total = len(questions)
    passed = correct == total  # must answer every question correctly to pass

    result = (
        db.query(models.SlideQuizResult)
        .filter_by(child_id=child.id, slide_id=slide_id)
        .first()
    )
    already_passed = bool(result and result.passed)
    if not result:
        result = models.SlideQuizResult(child_id=child.id, slide_id=slide_id, passed=False, best_score=0)
        db.add(result)
    result.best_score = max(result.best_score or 0, correct)
    if passed:
        result.passed = True

    newly_passed = passed and not already_passed
    coins = total * settings.coins_per_quiz_correct if newly_passed else 0
    if coins:
        _credit(db, child, coins, f"Passed slide {slide_id} quiz")

    # If every quiz in the lesson is now passed, mark the lesson complete.
    lesson = slide.lesson
    lesson_prog = _lesson_progress(db, child.id, lesson)
    lesson_completed = False
    if lesson_prog["slides_total"] > 0 and lesson_prog["slides_passed"] == lesson_prog["slides_total"]:
        progress = (
            db.query(models.Progress)
            .filter_by(child_id=child.id, lesson_id=lesson.id)
            .first()
        )
        if not progress:
            progress = models.Progress(child_id=child.id, lesson_id=lesson.id)
            db.add(progress)
        if not progress.completed:
            progress.completed = True
            _credit(db, child, settings.coins_per_lesson, f"Completed lesson {lesson.id}")
        lesson_completed = True

    db.commit()
    return {
        "correct": correct,
        "total": total,
        "passed": passed,
        "newly_passed": newly_passed,
        "coins_awarded": coins,
        "coins": child.wallet.coins,
        "lesson_completed": lesson_completed,
        "results": results,
    }


@app.post("/lessons/{lesson_id}/quiz")
def submit_quiz(
    lesson_id: int, payload: schemas.QuizSubmission, db: Session = Depends(get_db)
) -> dict:
    child = _get_child(db, payload.child_id)
    questions = {q.id: q for q in db.query(models.QuizQuestion).filter_by(lesson_id=lesson_id)}
    if not questions:
        raise HTTPException(status_code=404, detail="No quiz for this lesson")

    correct = 0
    results = []
    for ans in payload.answers:
        q = questions.get(ans.question_id)
        if not q:
            continue
        is_correct = ans.selected_index == q.correct_index
        correct += int(is_correct)
        results.append(
            {"question_id": q.id, "correct": is_correct, "explanation": q.explanation}
        )

    coins = correct * settings.coins_per_quiz_correct
    _credit(db, child, coins, f"Quiz lesson {lesson_id}: {correct} correct")

    progress = (
        db.query(models.Progress).filter_by(child_id=child.id, lesson_id=lesson_id).first()
    )
    if not progress:
        progress = models.Progress(child_id=child.id, lesson_id=lesson_id)
        db.add(progress)
    progress.quiz_score = max(progress.quiz_score, correct)
    db.commit()
    return {"correct": correct, "coins_awarded": coins, "coins": child.wallet.coins, "results": results}


# ---------------------------------------------------------------------------
# Wallet & savings goals
# ---------------------------------------------------------------------------
@app.get("/children/{child_id}/wallet", response_model=schemas.WalletOut)
def get_wallet(child_id: int, db: Session = Depends(get_db)):
    return _get_child(db, child_id).wallet


@app.post("/children/{child_id}/goals", response_model=schemas.SavingsGoalOut, status_code=201)
def create_goal(
    child_id: int, payload: schemas.SavingsGoalCreate, db: Session = Depends(get_db)
):
    child = _get_child(db, child_id)
    goal = models.SavingsGoal(
        child_id=child.id, name=payload.name, target_amount=payload.target_amount
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@app.get("/children/{child_id}/goals", response_model=list[schemas.SavingsGoalOut])
def list_goals(child_id: int, db: Session = Depends(get_db)):
    return _get_child(db, child_id).goals


@app.post("/goals/{goal_id}/deposit", response_model=schemas.SavingsGoalOut)
def deposit_to_goal(
    goal_id: int, payload: schemas.DepositRequest, db: Session = Depends(get_db)
):
    goal = db.get(models.SavingsGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    child = goal.child
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if child.wallet.coins < payload.amount:
        raise HTTPException(status_code=400, detail="Not enough coins")

    _credit(db, child, -payload.amount, f"Saved into goal {goal_id}")
    goal.saved_amount += payload.amount
    if goal.saved_amount >= goal.target_amount:
        goal.achieved = True
    db.commit()
    db.refresh(goal)
    return goal


@app.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(models.SavingsGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()


# ---------------------------------------------------------------------------
# Investing sandbox (pretend money only)
# ---------------------------------------------------------------------------
@app.get("/market/assets", response_model=list[schemas.AssetOut])
def list_assets(db: Session = Depends(get_db)):
    return db.query(models.Asset).all()


@app.post("/market/tick")
def advance_market(db: Session = Depends(get_db)) -> dict:
    """Advance the simulated market one step (e.g. a 'day')."""
    assets = step_market(db)
    return {"prices": {a.symbol: a.current_price for a in assets}}


@app.get("/market/assets/{asset_id}/history")
def asset_history(asset_id: int, limit: int = 60, db: Session = Depends(get_db)) -> dict:
    """Return the recent simulated price history for one asset (oldest→newest)."""
    asset = db.get(models.Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    rows = (
        db.query(models.PriceHistory)
        .filter_by(asset_id=asset_id)
        .order_by(models.PriceHistory.tick.desc())
        .limit(limit)
        .all()
    )
    rows = list(reversed(rows))
    return {
        "symbol": asset.symbol,
        "prices": [r.price for r in rows],
        "ticks": [r.tick for r in rows],
    }


@app.get("/children/{child_id}/portfolio", response_model=schemas.PortfolioOut)
def get_portfolio(child_id: int, db: Session = Depends(get_db)):
    child = _get_child(db, child_id)
    portfolio = child.portfolio
    holdings_value = sum(h.shares * h.asset.current_price for h in portfolio.holdings)
    return schemas.PortfolioOut(
        cash=round(portfolio.cash, 2),
        holdings=[
            schemas.HoldingOut(asset_id=h.asset_id, shares=h.shares, avg_cost=h.avg_cost)
            for h in portfolio.holdings
        ],
        total_value=round(portfolio.cash + holdings_value, 2),
    )


@app.post("/market/buy", response_model=schemas.PortfolioOut)
def buy(payload: schemas.TradeRequest, db: Session = Depends(get_db)):
    child = _get_child(db, payload.child_id)
    asset = db.get(models.Asset, payload.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if payload.shares <= 0:
        raise HTTPException(status_code=400, detail="Shares must be positive")

    portfolio = child.portfolio
    cost = payload.shares * asset.current_price
    if cost > portfolio.cash:
        raise HTTPException(status_code=400, detail="Not enough pretend cash")

    holding = next((h for h in portfolio.holdings if h.asset_id == asset.id), None)
    if holding is None:
        holding = models.Holding(portfolio_id=portfolio.id, asset_id=asset.id, shares=0, avg_cost=0)
        db.add(holding)
        portfolio.holdings.append(holding)

    total_shares = holding.shares + payload.shares
    holding.avg_cost = (holding.avg_cost * holding.shares + cost) / total_shares
    holding.shares = total_shares
    portfolio.cash -= cost
    db.commit()
    return get_portfolio(payload.child_id, db)


@app.post("/market/sell", response_model=schemas.PortfolioOut)
def sell(payload: schemas.TradeRequest, db: Session = Depends(get_db)):
    child = _get_child(db, payload.child_id)
    asset = db.get(models.Asset, payload.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    portfolio = child.portfolio
    holding = next((h for h in portfolio.holdings if h.asset_id == asset.id), None)
    if holding is None or holding.shares < payload.shares or payload.shares <= 0:
        raise HTTPException(status_code=400, detail="Not enough shares to sell")

    proceeds = payload.shares * asset.current_price
    holding.shares -= payload.shares
    portfolio.cash += proceeds
    if holding.shares == 0:
        db.delete(holding)
    db.commit()
    return get_portfolio(payload.child_id, db)


# ---------------------------------------------------------------------------
# Demo helpers (UI convenience only — not for production)
# ---------------------------------------------------------------------------
@app.post("/demo/grant")
def demo_grant(child_id: int, amount: int = 100, db: Session = Depends(get_db)) -> dict:
    """Grant coins to a demo child so the UI flows (deposits, etc.) work."""
    child = _get_child(db, child_id)
    _credit(db, child, amount, "Demo grant")
    db.commit()
    return {"coins": child.wallet.coins}


# ---------------------------------------------------------------------------
# Static serving: the Stitch UI (same-origin) + imported slide images
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).resolve().parent.parent
_STATIC_DIR = _ROOT / "static"
_UI_DIR = _ROOT / "ui"
os.makedirs(_STATIC_DIR / "slides", exist_ok=True)

app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")
if _UI_DIR.is_dir():
    app.mount("/ui", StaticFiles(directory=str(_UI_DIR), html=True), name="ui")


@app.get("/")
def root() -> RedirectResponse:
    """Send visitors straight to the web UI."""
    return RedirectResponse(url="/ui/")


