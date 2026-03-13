import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from jose import jwt
from passlib.context import CryptContext

load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")


# Hash a plain password using bcrypt_sha256.
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# Verify a plain password against a stored bcrypt_sha256 hash.
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# Create a JWT access token from claims with expiry.
def create_access_token(data: dict) -> str:
    secret_key = os.getenv("SECRET_KEY", "change_me_please_change_me_please")
    algorithm = os.getenv("ALGORITHM", "HS256")
    expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    payload.update({"exp": expire})
    return jwt.encode(payload, secret_key, algorithm=algorithm)
