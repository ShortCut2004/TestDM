import json
import os

from typing import Any, Dict, List, Optional

from services.openrouter_client import OpenRouterClient
from services.vector_store_service import VectorStoreService
from rag.markdown_retriever import (
    build_context_query,
    format_relevant_chunks,
    format_chunks_by_section,
    calculate_confidence,
    get_priority_sections_for_query,
)

class DmAgent:
    def __init__(self, vector_service: VectorStoreService, openrouter_client: OpenRouterClient):
        self.vector_service = vector_service
        self.client = openrouter_client
        self.reply_model = os.environ.get("AI_MODEL", "anthropic/claude-sonnet-4.5")
        self.reply_temperature = float(os.environ.get("AI_TEMPERATURE", "0.7"))
        self.meta_model = os.environ.get("AI_META_MODEL", "anthropic/claude-haiku-4.5")
        self.meta_temperature = float(os.environ.get("AI_META_TEMPERATURE", "0.2"))
        self.rag_top_k = int(os.environ.get("RAG_TOP_K", "5"))

    async def generate_response(
        self,
        *,
        client_id: str,
        system_prompt: str,
        current_message: str,
        conversation_history: list,
        sender_name: Optional[str] = None,
        tenant_profile: Optional[dict] = None,
        lead_state: Optional[dict] = None,
        locale: Optional[str] = "he-IL",
        instagram_username: Optional[str] = None,
    ) -> dict:
        retrieval = await self._retrieve_context(client_id, current_message, conversation_history)

        reply_result = await self._generate_reply(
            system_prompt=system_prompt,
            current_message=current_message,
            conversation_history=conversation_history,
            context_text=retrieval["context_text"],
            sender_name=sender_name,
            instagram_username=instagram_username,
            locale=locale,
            lead_state=lead_state or {},
        )

        reply_text = reply_result["content"]
        reply_usage = reply_result["usage"]

        meta_result = await self._extract_lead_metadata(
            current_message=current_message,
            reply_text=reply_text,
            lead_state=lead_state or {},
            tenant_profile=tenant_profile or {},
        )

        lead_metadata = meta_result["lead_metadata"]
        meta_usage = meta_result["usage"]

        debug = {
            "retrieval": {
                "chunks": len(retrieval["relevant_chunks"]),
                "sources": retrieval["sources"],
                "section_types": retrieval.get("section_types", []),
                "priority_sections_used": retrieval.get("priority_sections_used", []),
            },
            "meta": {
                "has_lead_metadata": bool(lead_metadata),
            },
        }

        return {
            "response": reply_text,
            "sources": retrieval["sources"],
            "confidence": retrieval["confidence"],
            "lead_metadata": lead_metadata,
            "usage": reply_usage,
            "subagent_usage": [
                {"operation": "SetterAI", **(reply_usage or {})},
                {"operation": "SetterAI-Meta", **(meta_usage or {})},
            ] if (reply_usage or meta_usage) else None,
            "debug": debug,
        }

    async def _retrieve_context(self, client_id: str, current_message: str, conversation_history: list) -> dict:
        context_query = build_context_query(current_message, conversation_history)
        
        # Determine which section types to prioritize based on the query
        priority_sections = get_priority_sections_for_query(current_message)
        
        # Use priority-based search for better results
        relevant_chunks = await self.vector_service.search_with_section_priority(
            query=context_query,
            client_id=client_id,
            top_k=self.rag_top_k,
            priority_sections=priority_sections,
        )
        
        # Format chunks with section headers for better context
        context_text = format_chunks_by_section(relevant_chunks)
        
        # Collect sources and section types for debugging
        sources = list({chunk.get("source_file") or chunk.get("filename", "unknown") for chunk in relevant_chunks})
        section_types_found = list({chunk.get("section_type", "general") for chunk in relevant_chunks})
        confidence = calculate_confidence(relevant_chunks)

        return {
            "relevant_chunks": relevant_chunks,
            "context_text": context_text,
            "sources": sources,
            "section_types": section_types_found,
            "priority_sections_used": priority_sections,
            "confidence": confidence,
        }

    async def _generate_reply(
        self,
        *,
        system_prompt: str,
        current_message: str,
        conversation_history: list,
        context_text: str,
        sender_name: Optional[str],
        instagram_username: Optional[str],
        locale: Optional[str],
        lead_state: dict,
    ) -> Dict[str, Any]:
        gender = lead_state.get("gender") or "unknown"

        # Build the system prompt with:
        # 1. Client's system prompt (business info, rules, etc.)
        # 2. Runtime context (sender info)
        # 3. RAG context from documents (if available)
        prompt_parts = [system_prompt]
        
         # Add runtime context
        prompt_parts.append(
            f"\n\n## הקשר נוכחי\n"
            f"- Locale: {locale or 'he-IL'}\n"
            f"- שם השולח: {sender_name or 'לא ידוע'} {('@' + instagram_username.lstrip('@')) if instagram_username else ''}\n"
            f"- מגדר: {gender}\n"
        )
        
        # Add RAG context from documents (if available)
        if context_text:
            prompt_parts.append(
                "## מידע רלוונטי מהמסמכים\n" + context_text + "\n\n"
                "## כללים קריטיים לשימוש במידע - חובה לציית!\n"
                "### כלל מספר 1: תשובות מוכנות קודמות לכל!\n"
                "אם יש בסעיף 'שאלות ותשובות' או 'FAQ' או 'שאלות נפוצות' שאלה דומה לשאלת הלקוח:\n"
                "1. השתמש **רק** בתשובה המוכנה שמופיעה שם\n"
                "2. **אסור בהחלט** להוסיף מידע נוסף מחלקים אחרים של המסמך\n"
                "3. **אסור** לפרט מחירים/חבילות אם התשובה המוכנה לא מפרטת אותם\n"
                "4. אפשר לעטוף את התשובה המוכנה בצורה ידידותית אבל לא לשנות את התוכן\n\n"
                "### דוגמה:\n"
                "שאלה מוכנה: 'כמה עולה אימון אישי?' → תשובה מוכנה: 'אימון היכרות ראשון הוא בחינם'\n"
                "אם הלקוח שואל 'כמה עולה?' - התשובה שלך חייבת להיות וריאציה של 'אימון היכרות ראשון הוא בחינם' בלבד!\n"
                "**לא לפרט מחירי חבילות, לא להוסיף מידע על מחירים אחרים.**\n\n"
                "### כלל מספר 2: רק אם אין תשובה מוכנה\n"
                "אם אין תשובה מוכנה שמתאימה לשאלה - אז ורק אז אפשר להשתמש במידע הכללי מהמסמך.\n"
            )
        
        augmented_system_prompt = "".join(prompt_parts)

        messages: List[Dict[str, Any]] = [{"role": "system", "content": augmented_system_prompt}]

        for msg in (conversation_history or [])[-100:]:
            role = getattr(msg, "role", None) if not isinstance(msg, dict) else msg.get("role")
            content = getattr(msg, "content", None) if not isinstance(msg, dict) else msg.get("content")
            if role not in ("user", "assistant") or not content:
                continue
            messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": current_message})

        return await self.client.chat(
            model=self.reply_model,
            temperature=self.reply_temperature,
            messages=messages,
            title="SetterAI",
            max_tokens=None,
        )

    async def _extract_lead_metadata(
        self,
        *,
        current_message: str,
        reply_text: str,
        lead_state: dict,
        tenant_profile: dict,
    ) -> Dict[str, Any]:
        allowed_actions = ["none", "send_link", "follow_up", "end_conversation", "needs_human"]
        allowed_intents = ["info", "professional", "content_reaction", "fan", "chat"]
        allowed_genders = ["male", "female", "unknown"]

        prompt = (
            "אתה מסווג שיחה של בוט אינסטגרם בעברית.\n"
            "קלט: הודעת לקוח + תשובת בוט.\n"
            "פלט: JSON בלבד (בלי markdown) שמתאים לשדה lead_metadata בצד השרת.\n\n"
            "כללים:\n"
            f"- action חייב להיות אחד מ: {allowed_actions}\n"
            f"- intent חייב להיות אחד מ: {allowed_intents}\n"
            f"- gender חייב להיות אחד מ: {allowed_genders}\n"
            "- score הוא מספר שלם 0-10.\n"
            "- gathered הוא אובייקט עם מפתחות חופשיים (מחרוזות), רק אם באמת נאסף מידע חדש.\n"
            "- אם אין מידע חדש או לא בטוח — תן action=\"none\" ו-gathered={}.\n"
            "- אל תמציא עובדות.\n\n"
            f"פרטי עסק (בקצרה): שם={tenant_profile.get('name')}, שירותים={tenant_profile.get('services')}\n"
            f"מצב נוכחי: mode={lead_state.get('conversationMode')}, entryType={lead_state.get('entryType')}, bookingLinkSent={lead_state.get('bookingLinkSent')}\n"
            f"Gender known upstream: {lead_state.get('gender')}\n\n"
            f"הודעת לקוח: {current_message}\n"
            f"תשובת הבוט: {reply_text}\n\n"
            "ענה ב-JSON בלבד בפורמט:\n"
            "{\"score\":0,\"action\":\"none\",\"gender\":\"unknown\",\"intent\":\"chat\",\"interest\":null,\"name\":null,\"gathered\":{}}\n"
        )

        result = await self.client.chat(
            model=self.meta_model,
            temperature=self.meta_temperature,
            messages=[{"role": "user", "content": prompt}],
            title="SetterAI (meta)",
            max_tokens=350,
        )

        raw = (result.get("content") or "").strip()
        usage = result.get("usage")

        if not raw:
            return {"lead_metadata": None, "usage": usage}

        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return {"lead_metadata": None, "usage": usage}

        try:
            data = json.loads(raw[start:end + 1])
        except Exception:
            return {"lead_metadata": None, "usage": usage}

        if not isinstance(data, dict):
            return {"lead_metadata": None, "usage": usage}

        if data.get("action") not in allowed_actions:
            data["action"] = "none"
        if data.get("intent") not in allowed_intents:
            data["intent"] = "chat"
        if data.get("gender") not in allowed_genders:
            data["gender"] = "unknown"

        try:
            data["score"] = int(data.get("score", 0))
        except Exception:
            data["score"] = 0

        data["score"] = max(0, min(10, data["score"]))

        if not isinstance(data.get("gathered", {}), dict):
            data["gathered"] = {}

        return {"lead_metadata": data, "usage": usage}
