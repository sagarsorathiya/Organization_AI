"""Shared API dependencies — authentication, DB session, request helpers."""

import uuid
import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth_service import auth_service
from app.schemas.auth import TokenPayload

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> TokenPayload:
    """Extract and verify JWT from Authorization header or cookie."""
    token = None

    # Try Bearer token first
    if credentials:
        token = credentials.credentials

    # Fall back to cookie
    if not token:
        from app.config import settings
        token = request.cookies.get(settings.SESSION_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = auth_service.verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Check if token has been blacklisted (logged out)
    if payload.jti and await auth_service.is_token_blacklisted(payload.jti, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    return payload


async def get_current_user_id(
    token: TokenPayload = Depends(get_current_user_token),
) -> uuid.UUID:
    """Return the current user's UUID."""
    try:
        return uuid.UUID(token.sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )


async def require_admin(
    token: TokenPayload = Depends(get_current_user_token),
) -> TokenPayload:
    """Require the current user to be an admin."""
    if not token.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return token


def get_client_ip(request: Request) -> str:
    """Get client IP, respecting X-Forwarded-For / X-Real-IP behind reverse proxy.

    Validates the extracted IP to prevent log injection via spoofed headers.
    """
    from app.middleware.security import validate_ip
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return validate_ip(forwarded.split(",")[0])
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return validate_ip(real_ip)
    return request.client.host if request.client else "unknown"
