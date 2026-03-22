import json
from typing import Any, Dict, Optional

from services.openrouter_client import OpenRouterClient


class TrainingAgent:
    """
    Turns chat feedback / corrections into structured tenant memory.
    This is not weight fine-tuning; it is prompt memory generation.
    """

    def __init__(self, openrouter_client: OpenRouterClient):
        self.client = openrouter_client

    def _extract_json(self, text: str) -> Optional[dict]:
        if not text:
            return None
        text = text.strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            data = json.loads(text[start:end + 1])
            return data if isinstance(data, dict) else None
        except Exception:
            return None

    async def build_memory_card(
        self,
        *,
        tenant_id: str,
        category: str,
        source_message: str,
        correction: str,
        assistant_reply: Optional[str] = None,
        title: Optional[str] = None,
        added_by: Optional[str] = None,
        locale: str = "he-IL",
    ) -> Dict[str, Any]:
        system_prompt = """
אתה ממיר פידבק של משתמש ל"כרטיס זיכרון" מובנה לבוט מכירות אינסטגרם.
הפלט חייב להיות JSON בלבד, בלי markdown.

מטרה:
- לייצר כלל, תבנית תשובה, או דוגמת שיחה שאפשר לשמור בזיכרון של העסק.
- להתאים את התוכן לשימוש עתידי ב-prompt או ב-RAG.

כללים:
- כתוב בעברית.
- אל תמציא מידע.
- אם הפידבק לא ברור, תחזיר kind="note".
- keep it short and specific.
- תחזיר JSON בלבד.

פורמט:
{
  "kind": "rule|sop|faq|tone|script|objection|note",
  "summary": "תיאור קצר",
  "instruction": "איך הבוט צריך לפעול בעתיד",
  "do": ["..."],
  "dont": ["..."],
  "example_user": "הודעת הלקוח",
  "example_assistant": "איך הבוט צריך לענות",
  "tags": ["..."],
  "confidence": 0.0
}
""".strip()

        user_prompt = f"""
tenant_id: {tenant_id}
category: {category}
title: {title or ''}
added_by: {added_by or ''}

הודעת לקוח מקורית:
{source_message}

תשובת הבוט הנוכחית:
{assistant_reply or ''}

הפידבק / התיקון:
{correction}

locale: {locale}
""".strip()

        result = await self.client.chat(
            model="anthropic/claude-haiku-4.5",
            temperature=0.15,
            max_tokens=400,
            title="SetterAI-Training-Agent",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )

        usage = result.get("usage")
        parsed = self._extract_json(result.get("content", ""))
        if not parsed:
            return {
                "kind": "note",
                "summary": correction[:200],
                "instruction": correction[:400],
                "do": [],
                "dont": [],
                "example_user": source_message[:500],
                "example_assistant": assistant_reply[:500] if assistant_reply else None,
                "tags": [category],
                "confidence": 0.2,
                "usage": usage,
            }

        kind = parsed.get("kind") if parsed.get("kind") in {
            "rule", "sop", "faq", "tone", "script", "objection", "note"
        } else "note"

        tags = parsed.get("tags")
        if not isinstance(tags, list):
            tags = [category]

        confidence = parsed.get("confidence", 0.0)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except Exception:
            confidence = 0.0

        return {
            "kind": kind,
            "summary": str(parsed.get("summary") or correction[:200]),
            "instruction": str(parsed.get("instruction") or correction[:400]),
            "do": parsed.get("do") if isinstance(parsed.get("do"), list) else [],
            "dont": parsed.get("dont") if isinstance(parsed.get("dont"), list) else [],
            "example_user": parsed.get("example_user") or source_message,
            "example_assistant": parsed.get("example_assistant") or assistant_reply,
            "tags": tags[:8],
            "confidence": confidence,
            "usage": usage,
        }
