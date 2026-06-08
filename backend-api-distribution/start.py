import uvicorn
from app.settings import get_app_host, get_port


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=get_app_host(), port=get_port())
