from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Ring AI"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql://ring_ai:ring_ai@localhost:5432/ring_ai"

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Auth / JWT
    SECRET_KEY: str = "CHANGE-ME-in-production-use-a-real-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # TTS
    AZURE_TTS_KEY: str = ""
    AZURE_TTS_REGION: str = ""

    # Twilio
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    TWILIO_BASE_URL: str = ""  # Publicly reachable URL for Twilio callbacks (e.g. ngrok in dev)

    # SMS
    SMS_PROVIDER_API_KEY: str = ""

    # Campaign executor
    CAMPAIGN_BATCH_SIZE: int = 50
    CAMPAIGN_MAX_RETRIES: int = 3
    CAMPAIGN_RATE_LIMIT_PER_SECOND: float = 10.0

    # Scheduler
    SCHEDULER_POLL_INTERVAL_SECONDS: int = 30

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
