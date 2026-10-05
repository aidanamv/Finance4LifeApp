from __future__ import annotations

import enum
from datetime import datetime, timezone
from datetime import date as _date

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgeBand(str, enum.Enum):
    EXPLORERS = "5-7"
    BUILDERS = "8-10"
    INVESTORS = "11-13"
    TEENS = "14-17"


# ---------------------------------------------------------------------------
# Accounts & profiles
# ---------------------------------------------------------------------------
class ParentAccount(Base):
    __tablename__ = "parent_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    # GDPR-K / Swiss FADP: explicit, verifiable parental consent.
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locale: Mapped[str] = mapped_column(String(10), default="de-CH")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    children: Mapped[list[ChildProfile]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )


class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("parent_accounts.id"))
    display_name: Mapped[str] = mapped_column(String(80))
    age_band: Mapped[AgeBand] = mapped_column(Enum(AgeBand), default=AgeBand.TEENS)
    avatar: Mapped[str] = mapped_column(String(120), default="default")
    locale: Mapped[str] = mapped_column(String(10), default="de-CH")
    # Per-user preferences, persisted in the database.
    theme: Mapped[str] = mapped_column(String(20), default="light")
    sound_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Daily-activity streak (consecutive days with activity).
    streak_count: Mapped[int] = mapped_column(Integer, default=0)
    last_active: Mapped[_date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    parent: Mapped[ParentAccount] = relationship(back_populates="children")
    wallet: Mapped[Wallet] = relationship(
        back_populates="child", uselist=False, cascade="all, delete-orphan"
    )
    progress: Mapped[list[Progress]] = relationship(
        back_populates="child", cascade="all, delete-orphan"
    )
    goals: Mapped[list[SavingsGoal]] = relationship(
        back_populates="child", cascade="all, delete-orphan"
    )
    portfolio: Mapped[Portfolio] = relationship(
        back_populates="child", uselist=False, cascade="all, delete-orphan"
    )
    badges: Mapped[list[AchievementAward]] = relationship(
        back_populates="child", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Lessons (imported from PPTX) & progress
# ---------------------------------------------------------------------------
class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    age_band: Mapped[AgeBand] = mapped_column(Enum(AgeBand), default=AgeBand.TEENS)
    locale: Mapped[str] = mapped_column(String(10), default="de-CH")
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    source_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    slides: Mapped[list[Slide]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="Slide.order_index"
    )
    quiz: Mapped[list[QuizQuestion]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan"
    )


class Slide(Base):
    __tablename__ = "slides"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    lesson: Mapped[Lesson] = relationship(back_populates="slides")
    quiz: Mapped[list[QuizQuestion]] = relationship(
        back_populates="slide", cascade="all, delete-orphan"
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"))
    # When set, the question belongs to a specific slide (per-slide quiz).
    slide_id: Mapped[int | None] = mapped_column(ForeignKey("slides.id"), nullable=True)
    prompt: Mapped[str] = mapped_column(Text)
    # Options stored as newline-separated text for MVP simplicity.
    options: Mapped[str] = mapped_column(Text, default="")
    correct_index: Mapped[int] = mapped_column(Integer, default=0)
    explanation: Mapped[str] = mapped_column(Text, default="")

    lesson: Mapped[Lesson] = relationship(back_populates="quiz")
    slide: Mapped[Slide | None] = relationship(back_populates="quiz")

    @property
    def options_list(self) -> list[str]:
        return [o for o in self.options.split("\n") if o != ""]


class SlideQuizResult(Base):
    """Tracks whether a child has passed a given slide's quiz."""

    __tablename__ = "slide_quiz_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"))
    slide_id: Mapped[int] = mapped_column(ForeignKey("slides.id"))
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    best_score: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Progress(Base):
    __tablename__ = "progress"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"))
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"))
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    quiz_score: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    child: Mapped[ChildProfile] = relationship(back_populates="progress")


# ---------------------------------------------------------------------------
# Virtual wallet & savings
# ---------------------------------------------------------------------------
class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), unique=True)
    coins: Mapped[int] = mapped_column(Integer, default=0)

    child: Mapped[ChildProfile] = relationship(back_populates="wallet")
    transactions: Mapped[list[WalletTransaction]] = relationship(
        back_populates="wallet", cascade="all, delete-orphan"
    )


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"))
    amount: Mapped[int] = mapped_column(Integer)  # positive = earned, negative = spent
    reason: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    wallet: Mapped[Wallet] = relationship(back_populates="transactions")


class SavingsGoal(Base):
    __tablename__ = "savings_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"))
    name: Mapped[str] = mapped_column(String(120))
    target_amount: Mapped[int] = mapped_column(Integer)
    saved_amount: Mapped[int] = mapped_column(Integer, default=0)
    achieved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    child: Mapped[ChildProfile] = relationship(back_populates="goals")


# ---------------------------------------------------------------------------
# Pretend-market investing sandbox (NO real money)
# ---------------------------------------------------------------------------
class Asset(Base):
    """A fictional, kid-friendly asset. Never a real ticker."""

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(10), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    current_price: Mapped[float] = mapped_column(Float, default=10.0)
    # Higher = bouncier price. Kept bounded for safety.
    volatility: Mapped[float] = mapped_column(Float, default=0.03)

    price_history: Mapped[list[PriceHistory]] = relationship(
        back_populates="asset", cascade="all, delete-orphan"
    )


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    price: Mapped[float] = mapped_column(Float)
    tick: Mapped[int] = mapped_column(Integer, default=0)  # simulated time step
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    asset: Mapped[Asset] = relationship(back_populates="price_history")


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), unique=True)
    cash: Mapped[float] = mapped_column(Float, default=0.0)  # pretend money

    child: Mapped[ChildProfile] = relationship(back_populates="portfolio")
    holdings: Mapped[list[Holding]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"))
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    shares: Mapped[float] = mapped_column(Float, default=0.0)
    avg_cost: Mapped[float] = mapped_column(Float, default=0.0)

    portfolio: Mapped[Portfolio] = relationship(back_populates="holdings")
    asset: Mapped[Asset] = relationship()


# ---------------------------------------------------------------------------
# Badges / achievements
# ---------------------------------------------------------------------------
class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(120), default="star")


class AchievementAward(Base):
    __tablename__ = "achievement_awards"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"))
    badge_id: Mapped[int] = mapped_column(ForeignKey("badges.id"))
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    child: Mapped[ChildProfile] = relationship(back_populates="badges")
    badge: Mapped[Badge] = relationship()

