from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. For MVP; use Alembic migrations for production."""
    from app import models  # noqa: F401  (ensure models are registered)

    Base.metadata.create_all(bind=engine)
    _run_lightweight_migrations()


def _run_lightweight_migrations() -> None:
    """Add newly introduced columns to existing tables (SQLite dev MVP).

    This is a stop-gap until proper Alembic migrations are introduced; it lets
    an existing finance4life.db pick up new per-user settings columns without
    being deleted.
    """
    inspector = inspect(engine)
    if "child_profiles" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("child_profiles")}
    additions = {
        "theme": "VARCHAR(20) DEFAULT 'light'",
        "sound_enabled": "BOOLEAN DEFAULT 1",
        "notifications_enabled": "BOOLEAN DEFAULT 1",
        "streak_count": "INTEGER DEFAULT 0",
        "last_active": "DATE",
    }
    with engine.begin() as conn:
        for name, ddl in additions.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE child_profiles ADD COLUMN {name} {ddl}"))

