"""Authentication API routes."""

import time
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.schemas.auth import LoginRequest, LoginResponse, UserInfo, ChangePasswordRequest
from app.services.auth_service import auth_service
from app.services.audit_service import audit_service
from app.api.deps import get_current_user_id, get_current_user_token, get_client_ip
from app.middleware.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ---- Brute-force protection ----
# Track failed attempts per IP: {ip: [(timestamp, username), ...]}
_failed_attempts: dict[str, list[float]] = defaultdict(list)
_LOCKOUT_WINDOW = 900       # 15 minutes
_MAX_FAILED_ATTEMPTS = 5    # lock after 5 failures


def _is_locked_out(ip: str) -> bool:
    """Check if an IP is locked out due to too many failed attempts."""
    cutoff = time.monotonic() - _LOCKOUT_WINDOW
    # Prune old entries
    _failed_attempts[ip] = [t for t in _failed_attempts[ip] if t > cutoff]
    return len(_failed_attempts[ip]) >= _MAX_FAILED_ATTEMPTS


def _record_failure(ip: str) -> None:
    """Record a failed login attempt for an IP."""
    _failed_attempts[ip].append(time.monotonic())


def _clear_failures(ip: str) -> None:
    """Clear failed attempts on successful login."""
    _failed_attempts.pop(ip, None)


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate against Active Directory and return JWT."""
    client_ip = get_client_ip(request)

    # Brute-force protection: reject if too many recent failures from this IP
    if _is_locked_out(client_ip):
        await audit_service.log(
            db,
            action="login_blocked",
            username=body.username,
            ip_address=client_ip,
            user_agent=request.headers.get("user-agent"),
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again in 15 minutes.",
        )

    result = await auth_service.authenticate_user(body.username, body.password, db)

    if result is None:
        _record_failure(client_ip)
        await audit_service.log(
            db,
            action="login_failed",
            username=body.username,
            ip_address=client_ip,
            user_agent=request.headers.get("user-agent"),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user, token = result
    _clear_failures(client_ip)

    # Set secure cookie
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        httponly=settings.SESSION_COOKIE_HTTPONLY,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        max_age=settings.SESSION_EXPIRE_MINUTES * 60,
    )

    await audit_service.log(
        db,
        action="login_success",
        user_id=user.id,
        username=user.username,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return LoginResponse(
        token=token,
        user=UserInfo(
            id=str(user.id),
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            department=user.department,
            is_admin=user.is_admin,
            is_local_account=user.is_local_account,
        ),
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    token=Depends(get_current_user_token),
    db: AsyncSession = Depends(get_db),
):
    """Clear session cookie and blacklist the JWT."""
    # Invalidate the token so it cannot be reused
    await auth_service.blacklist_token(token, db)

    response.delete_cookie(
        settings.SESSION_COOKIE_NAME,
        httponly=settings.SESSION_COOKIE_HTTPONLY,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )

    await audit_service.log(
        db,
        action="logout",
        user_id=token.sub if hasattr(token, "sub") else None,
        username=token.username,
        ip_address=get_client_ip(request),
    )

    return {"message": "Logged out"}


@router.get("/me", response_model=UserInfo)
async def get_current_user(
    token=Depends(get_current_user_token),
    db: AsyncSession = Depends(get_db),
):
    """Return info about the currently authenticated user."""
    from app.services.user_service import user_service
    import uuid

    user = await user_service.get_user_by_id(uuid.UUID(token.sub), db)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserInfo(
        id=str(user.id),
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        department=user.department,
        is_admin=user.is_admin,
        is_local_account=user.is_local_account,
    )


@router.post("/change-password")
@limiter.limit("5/minute")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Change password for local users only."""
    success = await auth_service.change_password(
        user_id, body.old_password, body.new_password, db
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid old password or not a local account",
        )
    return {"message": "Password changed successfully"}
