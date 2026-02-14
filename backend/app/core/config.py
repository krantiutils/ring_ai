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

    # Sentiment analysis (OpenAI)
    OPENAI_API_KEY: str = ""
    SENTIMENT_ANALYSIS_ENABLED: bool = True
    SENTIMENT_MODEL: str = "gpt-4o-mini"

    # Intent detection (Gemini)
    INTENT_ANALYSIS_ENABLED: bool = True
    INTENT_MODEL: str = "gemini-2.0-flash"

    # Gemini Interactive Agent
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL_ID: str = "gemini-2.5-flash-native-audio-preview-12-2025"
    GEMINI_SESSION_TIMEOUT_MINUTES: int = 10
    GEMINI_MAX_CONCURRENT_SESSIONS: int = 1000
    GEMINI_DEFAULT_VOICE: str = "Kore"
    GEMINI_SYSTEM_INSTRUCTION: str = (
        "तपाईं Ring AI को सहायक हुनुहुन्छ। "
        "तपाईंले नेपालीमा बोल्नुपर्छ जबसम्म ग्राहकले अर्को भाषामा बोल्दैन। "
        "तपाईं विनम्र, स्पष्ट र सहयोगी हुनुपर्छ। "
        "You are a Ring AI assistant. Speak in Nepali by default unless the caller uses another language. "
        "Be polite, clear, and helpful."
    )

    # Output mode: "native_audio" (Gemini end-to-end) or "hybrid"
    # (Gemini STT+AI, Edge/Azure TTS output). Switch to hybrid if
    # Gemini's Nepali pronunciation quality is insufficient.
    GEMINI_OUTPUT_MODE: str = "native_audio"

    # Hybrid mode TTS settings — only used when GEMINI_OUTPUT_MODE is "hybrid"
    GEMINI_HYBRID_TTS_PROVIDER: str = "edge_tts"
    GEMINI_HYBRID_TTS_VOICE: str = "ne-NP-HemkalaNeural"

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
