import os
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User

load_dotenv()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# Resolve and return the authenticated user from JWT token.
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    secret_key = os.getenv("SECRET_KEY", "change_me_please_change_me_please")
    algorithm = os.getenv("ALGORITHM", "HS256")
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
        user_id = payload.get("sub")
        if not user_id:
            raise credentials_exception
        uid = UUID(str(user_id))
    except (JWTError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise credentials_exception
    return user
