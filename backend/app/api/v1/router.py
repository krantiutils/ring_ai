from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    campaigns,
    forms,
    otp,
    phone_numbers,
    templates,
    text,
    tts,
    voice,
)

api_v1_router = APIRouter()

api_v1_router.include_router(voice.router, prefix="/voice", tags=["voice"])
api_v1_router.include_router(text.router, prefix="/text", tags=["text"])
api_v1_router.include_router(forms.router, prefix="/forms", tags=["forms"])
api_v1_router.include_router(campaigns.router, prefix="/campaigns", tags=["campaigns"])
api_v1_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_v1_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_v1_router.include_router(tts.router, prefix="/tts", tags=["tts"])
api_v1_router.include_router(otp.router, prefix="/otp", tags=["otp"])
api_v1_router.include_router(phone_numbers.router, prefix="/phone-numbers", tags=["phone-numbers"])
