from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_forms():
    return {"message": "Survey/Forms endpoints"}
