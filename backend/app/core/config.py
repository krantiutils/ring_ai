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
    ELEVENLABS_API_KEY: str = ""

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

    # Campaign retry backoff: delay in minutes for each retry round
    # Index 0 = first retry, index 1 = second retry, etc.
    CAMPAIGN_RETRY_BACKOFF_MINUTES: list[int] = [0, 30, 120]

    # File uploads
    UPLOAD_DIR: str = "uploads"

    # Scheduler
    SCHEDULER_POLL_INTERVAL_SECONDS: int = 30

    # KYC file uploads
    KYC_UPLOAD_DIR: str = "uploads/kyc"
    KYC_MAX_FILE_SIZE_MB: int = 10

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
