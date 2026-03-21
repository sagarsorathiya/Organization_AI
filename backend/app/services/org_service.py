"""Organization service — CRUD for companies, departments, and designations."""

import uuid
import logging

from sqlalchemy import select, func, delete, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Company
from app.models.department import Department, company_departments, department_designations
from app.models.designation import Designation

logger = logging.getLogger(__name__)


class OrgService:
    """Manages company → department → designation hierarchy."""

    # ── Companies ──

    async def list_companies(self, db: AsyncSession, active_only: bool = False) -> list[Company]:
        q = select(Company).options(selectinload(Company.departments))
        if active_only:
            q = q.where(Company.is_active == True)
        q = q.order_by(Company.name)
        result = await db.execute(q)
        return list(result.scalars().unique().all())

    async def get_company(self, company_id: uuid.UUID, db: AsyncSession) -> Company | None:
        result = await db.execute(
            select(Company)
            .options(selectinload(Company.departments))
            .where(Company.id == company_id)
        )
        return result.scalar_one_or_none()

    async def create_company(self, data: dict, db: AsyncSession) -> Company:
        company = Company(**data)
        db.add(company)
        await db.flush()
        return company

    async def update_company(self, company_id: uuid.UUID, data: dict, db: AsyncSession) -> Company | None:
        company = await self.get_company(company_id, db)
        if not company:
            return None
        for key, value in data.items():
            if hasattr(company, key) and key not in ("id", "created_at", "created_by"):
                setattr(company, key, value)
        await db.flush()
        return company

    async def delete_company(self, company_id: uuid.UUID, db: AsyncSession) -> bool:
        company = await self.get_company(company_id, db)
        if not company:
            return False
        await db.delete(company)
        await db.flush()
        return True

    async def set_company_departments(
        self, company_id: uuid.UUID, department_ids: list[uuid.UUID], db: AsyncSession
    ) -> Company | None:
        company = await self.get_company(company_id, db)
        if not company:
            return None

        # Use direct junction table writes to avoid async lazy-load side effects.
        await db.execute(
            delete(company_departments).where(company_departments.c.company_id == company.id)
        )
        if department_ids:
            await db.execute(
                insert(company_departments),
                [{"company_id": company.id, "department_id": did} for did in department_ids],
            )
        await db.flush()
        await db.refresh(company, attribute_names=["departments"])
        return company

    # ── Departments ──

    async def list_departments(
        self, db: AsyncSession, active_only: bool = False, company_id: uuid.UUID | None = None
    ) -> list[Department]:
        q = select(Department).options(
            selectinload(Department.companies),
            selectinload(Department.designations),
        )
        if active_only:
            q = q.where(Department.is_active == True)
        if company_id:
            q = q.join(Department.companies).where(Company.id == company_id)
        q = q.order_by(Department.name)
        result = await db.execute(q)
        return list(result.scalars().unique().all())

    async def get_department(self, dept_id: uuid.UUID, db: AsyncSession) -> Department | None:
        result = await db.execute(
            select(Department)
            .options(
                selectinload(Department.companies),
                selectinload(Department.designations),
            )
            .where(Department.id == dept_id)
        )
        return result.scalar_one_or_none()

    async def create_department(self, data: dict, db: AsyncSession) -> Department:
        department = Department(**data)
        db.add(department)
        await db.flush()
        return department

    async def update_department(self, dept_id: uuid.UUID, data: dict, db: AsyncSession) -> Department | None:
        dept = await self.get_department(dept_id, db)
        if not dept:
            return None
        for key, value in data.items():
            if hasattr(dept, key) and key not in ("id", "created_at", "created_by"):
                setattr(dept, key, value)
        await db.flush()
        return dept

    async def delete_department(self, dept_id: uuid.UUID, db: AsyncSession) -> bool:
        dept = await self.get_department(dept_id, db)
        if not dept:
            return False
        await db.delete(dept)
        await db.flush()
        return True

    async def set_department_designations(
        self, dept_id: uuid.UUID, designation_ids: list[uuid.UUID], db: AsyncSession
    ) -> Department | None:
        dept = await self.get_department(dept_id, db)
        if not dept:
            return None

        # Use direct junction table writes to avoid async lazy-load side effects.
        await db.execute(
            delete(department_designations).where(
                department_designations.c.department_id == dept.id
            )
        )
        if designation_ids:
            await db.execute(
                insert(department_designations),
                [{"department_id": dept.id, "designation_id": desig_id} for desig_id in designation_ids],
            )
        await db.flush()
        await db.refresh(dept, attribute_names=["companies", "designations"])
        return dept

    # ── Designations ──

    async def list_designations(
        self, db: AsyncSession, active_only: bool = False, department_id: uuid.UUID | None = None
    ) -> list[Designation]:
        q = select(Designation).options(selectinload(Designation.departments))
        if active_only:
            q = q.where(Designation.is_active == True)
        if department_id:
            q = q.join(Designation.departments).where(Department.id == department_id)
        q = q.order_by(Designation.level, Designation.name)
        result = await db.execute(q)
        return list(result.scalars().unique().all())

    async def get_designation(self, desig_id: uuid.UUID, db: AsyncSession) -> Designation | None:
        result = await db.execute(
            select(Designation)
            .options(selectinload(Designation.departments))
            .where(Designation.id == desig_id)
        )
        return result.scalar_one_or_none()

    async def create_designation(self, data: dict, db: AsyncSession) -> Designation:
        designation = Designation(**data)
        db.add(designation)
        await db.flush()
        return designation

    async def update_designation(self, desig_id: uuid.UUID, data: dict, db: AsyncSession) -> Designation | None:
        desig = await self.get_designation(desig_id, db)
        if not desig:
            return None
        for key, value in data.items():
            if hasattr(desig, key) and key not in ("id", "created_at", "created_by"):
                setattr(desig, key, value)
        await db.flush()
        return desig

    async def delete_designation(self, desig_id: uuid.UUID, db: AsyncSession) -> bool:
        desig = await self.get_designation(desig_id, db)
        if not desig:
            return False
        await db.delete(desig)
        await db.flush()
        return True

    # ── Reverse M2M helpers (set parents from child side) ──

    async def set_company_departments_for_dept(
        self, dept: Department, company_ids: list[str], db: AsyncSession
    ) -> Department:
        """Set companies for a department (reverse of set_company_departments)."""
        cids = [uuid.UUID(c) for c in company_ids]

        # Use direct junction table writes to avoid async lazy-load on relationship assignment.
        await db.execute(
            delete(company_departments).where(company_departments.c.department_id == dept.id)
        )
        if cids:
            await db.execute(
                insert(company_departments),
                [{"company_id": cid, "department_id": dept.id} for cid in cids],
            )
        await db.flush()
        await db.refresh(dept, attribute_names=["companies", "designations"])
        return dept

    async def set_designation_departments(
        self, desig: Designation, department_ids: list[str], db: AsyncSession
    ) -> Designation:
        """Set departments for a designation (reverse of set_department_designations)."""
        dids = [uuid.UUID(d) for d in department_ids]

        # Use direct junction table writes to avoid async lazy-load on relationship assignment.
        await db.execute(
            delete(department_designations).where(
                department_designations.c.designation_id == desig.id
            )
        )
        if dids:
            await db.execute(
                insert(department_designations),
                [{"department_id": did, "designation_id": desig.id} for did in dids],
            )
        await db.flush()
        await db.refresh(desig, attribute_names=["departments"])
        return desig

    # ── Stats ──

    async def get_stats(self, db: AsyncSession) -> dict:
        companies = (await db.execute(select(func.count()).select_from(Company))).scalar() or 0
        departments = (await db.execute(select(func.count()).select_from(Department))).scalar() or 0
        designations = (await db.execute(select(func.count()).select_from(Designation))).scalar() or 0
        return {
            "total_companies": companies,
            "total_departments": departments,
            "total_designations": designations,
        }


org_service = OrgService()
