from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_text_messages():
    return {"message": "SMS/Text endpoints"}
