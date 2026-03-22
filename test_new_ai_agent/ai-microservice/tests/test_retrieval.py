"""
Tests for the RAG retrieval utilities.
Run with: uv run pytest tests/test_retrieval.py -v
"""

import pytest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.markdown_retriever import (
    detect_query_topics,
    build_context_query,
    format_relevant_chunks,
    format_chunks_by_section,
    calculate_confidence,
    get_priority_sections_for_query,
)


class TestDetectQueryTopics:
    """Tests for query topic detection."""
    
    def test_detect_pricing_query_english(self):
        topics = detect_query_topics("How much does it cost?")
        assert "pricing" in topics
        
        topics = detect_query_topics("What are your prices?")
        assert "pricing" in topics
    
    def test_detect_pricing_query_hebrew(self):
        topics = detect_query_topics("כמה עולה אימון?")
        assert "pricing" in topics
        
        topics = detect_query_topics("מה המחיר?")
        assert "pricing" in topics
        
        topics = detect_query_topics("מה העלות?")
        assert "pricing" in topics
    
    def test_detect_faq_query(self):
        topics = detect_query_topics("I have a question about...")
        assert "faq" in topics
        
        topics = detect_query_topics("מה זה אימון אישי?")
        assert "faq" in topics
    
    def test_detect_hours_query(self):
        topics = detect_query_topics("When are you open?")
        assert "hours" in topics
        
        topics = detect_query_topics("מתי אתם פתוחים?")
        assert "hours" in topics
        
        topics = detect_query_topics("שעות פעילות?")
        assert "hours" in topics
    
    def test_detect_contact_query(self):
        topics = detect_query_topics("How can I contact you?")
        assert "contacts" in topics
        
        topics = detect_query_topics("איפה אתם נמצאים?")
        assert "contacts" in topics
    
    def test_detect_services_query(self):
        topics = detect_query_topics("What services do you offer?")
        assert "services" in topics
        
        topics = detect_query_topics("מה השירותים שלכם?")
        assert "services" in topics
    
    def test_no_topics_for_general_query(self):
        topics = detect_query_topics("היי מה נשמע")
        # Should return empty or minimal topics
        assert len(topics) <= 1


class TestBuildContextQuery:
    """Tests for context query building."""
    
    def test_simple_message(self):
        query = build_context_query("How much?", [])
        assert "How much?" in query
    
    def test_with_conversation_history(self):
        history = [
            {"role": "user", "content": "Hi there"},
            {"role": "assistant", "content": "Hello! How can I help?"},
            {"role": "user", "content": "I want to know about pricing"},
        ]
        query = build_context_query("How much?", history)
        
        assert "How much?" in query
        assert "pricing" in query
    
    def test_limits_history(self):
        # Long history should be trimmed
        history = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(10)
        ]
        query = build_context_query("Current message", history)
        
        # Should not include all 10 messages
        assert query.count("Message") <= 5


class TestFormatRelevantChunks:
    """Tests for chunk formatting."""
    
    def test_format_empty_chunks(self):
        result = format_relevant_chunks([])
        assert "אין מידע" in result  # Hebrew "no info" message
    
    def test_format_single_chunk(self):
        chunks = [{
            "content": "Pricing info here",
            "score": 0.9,
            "filename": "pricing.md",
            "section_title": "Pricing",
            "section_type": "pricing",
        }]
        result = format_relevant_chunks(chunks)
        
        assert "Pricing info here" in result
        assert "Pricing" in result
    
    def test_format_multiple_chunks(self):
        chunks = [
            {"content": "First chunk", "score": 0.9, "section_title": "A", "section_type": "general"},
            {"content": "Second chunk", "score": 0.8, "section_title": "B", "section_type": "faq"},
        ]
        result = format_relevant_chunks(chunks)
        
        assert "First chunk" in result
        assert "Second chunk" in result
    
    def test_deduplication(self):
        # Same content should not appear twice
        chunks = [
            {"content": "Same content here", "score": 0.9, "section_title": "A"},
            {"content": "Same content here", "score": 0.8, "section_title": "B"},
        ]
        result = format_relevant_chunks(chunks)
        
        # Should only appear once
        assert result.count("Same content here") == 1


