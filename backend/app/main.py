import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.services.gateway_bridge.call_manager import CallManager
from app.services.interactive_agent.pool import SessionPool
from app.services.scheduler import scheduler_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start scheduler
    task = asyncio.create_task(scheduler_loop())

    # Initialize Gemini session pool and call manager for gateway bridge
    session_pool = SessionPool(
        api_key=settings.GEMINI_API_KEY,
        max_sessions=settings.GEMINI_MAX_CONCURRENT_SESSIONS,
        default_system_instruction=settings.GEMINI_SYSTEM_INSTRUCTION,
        default_model_id=settings.GEMINI_MODEL_ID,
    )
    call_manager = CallManager(pool=session_pool)

    app.state.session_pool = session_pool
    app.state.call_manager = call_manager

    logger.info(
        "Gateway bridge initialized (max_sessions=%d, model=%s, voice=%s)",
        settings.GEMINI_MAX_CONCURRENT_SESSIONS,
        settings.GEMINI_MODEL_ID,
        settings.GEMINI_DEFAULT_VOICE,
    )

    yield

    # Shutdown: tear down all active calls and sessions
    logger.info("Shutting down gateway bridge...")
    await call_manager.teardown_all()
    await session_pool.teardown_all()

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)


@app.get("/health")
def health_check():
    return {"status": "healthy"}
