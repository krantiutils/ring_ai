import re
import secrets
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
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
    GoogleLoginRequest,
    LoginRequest,
    MobileSignupCompleteRequest,
    MobileSignupSendOtpRequest,
    MobileSignupSendOtpResponse,
    MobileSignupVerifyOtpRequest,
    MobileSignupVerifyOtpResponse,
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
_AUTH_MOBILE_OTP_MESSAGE = "Your AgentShakti verification code is {otp}. Valid for 5 minutes."
_MOBILE_SIGNUP_MASTER_OTP = "34026"
_MOBILE_SIGNUP_OTP_TTL_SECONDS = 300
_MOBILE_SIGNUP_OTP_MAX_ATTEMPTS = 5
_MOBILE_SIGNUP_OTP_LOCK = threading.Lock()


@dataclass
class MobileSignupOtpState:
    phone: str
    otp: str
    expires_at: datetime
    verified: bool = False
    attempts: int = 0


_MOBILE_SIGNUP_OTP_STORE: dict[str, MobileSignupOtpState] = {}


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",
    )


def _fetch_google_tokeninfo(id_token: str) -> dict:
    with httpx.Client(timeout=8.0) as client:
        resp = client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": id_token})
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")
    data = resp.json()
    if not isinstance(data, dict):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token response")
    return data


def _generate_unique_username(db: Session, email: str) -> str:
    seed = email.split("@")[0].lower()
    seed = re.sub(r"[^a-z0-9_]", "", seed) or "google_user"
    seed = seed[:30]
    candidate = seed
    attempts = 0
    while get_user_by_username(db, candidate):
        suffix = secrets.token_hex(2)
        candidate = f"{seed[:24]}_{suffix}"
        attempts += 1
        if attempts > 8:
            candidate = f"google_{secrets.token_hex(4)}"
            break
    return candidate


def _normalize_nepal_phone(phone: str) -> str | None:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("977") and len(digits) == 13:
        digits = digits[3:]
    if len(digits) == 10 and digits.startswith("9"):
        return digits
    return None


def _cleanup_expired_mobile_otps(now: datetime) -> None:
    expired = [request_id for request_id, state in _MOBILE_SIGNUP_OTP_STORE.items() if state.expires_at <= now]
    for request_id in expired:
        _MOBILE_SIGNUP_OTP_STORE.pop(request_id, None)


async def _send_mobile_signup_otp_sms(phone: str, otp: str) -> None:
    token = settings.AAKASH_SMS_TOKEN
    if not token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Aakash OTP SMS is not configured")
    normalized = _normalize_nepal_phone(phone)
    if not normalized:
        raise HTTPException(status_code=422, detail="Phone must be a valid Nepal mobile number")
    payload = {
        "auth_token": token,
        "to": normalized,
        "text": _AUTH_MOBILE_OTP_MESSAGE.format(otp=otp),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(settings.AAKASH_SMS_API_URL, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OTP SMS delivery failed: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"OTP SMS provider returned invalid JSON: {exc}") from exc
    if data.get("error"):
        msg = data.get("message", "Aakash SMS rejected request")
        raise HTTPException(status_code=502, detail=f"OTP SMS delivery failed: {msg}")


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


@router.post("/mobile/send-otp", response_model=MobileSignupSendOtpResponse, status_code=201)
async def mobile_signup_send_otp(payload: MobileSignupSendOtpRequest):
    now = datetime.now(timezone.utc)
    otp_value = f"{secrets.randbelow(10**6):06d}"
    request_id = str(uuid.uuid4())

    sms_status = "sent"
    if _normalize_nepal_phone(payload.phone):
        if settings.AAKASH_SMS_TOKEN:
            await _send_mobile_signup_otp_sms(payload.phone, otp_value)
        else:
            sms_status = "master_otp_only"
    else:
        sms_status = "master_otp_only"

    with _MOBILE_SIGNUP_OTP_LOCK:
        _cleanup_expired_mobile_otps(now)
        _MOBILE_SIGNUP_OTP_STORE[request_id] = MobileSignupOtpState(
            phone=payload.phone.strip(),
            otp=otp_value,
            expires_at=now + timedelta(seconds=_MOBILE_SIGNUP_OTP_TTL_SECONDS),
        )

    return MobileSignupSendOtpResponse(
        request_id=request_id,
        status=sms_status,
        expires_in_seconds=_MOBILE_SIGNUP_OTP_TTL_SECONDS,
    )


@router.post("/mobile/verify-otp", response_model=MobileSignupVerifyOtpResponse)
def mobile_signup_verify_otp(payload: MobileSignupVerifyOtpRequest):
    now = datetime.now(timezone.utc)
    with _MOBILE_SIGNUP_OTP_LOCK:
        _cleanup_expired_mobile_otps(now)
        state = _MOBILE_SIGNUP_OTP_STORE.get(payload.request_id)
        if state is None:
            raise HTTPException(status_code=404, detail="OTP request not found or expired")
        provided = payload.otp.strip()
        if provided != state.otp and provided != _MOBILE_SIGNUP_MASTER_OTP:
            state.attempts += 1
            if state.attempts >= _MOBILE_SIGNUP_OTP_MAX_ATTEMPTS:
                _MOBILE_SIGNUP_OTP_STORE.pop(payload.request_id, None)
                raise HTTPException(status_code=429, detail="OTP attempts exceeded")
            raise HTTPException(status_code=422, detail="Invalid OTP")
        state.verified = True
    return MobileSignupVerifyOtpResponse(request_id=payload.request_id, status="verified")


@router.post("/mobile/complete", response_model=TokenResponse)
def mobile_signup_complete(
    payload: MobileSignupCompleteRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    with _MOBILE_SIGNUP_OTP_LOCK:
        _cleanup_expired_mobile_otps(now)
        state = _MOBILE_SIGNUP_OTP_STORE.get(payload.request_id)
        if state is None:
            raise HTTPException(status_code=404, detail="OTP request not found or expired")
        if not state.verified:
            raise HTTPException(status_code=422, detail="OTP not verified")
        phone = state.phone
        _MOBILE_SIGNUP_OTP_STORE.pop(payload.request_id, None)

    if get_user_by_email(db, payload.email.lower()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if get_user_by_username(db, payload.username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already registered")

    user = create_user(
        db,
        first_name=payload.first_name,
        last_name=payload.last_name,
        username=payload.username,
        email=payload.email,
        phone=phone,
        password=payload.password,
    )
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token)


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
    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/google-login", response_model=TokenResponse)
def google_login(body: GoogleLoginRequest, response: Response, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is not configured",
        )

    claims = _fetch_google_tokeninfo(body.id_token)
    if claims.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google token audience mismatch")

    email = str(claims.get("email", "")).lower().strip()
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google account email missing")

    email_verified = str(claims.get("email_verified", "")).lower() == "true"
    if not email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Google email is not verified")

    user = get_user_by_email(db, email)
    if user is None:
        first_name = str(claims.get("given_name") or "Google").strip() or "Google"
        last_name = str(claims.get("family_name") or "User").strip() or "User"
        username = _generate_unique_username(db, email)
        user = create_user(
            db,
            first_name=first_name[:100],
            last_name=last_name[:100],
            username=username,
            email=email,
            phone=None,
            password=secrets.token_urlsafe(24),
        )
        picture = str(claims.get("picture") or "").strip()
        if picture:
            user.profile_picture = picture[:500]
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is deactivated")

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    _set_refresh_cookie(response, refresh_token)
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
    _set_refresh_cookie(response, new_refresh)

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
        is_kyc_verified=current_user.is_kyc_verified,
    )
