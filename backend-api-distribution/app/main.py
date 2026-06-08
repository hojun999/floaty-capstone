import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models
from app.api import router
from app.database import Base, engine
from app.settings import get_cors_origins

logging.basicConfig(level=logging.INFO)

Base.metadata.create_all(bind=engine)

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
