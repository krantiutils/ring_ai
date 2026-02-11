from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_templates():
    return {"message": "Template CRUD endpoints"}
