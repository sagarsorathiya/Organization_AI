"""Organization API routes — companies, departments, designations."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import inspect
from sqlalchemy.orm.attributes import NO_VALUE

from app.database import get_db
from app.api.deps import get_current_user_id, get_current_user_token
from app.services.org_service import org_service
from app.models.user import User
from sqlalchemy import select

logger = logging.getLogger(__name__)

# ── Public routes (authenticated users) ──
router = APIRouter(prefix="/organization", tags=["Organization"])

# ── Admin routes ──
admin_router = APIRouter(prefix="/admin/organization", tags=["Admin - Organization"])


# ─── Schemas ───

class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = None
    is_active: bool = True


class CompanyUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    is_active: bool | None = None


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = None
    is_active: bool = True
    company_ids: list[str] | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    is_active: bool | None = None
    company_ids: list[str] | None = None


class DesignationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = None
    level: int = 0
    is_active: bool = True
    department_ids: list[str] | None = None


class DesignationUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    level: int | None = None
    is_active: bool | None = None
    department_ids: list[str] | None = None


class MappingUpdate(BaseModel):
    ids: list[str]


class ProfileSetupRequest(BaseModel):
    company_id: str
    department_id: str
    designation_id: str


# ─── Serializers ───

def _serialize_company(c) -> dict:
    departments_value = inspect(c).attrs.departments.loaded_value
    department_ids = [str(d.id) for d in departments_value] if departments_value is not NO_VALUE else []
    return {
        "id": str(c.id),
        "name": c.name,
        "code": c.code,
        "description": c.description,
        "is_active": c.is_active,
        "department_ids": department_ids,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _serialize_department(d) -> dict:
    companies_value = inspect(d).attrs.companies.loaded_value
    designations_value = inspect(d).attrs.designations.loaded_value
    company_ids = [str(c.id) for c in companies_value] if companies_value is not NO_VALUE else []
    designation_ids = [str(des.id) for des in designations_value] if designations_value is not NO_VALUE else []
    return {
        "id": str(d.id),
        "name": d.name,
        "code": d.code,
        "description": d.description,
        "is_active": d.is_active,
        "company_ids": company_ids,
        "designation_ids": designation_ids,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _serialize_designation(d) -> dict:
    departments_value = inspect(d).attrs.departments.loaded_value
    department_ids = [str(dep.id) for dep in departments_value] if departments_value is not NO_VALUE else []
    return {
        "id": str(d.id),
        "name": d.name,
        "code": d.code,
        "description": d.description,
        "level": d.level,
        "is_active": d.is_active,
        "department_ids": department_ids,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


# ═══════════════════════════════════════════
# Public Routes — for user profile setup
# ═══════════════════════════════════════════

@router.get("/companies")
async def list_active_companies(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List active companies for profile setup dropdown."""
    companies = await org_service.list_companies(db, active_only=True)
    return {"companies": [_serialize_company(c) for c in companies]}


