"""Finance4Life — dev entry point.

Run the API with:
    python main.py
or the production-style command:
    uvicorn app.main:app --reload
"""

import uvicorn


def main() -> None:
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
