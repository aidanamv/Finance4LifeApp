from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import AgeBand


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth / profiles -------------------------------------------------------
class ParentCreate(BaseModel):
    email: EmailStr
    password: str
    locale: str = "de-CH"


class ParentLogin(BaseModel):
    email: EmailStr
    password: str


class ChildCreate(BaseModel):
    display_name: str
    age_band: AgeBand = AgeBand.TEENS
    avatar: str = "default"
    locale: str = "de-CH"


class ChildOut(ORMModel):
    id: int
    display_name: str
    age_band: AgeBand
    avatar: str


class ParentLoginOut(BaseModel):
    id: int
    email: str
    consent_given: bool
    children: list[ChildOut] = []


# --- User settings (persisted per child) -----------------------------------
class ChildSettingsOut(ORMModel):
    locale: str
    theme: str
    sound_enabled: bool
    notifications_enabled: bool


class ChildSettingsUpdate(BaseModel):
    locale: str | None = None
    theme: str | None = None
    sound_enabled: bool | None = None
    notifications_enabled: bool | None = None


# --- Gamification stats (streak / XP / level) ------------------------------
class ChildStatsOut(BaseModel):
    coins: int
    xp: int
    level: int
    xp_into_level: int
    xp_for_level: int
    streak: int
    lessons_completed: int


# --- Lessons ---------------------------------------------------------------
class QuizQuestionOut(BaseModel):
    id: int
    prompt: str
    options: list[str]
    slide_id: int | None = None


class SlideOut(ORMModel):
    id: int
    order_index: int
    title: str
    body: str
    image_path: str | None
    notes: str
    quiz: list[QuizQuestionOut] = []


class LessonOut(ORMModel):
    id: int
    title: str
    description: str
    age_band: AgeBand
    locale: str
    slides: list[SlideOut]


class LessonSummary(ORMModel):
    id: int
    title: str
    age_band: AgeBand
    locale: str


class ProgressOut(BaseModel):
    lesson_id: int
    completed: bool
    quiz_score: int = 0
    slides_total: int = 0
    slides_passed: int = 0
    percent: int = 0


class QuizAnswer(BaseModel):
    question_id: int
    selected_index: int


class QuizSubmission(BaseModel):
    child_id: int
    answers: list[QuizAnswer]


class SlideQuizResultOut(BaseModel):
    correct: int
    total: int
    passed: bool
    newly_passed: bool
    coins_awarded: int
    coins: int
    lesson_completed: bool
    results: list[dict]


# --- Wallet & savings ------------------------------------------------------
class WalletOut(ORMModel):
    coins: int


class SavingsGoalCreate(BaseModel):
    name: str
    target_amount: int


class SavingsGoalOut(ORMModel):
    id: int
    name: str
    target_amount: int
    saved_amount: int
    achieved: bool


class DepositRequest(BaseModel):
    amount: int


# --- Investing -------------------------------------------------------------
class AssetOut(ORMModel):
    id: int
    symbol: str
    name: str
    description: str
    current_price: float


class TradeRequest(BaseModel):
    child_id: int
    asset_id: int
    shares: float


class HoldingOut(ORMModel):
    asset_id: int
    shares: float
    avg_cost: float


class PortfolioOut(BaseModel):
    cash: float
    holdings: list[HoldingOut]
    total_value: float