class TestFormatChunksBySection:
    """Tests for section-grouped formatting."""
    
    def test_groups_by_section(self):
        chunks = [
            {"content": "FAQ answer", "section_type": "faq"},
            {"content": "Pricing info", "section_type": "pricing"},
            {"content": "General info", "section_type": "general"},
        ]
        result = format_chunks_by_section(chunks)
        
        # Should contain section headers
        assert "Faq" in result or "FAQ" in result.upper()
        assert "Pricing" in result
    
    def test_priority_order(self):
        chunks = [
            {"content": "General", "section_type": "general"},
            {"content": "FAQ", "section_type": "faq"},
        ]
        result = format_chunks_by_section(chunks)
        
        # FAQ should come before general
        faq_pos = result.find("FAQ")
        general_pos = result.find("General")
        assert faq_pos < general_pos


class TestCalculateConfidence:
    """Tests for confidence calculation."""
    
    def test_empty_chunks_low_confidence(self):
        confidence = calculate_confidence([])
        assert confidence == 0.3
    
    def test_high_score_chunks(self):
        chunks = [
            {"score": 0.95},
            {"score": 0.92},
            {"score": 0.90},
        ]
        confidence = calculate_confidence(chunks)
        assert confidence >= 0.9
    
    def test_low_score_chunks(self):
        chunks = [
            {"score": 0.4},
            {"score": 0.35},
            {"score": 0.3},
        ]
        confidence = calculate_confidence(chunks)
        assert confidence >= 0.3
        assert confidence <= 0.5
    
    def test_specific_section_boost(self):
        # Chunks from specific sections should boost confidence
        general_chunks = [
            {"score": 0.7, "section_type": "general"},
        ]
        specific_chunks = [
            {"score": 0.7, "section_type": "faq"},
        ]
        
        general_conf = calculate_confidence(general_chunks)
        specific_conf = calculate_confidence(specific_chunks)
        
        assert specific_conf >= general_conf


class TestGetPrioritySections:
    """Tests for priority section determination."""
    
    def test_pricing_query_priorities(self):
        priorities = get_priority_sections_for_query("כמה עולה?")
        assert "pricing" in priorities
        assert "faq" in priorities  # FAQ always included
    
    def test_general_query_includes_faq(self):
        priorities = get_priority_sections_for_query("היי מה קורה")
        assert "faq" in priorities  # FAQ should always be included
    
    def test_limits_priority_count(self):
        # Should not return too many priorities
        priorities = get_priority_sections_for_query("some query")
        assert len(priorities) <= 3


class TestIntegration:
    """Integration tests combining multiple functions."""
    
    def test_pricing_question_flow(self):
        """Test the full flow for a pricing question."""
        query = "כמה עולה אימון אישי?"
        
        # Detect topics
        topics = detect_query_topics(query)
        assert "pricing" in topics
        
        # Get priorities
        priorities = get_priority_sections_for_query(query)
        assert "pricing" in priorities
        
        # Mock chunks that would be returned
        mock_chunks = [
            {
                "content": "אימון אישי עולה 250 שח",
                "score": 0.92,
                "section_type": "pricing",
                "section_title": "מחירון",
                "source_file": "business.md",
            },
            {
                "content": "אימון ראשון בחינם!",
                "score": 0.88,
                "section_type": "faq",
                "section_title": "FAQ",
                "source_file": "business.md",
            },
        ]
        
        # Format for context
        formatted = format_relevant_chunks(mock_chunks)
        assert "250" in formatted
        assert "בחינם" in formatted
        
        # Calculate confidence
        confidence = calculate_confidence(mock_chunks)
        assert confidence >= 0.8  # Should be high with good scores


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
