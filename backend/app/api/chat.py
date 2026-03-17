"""Chat / messaging API routes with streaming support."""

import asyncio
import uuid
import io
import csv
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id, get_current_user_token, get_client_ip
from app.schemas.message import (
    ChatRequest,
    ChatResponse,
    MessageResponse,
    SearchRequest,
    SearchResult,
)
from app.services.chat_service import chat_service
from app.services.audit_service import audit_service
from app.config import settings as app_settings
from app.models.file_upload import FileUpload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])

# Maximum upload size: 10 MB
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".txt", ".csv", ".md",
    ".pdf",
    ".docx", ".doc",
    ".xlsx", ".xls",
    ".pptx", ".ppt",
    ".rtf",
    ".json", ".xml", ".html",
}


@router.post("", response_model=ChatResponse)
async def send_message(
    body: ChatRequest,
    request: Request,
    user_id: uuid.UUID = Depends(get_current_user_id),
    token=Depends(get_current_user_token),
    db: AsyncSession = Depends(get_db),
):
    """Send a message and get a non-streaming LLM response."""
    conv_id = uuid.UUID(body.conversation_id) if body.conversation_id else None

    try:
        user_msg, assistant_msg, conv = await chat_service.send_message(
            user_id=user_id,
            conversation_id=conv_id,
            content=body.message,
            model=body.model,
            db=db,
        )
    except PermissionError:
        raise HTTPException(status_code=404, detail="Conversation not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate response")

    await audit_service.log(
        db,
        action="prompt_submitted",
        user_id=user_id,
        username=token.username,
        resource_type="conversation",
        resource_id=str(conv.id),
        ip_address=get_client_ip(request),
    )

    return ChatResponse(
        message=MessageResponse(
            id=str(assistant_msg.id),
            conversation_id=str(conv.id),
            role=assistant_msg.role,
            content=assistant_msg.content,
            model=assistant_msg.model,
            token_count=assistant_msg.token_count,
            created_at=assistant_msg.created_at,
        ),
        conversation_id=str(conv.id),
    )


@router.post("/stream")
async def send_message_stream(
    body: ChatRequest,
    request: Request,
    user_id: uuid.UUID = Depends(get_current_user_id),
    token=Depends(get_current_user_token),
    db: AsyncSession = Depends(get_db),
):
    """Send a message and stream the LLM response (SSE-like NDJSON)."""
    conv_id = uuid.UUID(body.conversation_id) if body.conversation_id else None

    await audit_service.log(
        db,
        action="prompt_submitted",
        user_id=user_id,
        username=token.username,
        resource_type="conversation",
        resource_id=str(conv_id) if conv_id else "new",
        ip_address=get_client_ip(request),
    )

    return StreamingResponse(
        chat_service.send_message_stream(
            user_id=user_id,
            conversation_id=conv_id,
            content=body.message,
            model=body.model,
        ),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/search", response_model=list[SearchResult])
async def search_messages(
    body: SearchRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Search across the current user's messages only."""
    results = await chat_service.search_messages(user_id, body.query, body.limit, db)
    return [SearchResult(**r) for r in results]


@router.get("/models")
async def list_available_models(
    _user_id: uuid.UUID = Depends(get_current_user_id),
):
    """List available LLM models for the model selector (any authenticated user)."""
    from app.services.llm_service import llm_service
    models = await llm_service.list_models()
    return {
        "models": [m.get("name", "unknown") for m in models],
        "default": llm_service.default_model,
    }


def _get_extension(filename: str) -> str:
    """Return lowercase file extension including the dot."""
    import os
    return os.path.splitext(filename)[1].lower()


def _extract_text_txt(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")


def _extract_text_csv(data: bytes) -> str:
    text = data.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = []
    for row in reader:
        rows.append(" | ".join(row))
    return "\n".join(rows)


def _extract_text_pdf(data: bytes) -> str:
    import PyPDF2
    reader = PyPDF2.PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            pages.append(t)
    return "\n\n".join(pages)


def _extract_text_docx(data: bytes) -> str:
    import docx
    doc = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_text_xlsx(data: bytes) -> str:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    lines = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        lines.append(f"--- Sheet: {sheet_name} ---")
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            lines.append(" | ".join(cells))
    wb.close()
    return "\n".join(lines)


def _extract_text_pptx(data: bytes) -> str:
    from pptx import Presentation
    prs = Presentation(io.BytesIO(data))
    slides_text = []
    for i, slide in enumerate(prs.slides, 1):
        parts = [f"--- Slide {i} ---"]
        for shape in slide.shapes:
            if shape.has_text_frame:
                for paragraph in shape.text_frame.paragraphs:
                    text = paragraph.text.strip()
                    if text:
                        parts.append(text)
        slides_text.append("\n".join(parts))
    return "\n\n".join(slides_text)


EXTRACTOR_MAP = {
    ".txt": _extract_text_txt,
    ".md": _extract_text_txt,
    ".json": _extract_text_txt,
    ".xml": _extract_text_txt,
    ".html": _extract_text_txt,
    ".rtf": _extract_text_txt,
    ".csv": _extract_text_csv,
    ".pdf": _extract_text_pdf,
    ".docx": _extract_text_docx,
    ".doc": _extract_text_docx,
    ".xlsx": _extract_text_xlsx,
    ".xls": _extract_text_xlsx,
    ".pptx": _extract_text_pptx,
    ".ppt": _extract_text_pptx,
}


@router.get("/attachments-enabled")
async def check_attachments_enabled(
    _user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Check if file attachments are enabled by admin."""
    return {"enabled": app_settings.ATTACHMENTS_ENABLED}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    conversation_id: str | None = None,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document and extract its text content."""
    if not app_settings.ATTACHMENTS_ENABLED:
        raise HTTPException(status_code=403, detail="File attachments are disabled by administrator")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = _get_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10 MB.")

    extractor = EXTRACTOR_MAP.get(ext)
    if not extractor:
        raise HTTPException(status_code=400, detail=f"No text extractor for '{ext}'")

    try:
        # Run synchronous extraction in a thread to avoid blocking the event loop (P4)
        loop = asyncio.get_running_loop()
        extracted_text = await loop.run_in_executor(None, extractor, data)
    except Exception:
        logger.exception("Text extraction failed for file: %s", file.filename)
        raise HTTPException(status_code=422, detail="Failed to extract text from the uploaded file")

    # Truncate very long documents to avoid overloading the LLM context
    max_chars = 50000
    truncated = len(extracted_text) > max_chars
    if truncated:
        extracted_text = extracted_text[:max_chars]

    # Log the upload to DB (F1: set conversation_id when available)
    conv_uuid = None
    if conversation_id:
        try:
            conv_uuid = uuid.UUID(conversation_id)
        except ValueError:
            pass
    upload_record = FileUpload(
        user_id=user_id,
        conversation_id=conv_uuid,
        filename=file.filename,
        extension=ext,
        size_bytes=len(data),
        char_count=len(extracted_text),
        truncated=truncated,
    )
    db.add(upload_record)

    return {
        "filename": file.filename,
        "size": len(data),
        "extension": ext,
        "text": extracted_text,
        "truncated": truncated,
    }
