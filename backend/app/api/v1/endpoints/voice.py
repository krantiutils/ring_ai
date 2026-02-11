from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_voice_calls():
    return {"message": "Voice endpoints"}
