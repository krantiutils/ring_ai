import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import (
    APIKeyGenerateResponse,
    APIKeyResponse,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserProfileResponse,
)
from app.services.auth import (
    create_access_token,
    create_api_key,
    create_refresh_token,
    create_user,
    decode_token,
    get_active_api_key,
    get_user_by_email,
    get_user_by_id,
    get_user_by_username,
    verify_password,
)

router = APIRouter()


@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if get_user_by_email(db, body.email.lower()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    if get_user_by_username(db, body.username):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )
    user = create_user(
        db,
        first_name=body.first_name,
        last_name=body.last_name,
        username=body.username,
        email=body.email,
        phone=body.phone,
        password=body.password,
    )
    return RegisterResponse(id=user.id, username=user.username, email=user.email)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = get_user_by_email(db, body.email.lower())
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",
    )

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    try:
        payload = decode_token(refresh_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    new_access = create_access_token(user.id)
    new_refresh = create_refresh_token(user.id)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",
    )

    return TokenResponse(access_token=new_access)


@router.post("/api-keys/generate", response_model=APIKeyGenerateResponse)
def generate_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_key = create_api_key(db, current_user.id)
    return APIKeyGenerateResponse(api_key=raw_key)


@router.get("/api-keys", response_model=APIKeyResponse | None)
def get_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    api_key = get_active_api_key(db, current_user.id)
    if api_key is None:
        return None
    return APIKeyResponse(
        key_prefix=api_key.key_prefix,
        last_used=api_key.last_used,
        created_at=api_key.created_at,
    )


@router.get("/user-profile", response_model=UserProfileResponse)
def user_profile(current_user: User = Depends(get_current_user)):
    return UserProfileResponse(
        id=current_user.id,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        username=current_user.username,
        email=current_user.email,
        phone=current_user.phone,
        address=current_user.address,
        profile_picture=current_user.profile_picture,
        is_verified=current_user.is_verified,
    )
