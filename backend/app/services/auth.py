import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.models.user_api_key import UserAPIKey

# ---------------------------------------------------------------------------
# Password utilities
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


# ---------------------------------------------------------------------------
# JWT utilities
# ---------------------------------------------------------------------------


def create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises jwt.PyJWTError on failure."""
    return jwt.decode(
        token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
    )


# ---------------------------------------------------------------------------
# API key utilities
# ---------------------------------------------------------------------------


def generate_api_key() -> tuple[str, str, str]:
    """Generate an API key. Returns (raw_key, prefix, sha256_hash)."""
    raw_key = f"rai_{secrets.token_urlsafe(32)}"
    prefix = raw_key[:8]
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, prefix, key_hash


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


# ---------------------------------------------------------------------------
# User CRUD helpers
# ---------------------------------------------------------------------------


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username).first()


def get_user_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def create_user(
    db: Session,
    *,
    first_name: str,
    last_name: str,
    username: str,
    email: str,
    phone: str | None,
    password: str,
) -> User:
    user = User(
        first_name=first_name,
        last_name=last_name,
        username=username,
        email=email.lower(),
        phone=phone,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# API key CRUD helpers
# ---------------------------------------------------------------------------


def get_active_api_key(db: Session, user_id: uuid.UUID) -> UserAPIKey | None:
    return (
        db.query(UserAPIKey)
        .filter(UserAPIKey.user_id == user_id, UserAPIKey.is_active.is_(True))
        .first()
    )


def soft_delete_previous_keys(db: Session, user_id: uuid.UUID) -> None:
    db.query(UserAPIKey).filter(
        UserAPIKey.user_id == user_id, UserAPIKey.is_active.is_(True)
    ).update({"is_active": False})


def create_api_key(db: Session, user_id: uuid.UUID) -> str:
    """Generate a new API key for the user, soft-deleting previous ones.
    Returns the raw key (only time it's available in plaintext)."""
    soft_delete_previous_keys(db, user_id)
    raw_key, prefix, key_hash = generate_api_key()
    api_key = UserAPIKey(
        user_id=user_id,
        key_prefix=prefix,
        key_hash=key_hash,
    )
    db.add(api_key)
    db.commit()
    return raw_key


def get_user_by_api_key(db: Session, raw_key: str) -> User | None:
    """Look up a user by raw API key. Updates last_used timestamp."""
    key_hash = hash_api_key(raw_key)
    api_key = (
        db.query(UserAPIKey)
        .filter(UserAPIKey.key_hash == key_hash, UserAPIKey.is_active.is_(True))
        .first()
    )
    if api_key is None:
        return None
    api_key.last_used = func.now()
    db.commit()
    db.refresh(api_key)
    return api_key.user