@router.get("/departments")
async def list_active_departments(
    company_id: str | None = None,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List active departments, optionally filtered by company."""
    try:
        cid = uuid.UUID(company_id) if company_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company_id format")
    departments = await org_service.list_departments(db, active_only=True, company_id=cid)
    return {"departments": [_serialize_department(d) for d in departments]}


@router.get("/designations")
async def list_active_designations(
    department_id: str | None = None,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List active designations, optionally filtered by department."""
    try:
        did = uuid.UUID(department_id) if department_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid department_id format")
    designations = await org_service.list_designations(db, active_only=True, department_id=did)
    return {"designations": [_serialize_designation(d) for d in designations]}


@router.post("/profile-setup")
async def setup_profile(
    body: ProfileSetupRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """First-time profile setup: user selects company, department, designation."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        user.company_id = uuid.UUID(body.company_id)
        user.department_id = uuid.UUID(body.department_id)
        user.designation_id = uuid.UUID(body.designation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company/department/designation ID format")
    user.needs_profile_setup = False
    await db.flush()

    return {"status": "ok", "message": "Profile setup complete"}


@router.patch("/profile")
async def update_profile_org(
    body: ProfileSetupRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update user's company/department/designation from settings."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        user.company_id = uuid.UUID(body.company_id)
        user.department_id = uuid.UUID(body.department_id)
        user.designation_id = uuid.UUID(body.designation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company/department/designation ID format")
    await db.flush()

    return {"status": "ok", "message": "Organization profile updated"}


# ═══════════════════════════════════════════
# Admin Routes — full CRUD
# ═══════════════════════════════════════════

# ── Companies ──

@admin_router.get("/companies")
async def admin_list_companies(db: AsyncSession = Depends(get_db)):
    companies = await org_service.list_companies(db)
    return {"companies": [_serialize_company(c) for c in companies]}


@admin_router.post("/companies")
async def admin_create_company(
    body: CompanyCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["created_by"] = user_id
    company = await org_service.create_company(data, db)
    return _serialize_company(company)


@admin_router.put("/companies/{company_id}")
async def admin_update_company(
    company_id: uuid.UUID,
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    company = await org_service.update_company(company_id, data, db)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return _serialize_company(company)


@admin_router.delete("/companies/{company_id}")
async def admin_delete_company(company_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    if not await org_service.delete_company(company_id, db):
        raise HTTPException(status_code=404, detail="Company not found")
    return {"status": "deleted"}


@admin_router.put("/companies/{company_id}/departments")
async def admin_set_company_departments(
    company_id: uuid.UUID,
    body: MappingUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        dept_ids = [uuid.UUID(i) for i in body.ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid department ID format")
    company = await org_service.set_company_departments(company_id, dept_ids, db)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return _serialize_company(company)


# ── Departments ──

@admin_router.get("/departments")
async def admin_list_departments(
    company_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        cid = uuid.UUID(company_id) if company_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company_id format")
    departments = await org_service.list_departments(db, company_id=cid)
    return {"departments": [_serialize_department(d) for d in departments]}


@admin_router.post("/departments")
async def admin_create_department(
    body: DepartmentCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    company_ids = body.company_ids
    data = body.model_dump(exclude_none=True, exclude={"company_ids"})
    data["created_by"] = user_id
    dept = await org_service.create_department(data, db)
    if company_ids:
        await org_service.set_company_departments_for_dept(dept, company_ids, db)
    return _serialize_department(dept)


@admin_router.put("/departments/{dept_id}")
async def admin_update_department(
    dept_id: uuid.UUID,
    body: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    company_ids = body.company_ids
    data = body.model_dump(exclude_none=True, exclude={"company_ids"})
    dept = await org_service.update_department(dept_id, data, db)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    if company_ids is not None:
        await org_service.set_company_departments_for_dept(dept, company_ids, db)
    return _serialize_department(dept)


@admin_router.delete("/departments/{dept_id}")
async def admin_delete_department(dept_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    if not await org_service.delete_department(dept_id, db):
        raise HTTPException(status_code=404, detail="Department not found")
    return {"status": "deleted"}


@admin_router.put("/departments/{dept_id}/designations")
async def admin_set_department_designations(
    dept_id: uuid.UUID,
    body: MappingUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        desig_ids = [uuid.UUID(i) for i in body.ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid designation ID format")
    dept = await org_service.set_department_designations(dept_id, desig_ids, db)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return _serialize_department(dept)


# ── Designations ──

@admin_router.get("/designations")
async def admin_list_designations(
    department_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        did = uuid.UUID(department_id) if department_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid department_id format")
    designations = await org_service.list_designations(db, department_id=did)
    return {"designations": [_serialize_designation(d) for d in designations]}


@admin_router.post("/designations")
async def admin_create_designation(
    body: DesignationCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    department_ids = body.department_ids
    data = body.model_dump(exclude_none=True, exclude={"department_ids"})
    data["created_by"] = user_id
    desig = await org_service.create_designation(data, db)
    if department_ids:
        await org_service.set_designation_departments(desig, department_ids, db)
    return _serialize_designation(desig)


@admin_router.put("/designations/{desig_id}")
async def admin_update_designation(
    desig_id: uuid.UUID,
    body: DesignationUpdate,
    db: AsyncSession = Depends(get_db),
):
    department_ids = body.department_ids
    data = body.model_dump(exclude_none=True, exclude={"department_ids"})
    desig = await org_service.update_designation(desig_id, data, db)
    if not desig:
        raise HTTPException(status_code=404, detail="Designation not found")
    if department_ids is not None:
        await org_service.set_designation_departments(desig, department_ids, db)
    return _serialize_designation(desig)


@admin_router.delete("/designations/{desig_id}")
async def admin_delete_designation(desig_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    if not await org_service.delete_designation(desig_id, db):
        raise HTTPException(status_code=404, detail="Designation not found")
    return {"status": "deleted"}


# ── Stats ──

@admin_router.get("/stats")
async def org_stats(db: AsyncSession = Depends(get_db)):
    return await org_service.get_stats(db)
