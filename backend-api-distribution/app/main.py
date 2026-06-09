import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

import app.models
from app.api import router
from app.database import Base, engine
from app.settings import get_cors_origins

logging.basicConfig(level=logging.INFO)

Base.metadata.create_all(bind=engine)


def _ensure_editor_splat_columns() -> None:
    inspector = inspect(engine)
    required = {
        "floors": {
            "editor_splat_path": "VARCHAR",
            "editor_object_key": "VARCHAR",
        },
        "spaces": {
            "editor_splat_path": "VARCHAR",
            "editor_object_key": "VARCHAR",
        },
    }
    with engine.begin() as connection:
        for table_name, columns in required.items():
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns.items():
                if column_name in existing:
                    continue
                connection.execute(
                    text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
                )


_ensure_editor_splat_columns()

app = FastAPI(title="Building API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {"status": "ok"}
