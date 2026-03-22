"""
RAG retrieval utilities for markdown-based knowledge.
Handles context building, chunk formatting, and relevance scoring.
"""

import re
from typing import Any, Dict, List, Optional


# Keywords that suggest user is asking about specific topics
# Used to determine which section types to prioritize in retrieval
TOPIC_KEYWORDS = {
    "pricing": [
        r"מחיר", r"עלות", r"כמה\s*עולה", r"תעריף", r"חבילה", r"הנחה", r"עלות\s*כמה", r"מחיר\s*כמה",
        r"price", r"cost", r"how\s*much", r"rate", r"package", r"discount", r"cost\s*how\s*much", r"price\s*how\s*much",
    ],
    "faq": [
        r"שאל", r"שאלה", r"מה\s*זה", r"למה", r"איך", r"האם",
        r"question", r"what\s*is", r"why", r"how\s*do", r"can\s*i", 
    ],
    "services": [
        r"שירות", r"מציע", r"עושים", r"סוגי", r"אפשרויות",
        r"service", r"offer", r"provide", r"types?\s*of", r"options?",
    ],
    "hours": [
        r"שעות", r"פתוח", r"סגור", r"מתי", r"זמינ",
        r"hours?", r"open", r"close", r"when", r"available",
    ],
    "contacts": [
        r"צור\s*קשר", r"טלפון", r"כתובת", r"מיקום", r"איפה", r"אימייל", r"איך\s*ליצור\s*קשר", r"רשתות\s*חברתיות", 
        r"contact", r"phone", r"address", r"location", r"where", r"email", r"reach\s*you", r"social\s*media", r"contacts"
    ],
    "policies": [
        r"מדיניות", r"ביטול", r"החזר", r"תנאים",
        r"polic", r"cancel", r"refund", r"terms?",
    ],
}


def detect_query_topics(query: str) -> List[str]:
    """
    Detect which section types might be relevant to the query.
    Returns a list of section type names to prioritize.
    """
    query_lower = query.lower()
    detected_topics = []
    
    for topic, patterns in TOPIC_KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, query_lower, re.IGNORECASE):
                detected_topics.append(topic)
                break  # One match per topic is enough
    
    return detected_topics


def build_context_query(current_message: str, conversation_history: list) -> str:
    """
    Build a comprehensive search query from the current message and recent history.
    This improves retrieval by including relevant context from the conversation.
    """
    query_parts = [current_message]
    recent_history = conversation_history[-4:] if conversation_history else []
    for msg in recent_history:
        role = getattr(msg, "role", None) if not isinstance(msg, dict) else msg.get("role")
        content = getattr(msg, "content", None) if not isinstance(msg, dict) else msg.get("content")
        if role == "user" and content:
            query_parts.append(content)
    return " ".join(query_parts).strip()


def format_relevant_chunks(
    chunks: List[Dict[str, Any]],
    include_section_headers: bool = True,
    max_chunks: int = 5,
) -> str:
    """
    Format retrieved chunks into a clean context string for the LLM.
    
    Args:
        chunks: List of chunk dictionaries from vector search
        include_section_headers: Whether to include section metadata in output
        max_chunks: Maximum number of chunks to include
    
    Returns:
        Formatted context string
    """
    if not chunks:
        return "אין מידע עסקי ספציפי במאגר כרגע."

    parts = []
    seen_content = set()  # Prevent duplicate content
    
    for chunk in chunks[:max_chunks]:
        content = chunk.get("content") or ""
        if not content:
            continue
        
        # Skip near-duplicate content
        content_preview = content[:150]
        if content_preview in seen_content:
            continue
        seen_content.add(content_preview)
        
        if include_section_headers:
            section_title = chunk.get("section_title", "")
            section_type = chunk.get("section_type", "general")
            source = chunk.get("source_file") or chunk.get("filename") or "Business Info"
            
            # Build a nice header
            header_parts = []
            if section_title:
                header_parts.append(section_title)
            if section_type and section_type != "general":
                header_parts.append(f"({section_type})")
            header_parts.append(f"[{source}]")
            
            header = " - ".join(filter(None, header_parts)) if header_parts else source
            parts.append(f"### {header}\n{content}")
        else:
            parts.append(content)

    return "\n\n---\n\n".join(parts) if parts else "אין מידע עסקי ספציפי במאגר כרגע."


def format_chunks_by_section(chunks: List[Dict[str, Any]]) -> str:
    """
    Format chunks grouped by section type for cleaner presentation.
    Useful when you want to present FAQ separate from general info.
    """
    if not chunks:
        return "אין מידע עסקי ספציפי במאגר כרגע."
    
    # Group by section type
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for chunk in chunks:
        section_type = chunk.get("section_type", "general")
        if section_type not in grouped:
            grouped[section_type] = []
        grouped[section_type].append(chunk)
    
    # Priority order for section types
    section_order = ["faq", "pricing", "services", "response_examples", "policies", "hours", "contacts", "business_info", "general"]
    
    parts = []
    for section_type in section_order:
        if section_type not in grouped:
            continue
        
        section_chunks = grouped[section_type]
        section_label = section_type.replace("_", " ").title()
        
        content_parts = []
        for chunk in section_chunks:
            content = chunk.get("content", "")
            if content:
                content_parts.append(content)
        
        if content_parts:
            parts.append(f"## {section_label}\n\n" + "\n\n".join(content_parts))
    
    return "\n\n---\n\n".join(parts) if parts else "אין מידע עסקי ספציפי במאגר כרגע."


def calculate_confidence(chunks: List[Dict[str, Any]]) -> float:
    """
    Calculate a confidence score based on retrieval results.
    
    Higher scores when:
    - More chunks with high similarity scores
    - Chunks from specific sections (FAQ, Pricing) rather than general
    
    Returns:
        Confidence score between 0.3 and 1.0
    """
    if not chunks:
        return 0.3

    scores = [float(chunk.get("score", 0) or 0) for chunk in chunks[:3]]
    if not scores:
        return 0.3

    avg_score = sum(scores) / len(scores)
    
    # Boost confidence if we found specific sections
    specific_sections = {"faq", "pricing", "services", "response_examples"}
    found_specific = any(
        chunk.get("section_type", "general") in specific_sections 
        for chunk in chunks[:3]
    )
    
    if found_specific:
        avg_score = min(avg_score * 1.1, 1.0)  # 10% boost
    
    confidence = min(max(avg_score, 0.3), 1.0)
    return round(confidence, 2)


def get_priority_sections_for_query(query: str) -> List[str]:
    """
    Determine which section types to prioritize based on the query.
    
    Returns a list of section types that should be searched first/boosted.
    """
    detected = detect_query_topics(query)
    
    # Always include FAQ as it often has direct answers
    if "faq" not in detected:
        detected.append("faq")
    
    # If asking about pricing, prioritize that
    if any(kw in query.lower() for kw in ["מחיר", "עלות", "כמה", "price", "cost"]):
        if "pricing" not in detected:
            detected.insert(0, "pricing")
    
    return detected[:3]  # Limit to top 3 priority sections
