"""Skill service — execute multi-step AI workflows."""

import uuid
import logging
import time
import json
from datetime import datetime, timezone

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_skill import AgentSkill, SkillExecution
from app.services.llm_service import llm_service
from app.config import settings

logger = logging.getLogger(__name__)


class SkillService:
    """Manages skill CRUD and execution."""

    async def _generate_structured_with_retry(
        self,
        skill_name: str,
        step_desc: str,
        prompt: str,
        output_schema: dict,
        max_retries: int = 2,
    ) -> str:
        """Generate JSON output with schema checks and repair retries."""
        schema_text = json.dumps(output_schema, ensure_ascii=True)
        system_msg = (
            f"You are executing skill: {skill_name}. Step: {step_desc}. "
            "Return ONLY valid JSON without markdown fences."
        )
        user_prompt = (
            prompt
            + "\n\nReturn a JSON object that conforms to this schema:\n"
            + schema_text
        )

        last_error = "unknown"
        for attempt in range(max_retries + 1):
            raw = await llm_service.generate([
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_prompt},
            ])
            cleaned = raw.strip().removeprefix("```json").removesuffix("```").strip()

            try:
                data = json.loads(cleaned)
                if not isinstance(data, dict):
                    raise ValueError("Output must be a JSON object")

                required = output_schema.get("required", []) if isinstance(output_schema, dict) else []
                if required and isinstance(required, list):
                    missing = [k for k in required if k not in data]
                    if missing:
                        raise ValueError(f"Missing required keys: {', '.join(missing)}")

                # Keep normalized JSON to simplify downstream parsing.
                return json.dumps(data, ensure_ascii=True)
            except Exception as exc:
                last_error = str(exc)
                if attempt >= max_retries:
                    break
                user_prompt = (
                    "Your previous output was invalid. "
                    f"Error: {last_error}.\n"
                    "Return ONLY corrected JSON matching the schema exactly.\n\n"
                    + prompt
                    + "\n\nSchema:\n"
                    + schema_text
                )

        raise ValueError(f"Structured output validation failed after retries: {last_error}")

    async def list_skills(
        self,
        db: AsyncSession,
        agent_id: uuid.UUID | None = None,
        active_only: bool = True,
    ) -> list[AgentSkill]:
        q = select(AgentSkill)
        if active_only:
            q = q.where(AgentSkill.is_active == True)
        if agent_id:
            q = q.where(
                (AgentSkill.agent_id == agent_id) | (AgentSkill.agent_id.is_(None))
            )
        q = q.order_by(AgentSkill.name)
        result = await db.execute(q)
        return list(result.scalars().all())

    async def get_skill(self, skill_id: uuid.UUID, db: AsyncSession) -> AgentSkill | None:
        result = await db.execute(select(AgentSkill).where(AgentSkill.id == skill_id))
        return result.scalar_one_or_none()

    async def get_skill_by_slug(self, slug: str, db: AsyncSession) -> AgentSkill | None:
        result = await db.execute(select(AgentSkill).where(AgentSkill.slug == slug))
        return result.scalar_one_or_none()

    async def create_skill(self, data: dict, db: AsyncSession) -> AgentSkill:
        skill = AgentSkill(**data)
        db.add(skill)
        await db.flush()
        return skill

    async def update_skill(self, skill_id: uuid.UUID, data: dict, db: AsyncSession) -> AgentSkill | None:
        result = await db.execute(select(AgentSkill).where(AgentSkill.id == skill_id))
        skill = result.scalar_one_or_none()
        if not skill:
            return None
        for key, value in data.items():
            if hasattr(skill, key) and key not in ("id", "created_at"):
                setattr(skill, key, value)
        await db.flush()
        return skill

    async def delete_skill(self, skill_id: uuid.UUID, db: AsyncSession) -> bool:
        result = await db.execute(select(AgentSkill).where(AgentSkill.id == skill_id))
        skill = result.scalar_one_or_none()
        if not skill or skill.is_system:
            return False
        await db.delete(skill)
        await db.flush()
        return True

    async def execute_skill(
        self,
        skill: AgentSkill,
        user_id: uuid.UUID,
        inputs: dict,
        db: AsyncSession,
    ) -> SkillExecution:
        """Execute a multi-step skill workflow."""
        start = time.monotonic()
        execution = SkillExecution(
            skill_id=skill.id,
            user_id=user_id,
            status="running",
            inputs=inputs,
        )
        db.add(execution)
        await db.flush()

        try:
            result_parts = []
            context = dict(inputs)

            for step in skill.steps:
                action = step.get("action", "llm_generate")
                params = step.get("params", {}) if isinstance(step.get("params"), dict) else {}
                prompt = params.get("prompt") or step.get("prompt", "")

                # Template substitution
                for key, val in context.items():
                    if isinstance(val, str):
                        prompt = prompt.replace(f"{{{key}}}", val)

                if action in ("llm_generate", "llm_summarize"):
                    output_schema = params.get("output_schema")
                    if output_schema and isinstance(output_schema, dict):
                        response = await self._generate_structured_with_retry(
                            skill_name=skill.name,
                            step_desc=step.get("description", ""),
                            prompt=prompt,
                            output_schema=output_schema,
                        )
                    else:
                        messages = [
                            {"role": "system", "content": f"You are executing skill: {skill.name}. Step: {step.get('description', '')}"},
                            {"role": "user", "content": prompt},
                        ]
                        response = await llm_service.generate(messages)
                    context[f"step_{step.get('step', len(result_parts) + 1)}"] = response
                    result_parts.append(response)
                elif action == "format_output":
                    template = step.get("params", {}).get("template", "")
                    result_parts.append(f"\n---\n**Formatted Output ({template})**\n")

            final_result = "\n\n".join(result_parts)
            execution.status = "success"
            execution.result = final_result
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int((time.monotonic() - start) * 1000)

            # Increment usage
            await db.execute(
                update(AgentSkill)
                .where(AgentSkill.id == skill.id)
                .values(usage_count=AgentSkill.usage_count + 1)
            )
            await db.flush()
            return execution

        except Exception as e:
            logger.error("Skill execution failed: %s", str(e))
            execution.status = "failed"
            execution.error_message = str(e)
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int((time.monotonic() - start) * 1000)
            await db.flush()
            return execution

    async def get_executions(
        self,
        user_id: uuid.UUID,
        db: AsyncSession,
        skill_id: uuid.UUID | None = None,
        limit: int = 20,
    ) -> list[SkillExecution]:
        q = select(SkillExecution).where(SkillExecution.user_id == user_id)
        if skill_id:
            q = q.where(SkillExecution.skill_id == skill_id)
        q = q.order_by(SkillExecution.started_at.desc()).limit(min(limit, 100))
        result = await db.execute(q)
        return list(result.scalars().all())

    async def get_stats(self, db: AsyncSession) -> dict:
        total = (await db.execute(select(func.count()).select_from(AgentSkill))).scalar() or 0
        total_executions = (await db.execute(
            select(func.count()).select_from(SkillExecution)
        )).scalar() or 0
        top_skills = (await db.execute(
            select(AgentSkill.name, AgentSkill.usage_count)
            .order_by(AgentSkill.usage_count.desc())
            .limit(10)
        )).all()
        return {
            "total_skills": total,
            "total_executions": total_executions,
            "top_skills": [{"name": n, "usage_count": c} for n, c in top_skills],
        }


skill_service = SkillService()
