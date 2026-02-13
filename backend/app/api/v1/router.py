from fastapi import APIRouter

from app.api.v1.endpoints import (
    agent_call,
    analytics,
    auth,
    campaigns,
    contacts,
    credits,
    forms,
    gateway,
    inbound,
    knowledge_bases,
    kyc,
    notifications,
    otp,
    phone_numbers,
    roi,
    templates,
    text,
    tts,
    voice,
    voice_models,
)

api_v1_router = APIRouter()

api_v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_v1_router.include_router(kyc.router, prefix="/auth", tags=["kyc"])
api_v1_router.include_router(kyc.admin_router, prefix="/admin", tags=["admin"])
api_v1_router.include_router(voice.router, prefix="/voice", tags=["voice"])
api_v1_router.include_router(agent_call.router, prefix="/voice", tags=["agent-call"])
api_v1_router.include_router(voice_models.router, prefix="/voice-models", tags=["voice-models"])
api_v1_router.include_router(text.router, prefix="/text", tags=["text"])
api_v1_router.include_router(forms.router, prefix="/forms", tags=["forms"])
api_v1_router.include_router(campaigns.router, prefix="/campaigns", tags=["campaigns"])
api_v1_router.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
api_v1_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_v1_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_v1_router.include_router(tts.router, prefix="/tts", tags=["tts"])
api_v1_router.include_router(otp.router, prefix="/otp", tags=["otp"])
api_v1_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_v1_router.include_router(phone_numbers.router, prefix="/phone-numbers", tags=["phone-numbers"])
api_v1_router.include_router(credits.router, prefix="/credits", tags=["credits"])
api_v1_router.include_router(roi.router, prefix="/roi", tags=["roi"])
api_v1_router.include_router(gateway.router, prefix="/gateway", tags=["gateway"])
api_v1_router.include_router(inbound.router, prefix="/inbound", tags=["inbound"])
api_v1_router.include_router(knowledge_bases.router, prefix="/knowledge-bases", tags=["knowledge-bases"])
