"""Authentication schemas."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=256)
    password: str = Field(..., min_length=8)


class LoginResponse(BaseModel):
    token: str
    user: "UserInfo"


class UserInfo(BaseModel):
    id: str
    username: str
    display_name: str
    email: str | None = None
    department: str | None = None
    is_admin: bool = False
    is_local_account: bool = False
    company_id: str | None = None
    company_name: str | None = None
    department_id: str | None = None
    department_name: str | None = None
    designation_id: str | None = None
    designation_name: str | None = None
    needs_profile_setup: bool = False

    model_config = {"from_attributes": True}


class TokenPayload(BaseModel):
    sub: str  # user_id
    username: str
    is_admin: bool = False
    exp: int
    jti: str = ""  # JWT ID for blacklisting


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


LoginResponse.model_rebuild()
