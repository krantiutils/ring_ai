from fastapi import APIRouter

from app.api.v1.endpoints import analytics, campaigns, forms, templates, text, voice

api_v1_router = APIRouter()

api_v1_router.include_router(voice.router, prefix="/voice", tags=["voice"])
api_v1_router.include_router(text.router, prefix="/text", tags=["text"])
api_v1_router.include_router(forms.router, prefix="/forms", tags=["forms"])
api_v1_router.include_router(campaigns.router, prefix="/campaigns", tags=["campaigns"])
api_v1_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_v1_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
