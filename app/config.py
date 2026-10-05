from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration.

    Defaults are safe for local development. Override via environment
    variables or a .env file in production.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Finance4Life"
    # Switzerland-first launch: default locale German, but app is i18n-ready.
    default_locale: str = "de-CH"
    supported_locales: list[str] = ["de-CH", "fr-CH", "it-CH", "en"]

    # Database
    database_url: str = "sqlite:///./finance4life.db"

    # Auth / security
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24
    algorithm: str = "HS256"

    # Gamification
    coins_per_lesson: int = 50
    coins_per_quiz_correct: int = 10

    # Investing sandbox (pretend money only)
    starting_pretend_balance: int = 1000
    max_daily_price_move_pct: float = 0.08  # bounded volatility for safety


settings = Settings()

