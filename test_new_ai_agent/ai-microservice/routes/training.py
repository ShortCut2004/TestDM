from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/training", tags=["training"])


class TrainingIngestRequest(BaseModel):
    client_id: str = Field(..., description="Tenant/client ID")
    category: str = Field(..., description="sop|objection|faq|tone|script|rule|general")
    source_message: str = Field(..., description="Original user/lead message")
    correction: str = Field(..., description="Human correction / desired behavior")
    assistant_reply: Optional[str] = Field(default=None, description="The bot reply that was wrong")
    title: Optional[str] = Field(default=None, description="Optional title")
    added_by: Optional[str] = Field(default=None, description="Who added it")
    locale: Optional[str] = Field(default="he-IL")


class TrainingIngestResponse(BaseModel):
    success: bool
    memory_card: Optional[dict] = None
    saved: Optional[dict] = None
    usage: Optional[dict] = Field(default=None, description="Token usage for cost tracking")


@router.post("/ingest", response_model=TrainingIngestResponse)
async def ingest_training_feedback(request: Request, payload: TrainingIngestRequest):
    try:
        training_service = request.app.state.training_service
        result = await training_service.ingest_feedback(
            client_id=payload.client_id.strip(),
            category=payload.category.strip(),
            source_message=payload.source_message.strip(),
            correction=payload.correction.strip(),
            assistant_reply=payload.assistant_reply,
            title=payload.title,
            added_by=payload.added_by,
            locale=payload.locale or "he-IL",
        )
        return TrainingIngestResponse(
            success=result.get("success", True),
            memory_card=result.get("memory_card"),
            saved=result.get("saved"),
            usage=result.get("usage"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training ingest failed: {str(e)}")


@router.get("/{client_id}/list")
async def list_training_memory(client_id: str, request: Request):
    try:
        training_service = request.app.state.training_service
        return {
            "client_id": client_id,
            "items": await training_service.list_memory_cards(client_id.strip()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training list failed: {str(e)}")
