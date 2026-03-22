from typing import Any, Dict, Optional

from agents.training_agent import TrainingAgent
from repositories.training_repository import TrainingRepository


class TrainingService:
    def __init__(self, training_agent: TrainingAgent, training_repository: TrainingRepository):
        self.training_agent = training_agent
        self.training_repository = training_repository

    async def ingest_feedback(
        self,
        *,
        client_id: str,
        category: str,
        source_message: str,
        correction: str,
        assistant_reply: Optional[str] = None,
        title: Optional[str] = None,
        added_by: Optional[str] = None,
        locale: str = "he-IL",
    ) -> Dict[str, Any]:
        card = await self.training_agent.build_memory_card(
            tenant_id=client_id,
            category=category,
            source_message=source_message,
            correction=correction,
            assistant_reply=assistant_reply,
            title=title,
            added_by=added_by,
            locale=locale,
        )

        saved = await self.training_repository.save_memory_card(
            client_id=client_id,
            card=card,
            source_message=source_message,
            assistant_reply=assistant_reply,
            title=title,
            added_by=added_by,
        )

        # Extract usage for cost tracking
        usage = card.pop("usage", None) if isinstance(card, dict) else None

        return {
            "success": True,
            "memory_card": card,
            "saved": saved,
            "usage": usage,
        }

    async def list_memory_cards(self, client_id: str):
        return await self.training_repository.list_memory_cards(client_id)
