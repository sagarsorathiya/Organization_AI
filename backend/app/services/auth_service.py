"""Authentication service — JWT token management and user session handling."""

import json
import uuid
import secrets
import logging
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
import bcrypt as _bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.user_settings import UserSettings
from app.services.ad_service import ad_service, ADUserInfo
from app.schemas.auth import TokenPayload

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"


def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


class AuthService:
    """Handles authentication, token creation, and user provisioning."""

    async def authenticate_user(
        self, username: str, password: str, db: AsyncSession
    ) -> tuple[User, str] | None:
        """Authenticate user. Checks local admin first, then AD/dev mode."""

        # 1. Always check local admin first (break-glass account)
        if settings.LOCAL_ADMIN_ENABLED and username == settings.LOCAL_ADMIN_USERNAME:
            user = await self._authenticate_local_admin(username, password, db)
            if user is not None:
                user.last_login = datetime.now(timezone.utc)
                await db.flush()
                token = self._create_token(user)
                return user, token
            # Local admin username used but password wrong — do NOT fall through
            return None

        # 2. AD/LDAP authentication
        if settings.AD_ENABLED:
            ad_user = ad_service.authenticate(username, password)
            if ad_user is None:
                return None
            user = await self._provision_user(ad_user, db)
        else:
            # Dev mode: accept any credentials, create a local user
            user = await self._get_or_create_dev_user(username, db)

        # Update last login
        user.last_login = datetime.now(timezone.utc)
        await db.flush()

        token = self._create_token(user)
        return user, token

    async def _provision_user(self, ad_info: ADUserInfo, db: AsyncSession) -> User:
        """Create or update a local user record from AD attributes."""
        result = await db.execute(
            select(User).where(User.username == ad_info.username)
        )
        user = result.scalar_one_or_none()

        is_admin = ad_service.is_admin(ad_info.groups)

        if user is None:
            user = User(
                username=ad_info.username,
                display_name=ad_info.display_name,
                email=ad_info.email,
                department=ad_info.department,
                ad_groups=json.dumps(ad_info.groups),
                is_admin=is_admin,
                is_local_account=False,
                needs_profile_setup=True,
            )
            db.add(user)
            await db.flush()  # Populate user.id
            # Create default settings
            db.add(UserSettings(user_id=user.id))
            await db.flush()
        else:
            # Refresh from AD
            user.display_name = ad_info.display_name
            user.email = ad_info.email
            user.department = ad_info.department
            user.ad_groups = json.dumps(ad_info.groups)
            user.is_admin = is_admin
            user.is_local_account = False
            user.password_hash = None
            # Domain users must complete org profile if any required org field is missing.
            user.needs_profile_setup = not (
                user.company_id and user.department_id and user.designation_id
            )
            await db.flush()

        return user

    async def _authenticate_local_admin(
        self, username: str, password: str, db: AsyncSession
    ) -> User | None:
        """Authenticate against the local admin account."""
        result = await db.execute(
            select(User).where(User.username == username, User.is_local_account == True)
        )
        user = result.scalar_one_or_none()

        if user is None:
            # Local admin not seeded yet — verify against config directly
            if secrets.compare_digest(password, settings.LOCAL_ADMIN_PASSWORD.get_secret_value()):
                user = await self._seed_local_admin(db)
                return user
            return None

        if user.password_hash is None:
            return None

        if not _verify_password(password, user.password_hash):
            logger.warning("Local admin password mismatch for: %s", username)
            return None

        return user

    async def _seed_local_admin(self, db: AsyncSession) -> User:
        """Create the local admin account in the database."""
        user = User(
            username=settings.LOCAL_ADMIN_USERNAME,
            display_name=settings.LOCAL_ADMIN_DISPLAY_NAME,
            email=settings.LOCAL_ADMIN_EMAIL,
            is_admin=True,
            is_local_account=True,
            password_hash=_hash_password(settings.LOCAL_ADMIN_PASSWORD.get_secret_value()),
        )
        db.add(user)
        await db.flush()
        db.add(UserSettings(user_id=user.id))
        await db.flush()
        logger.info("Local admin account '%s' created", settings.LOCAL_ADMIN_USERNAME)
        return user

    async def _get_or_create_dev_user(self, username: str, db: AsyncSession) -> User:
        """Dev mode only: create a user without AD."""
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                username=username,
                display_name=username.title(),
                email=f"{username}@dev.local",
                is_admin=(username == "admin"),
            )
            db.add(user)
            await db.flush()  # Populate user.id
            db.add(UserSettings(user_id=user.id))
            await db.flush()

        return user

    def _create_token(self, user: User) -> str:
        """Create a signed JWT for the user."""
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.SESSION_EXPIRE_MINUTES)
        payload = {
            "sub": str(user.id),
            "username": user.username,
            "is_admin": user.is_admin,
            "exp": int(expire.timestamp()),
            "jti": uuid.uuid4().hex,
        }
        return jwt.encode(payload, settings.SECRET_KEY.get_secret_value(), algorithm=ALGORITHM)

    def verify_token(self, token: str) -> TokenPayload | None:
        """Verify and decode a JWT token."""
        try:
            payload = jwt.decode(token, settings.SECRET_KEY.get_secret_value(), algorithms=[ALGORITHM])
            return TokenPayload(**payload)
        except JWTError:
            return None

    async def is_token_blacklisted(self, jti: str, db: "AsyncSession") -> bool:
        """Check if a token JTI has been blacklisted (logged out)."""
        if not jti:
            return False
        from app.models.token_blacklist import TokenBlacklist
        result = await db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
        return result.scalar_one_or_none() is not None

    async def blacklist_token(self, payload: TokenPayload, db: "AsyncSession") -> None:
        """Add a token to the blacklist."""
        if not payload.jti:
            return
        from app.models.token_blacklist import TokenBlacklist
        entry = TokenBlacklist(
            jti=payload.jti,
            expires_at=datetime.fromtimestamp(payload.exp, tz=timezone.utc),
        )
        db.add(entry)
        await db.flush()

    async def change_password(
        self, user_id: uuid.UUID, old_password: str, new_password: str, db: AsyncSession
    ) -> bool:
        """Change password for local users only."""
        result = await db.execute(
            select(User).where(User.id == user_id, User.is_local_account == True)
        )
        user = result.scalar_one_or_none()
        if not user or not user.password_hash:
            return False
        if not _verify_password(old_password, user.password_hash):
            return False
        user.password_hash = _hash_password(new_password)
        await db.flush()
        return True


auth_service = AuthService()
