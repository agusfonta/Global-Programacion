import os

from dotenv import load_dotenv

load_dotenv()


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "Falta la variable de entorno DATABASE_URL. "
            "Copiá env.example como .env y completá el valor."
        )
    return url


DATABASE_URL = get_database_url()
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() in ("1", "true", "yes")
