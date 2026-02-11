from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Ring AI"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql://ring_ai:ring_ai@localhost:5432/ring_ai"

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

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

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
