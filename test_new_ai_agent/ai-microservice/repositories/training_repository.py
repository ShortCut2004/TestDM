import json
import uuid
from typing import Any, Dict, List, Optional

from services.vector_store_service import VectorStoreService


class TrainingRepository:
    def __init__(self, vector_service: VectorStoreService):
        self.vector_service = vector_service

    async def save_memory_card(
        self,
        *,
        client_id: str,
        card: Dict[str, Any],
        source_message: str,
        assistant_reply: Optional[str] = None,
        title: Optional[str] = None,
        added_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Check if vector store is enabled
        if not self.vector_service.is_enabled:
            return {
                "id": None,
                "error": "Vector store is not configured - training memory cannot be saved",
                "kind": card.get("kind", "note"),
                "summary": card.get("summary", ""),
            }

        from upstash_vector import Vector

        memory_id = f"train_{uuid.uuid4().hex[:16]}"
        text = "\n".join([
            f"kind: {card.get('kind', 'note')}",
            f"summary: {card.get('summary', '')}",
            f"instruction: {card.get('instruction', '')}",
            f"do: {json.dumps(card.get('do', []), ensure_ascii=False)}",
            f"dont: {json.dumps(card.get('dont', []), ensure_ascii=False)}",
            f"example_user: {source_message}",
            f"example_assistant: {assistant_reply or ''}",
            f"title: {title or ''}",
            f"added_by: {added_by or ''}",
        ]).strip()

        embedding = self.vector_service.embeddings.embed_query(text)

        metadata = {
            "client_id": client_id,
            "document_id": memory_id,
            "filename": "training_memory",
            "kind": "training",
            "category": card.get("kind", "note"),
            "title": title or "",
            "added_by": added_by or "",
            "summary": card.get("summary", ""),
            "instruction": card.get("instruction", ""),
            "tags": card.get("tags", []),
            "content": text[:500],
        }

        vector = Vector(
            id=memory_id,
            vector=embedding,
            metadata=metadata,
            data=text,
        )

        self.vector_service.index.upsert(vectors=[vector], namespace=client_id)

        return {
            "id": memory_id,
            "kind": metadata["kind"],
            "category": metadata["category"],
            "summary": metadata["summary"],
            "instruction": metadata["instruction"],
            "tags": metadata["tags"],
        }

    async def list_memory_cards(self, client_id: str) -> List[Dict[str, Any]]:
        # Check if vector store is enabled
        if not self.vector_service.is_enabled or not self.vector_service.index:
            return [{"note": "Vector store is not configured - no training memory available"}]

        # Simple implementation: fetch via a broad query pattern in the same namespace.
        # You can later replace this with a true registry table if you want.
        try:
            info = self.vector_service.index.info()
            return [{
                "client_id": client_id,
                "note": "Use vector search + metadata filtering for detailed training memory retrieval.",
                "total_vectors": info.total_vector_count if hasattr(info, "total_vector_count") else "unknown",
            }]
        except Exception:
            return []
