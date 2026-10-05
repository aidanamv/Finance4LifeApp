import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


def _resolve_sqlite_url(url: str) -> str:
    """Ensure the parent directory for a file-based SQLite DB exists.

    On some hosts (e.g. Render's free plan, which has no persistent disk) the
    configured path such as ``/var/data/finance4life.db`` may not exist or be
    writable. We try to create the directory; if that fails we fall back to a
    writable location so the app can still boot.
    """
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return url

    # Strip the scheme; an extra leading slash means an absolute path.
    raw_path = url[len(prefix):]
    if not raw_path or raw_path == ":memory:":
        return url

    db_path = Path("/" + raw_path.lstrip("/")) if raw_path.startswith("/") else Path(raw_path)
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # Verify we can actually write there.
        if not os.access(db_path.parent, os.W_OK):
            raise PermissionError(db_path.parent)
        return url
    except (OSError, PermissionError):
        fallback = Path("/tmp/finance4life.db")
        return f"sqlite:///{fallback}"


_database_url = _resolve_sqlite_url(settings.database_url)
connect_args = {"check_same_thread": False} if _database_url.startswith("sqlite") else {}
engine = create_engine(_database_url, connect_args=connect_args)
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

