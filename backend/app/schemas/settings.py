"""Settings schemas."""

from pydantic import BaseModel, Field


class UserSettingsUpdate(BaseModel):
    theme: str | None = Field(None, pattern="^(light|dark|system)$")
    preferred_model: str | None = None
    data_retention_days: int | None = Field(None, ge=30, le=3650)
    system_prompt: str | None = Field(None, max_length=4000)


class UserSettingsResponse(BaseModel):
    theme: str = "system"
    preferred_model: str | None = None
    data_retention_days: int = 365
    system_prompt: str | None = None

    model_config = {"from_attributes": True}
