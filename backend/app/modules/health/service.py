import asyncio

from fastapi import Request

from app.core.database import run_select_one

DB_TIMEOUT_SECONDS = 3


async def check_database(request: Request) -> None:
    await asyncio.wait_for(run_select_one(request.app.state.engine), timeout=DB_TIMEOUT_SECONDS)
