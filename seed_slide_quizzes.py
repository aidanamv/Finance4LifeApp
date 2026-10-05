"""Seed per-slide quiz questions and migrate the quiz schema.

Slides imported from the PDF decks are images, so this script attaches a
small set of hand-written multiple-choice checkpoints to specific slides
(by their 0-based ``order_index`` within a lesson). Passing a slide's quiz
is what drives lesson progress in the UI.

It is idempotent: re-running replaces the previously seeded per-slide
questions. It also performs a lightweight SQLite migration (adds the
``quiz_questions.slide_id`` column and creates ``slide_quiz_results``).

Usage (PowerShell):
    python seed_slide_quizzes.py
"""

from __future__ import annotations

from sqlalchemy import text

from app.database import SessionLocal, engine, init_db
from app.models import Lesson, QuizQuestion, Slide

# Lesson title -> { slide order_index: [ question, ... ] }
# Each question: (prompt, [options], correct_index, explanation)
QUIZZES: dict[str, dict[int, list[tuple[str, list[str], int, str]]]] = {
    "Introduction to Personal Finance": {
        1: [
            (
                "What is the main purpose of personal finance?",
                [
                    "To spend all your money quickly",
                    "To manage your money so it works for your goals",
                    "To avoid ever using money",
                    "To lend money to friends",
                ],
                1,
                "Personal finance is about managing income, spending and saving to reach your goals.",
            ),
        ],
        3: [
            (
                "Which of these is a 'need' rather than a 'want'?",
                ["Concert tickets", "A new video game", "Food and housing", "Designer sneakers"],
                2,
                "Needs are essentials like food and shelter; wants are nice-to-haves.",
            ),
        ],
        5: [
            (
                "Why is it smart to start saving early?",
                [
                    "Money loses value in a jar",
                    "Time lets savings and interest grow (compounding)",
                    "Banks give prizes to kids",
                    "There is no benefit",
                ],
                1,
                "Starting early gives compound interest many years to multiply your money.",
            ),
        ],
    },
    "Budgeting: Income (Part 1)": {
        1: [
            (
                "What is 'income'?",
                [
                    "Money you spend",
                    "Money you receive, e.g. from a job or allowance",
                    "Money you owe",
                    "A type of tax",
                ],
                1,
                "Income is the money coming in — wages, allowance, gifts, etc.",
            ),
        ],
        3: [
            (
                "Which is an example of regular income?",
                ["A birthday gift", "Finding a coin", "A monthly salary", "Winning a raffle"],
                2,
                "A salary arrives regularly; gifts and winnings are one-off.",
            ),
        ],
    },
    "Budgeting: Expenses (Part 1)": {
        1: [
            (
                "What is an 'expense'?",
                ["Money you earn", "Money you spend", "Money you save", "Money you invest"],
                1,
                "An expense is money going out to pay for things.",
            ),
        ],
        3: [
            (
                "Which is a 'fixed' expense?",
                [
                    "A monthly phone subscription",
                    "An ice cream on a hot day",
                    "A spontaneous movie ticket",
                    "A gift you chose to buy",
                ],
                0,
                "Fixed expenses stay roughly the same each month; variable ones change.",
            ),
        ],
    },
}


def _migrate() -> None:
    """Create new tables and add quiz_questions.slide_id if missing."""
    init_db()  # creates slide_quiz_results and any new tables
    with engine.begin() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(quiz_questions)"))]
        if "slide_id" not in cols:
            conn.execute(text("ALTER TABLE quiz_questions ADD COLUMN slide_id INTEGER"))
            print("[migrate] added quiz_questions.slide_id column")


def main() -> None:
    _migrate()
    db = SessionLocal()
    try:
        for title, slide_map in QUIZZES.items():
            lesson = db.query(Lesson).filter(Lesson.title == title).first()
            if not lesson:
                print(f"[skip] lesson not found: {title}")
                continue

            # Idempotent: drop previously seeded per-slide questions for this lesson.
            removed = (
                db.query(QuizQuestion)
                .filter(QuizQuestion.lesson_id == lesson.id, QuizQuestion.slide_id.isnot(None))
                .delete(synchronize_session=False)
            )
            if removed:
                print(f"[replace] removed {removed} old per-slide question(s) from '{title}'")

            slides_by_index = {s.order_index: s for s in lesson.slides}
            added = 0
            for order_index, questions in slide_map.items():
                slide = slides_by_index.get(order_index)
                if not slide:
                    print(f"[skip] '{title}' has no slide at index {order_index}")
                    continue
                for prompt, options, correct_index, explanation in questions:
                    db.add(
                        QuizQuestion(
                            lesson_id=lesson.id,
                            slide_id=slide.id,
                            prompt=prompt,
                            options="\n".join(options),
                            correct_index=correct_index,
                            explanation=explanation,
                        )
                    )
                    added += 1
            db.commit()
            print(f"[ok] seeded {added} per-slide question(s) for '{title}'")
    finally:
        db.close()


if __name__ == "__main__":
    main()

