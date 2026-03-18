"""User schemas."""

from datetime import datetime
from pydantic import BaseModel


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    email: str | None = None
    department: str | None = None
    is_admin: bool = False
    is_active: bool = True
    is_local_account: bool = False
    last_login: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int
