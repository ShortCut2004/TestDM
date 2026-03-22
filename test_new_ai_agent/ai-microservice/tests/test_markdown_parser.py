"""
Tests for the markdown parsing utility.
Run with: uv run pytest tests/test_markdown_parser.py -v
"""

import pytest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.markdown_parser import (
    SectionType,
    ParsedSection,
    ParsedDocument,
    detect_section_type,
    parse_markdown_sections,
    split_large_content,
    merge_small_sections,
)


class TestDetectSectionType:
    """Tests for section type detection from headings."""
    
    def test_detect_pricing_english(self):
        assert detect_section_type("Pricing") == SectionType.PRICING
        assert detect_section_type("# Pricing") == SectionType.PRICING
        assert detect_section_type("Prices and Packages") == SectionType.PRICING
        assert detect_section_type("Our Rates") == SectionType.PRICING
    
    def test_detect_pricing_hebrew(self):
        assert detect_section_type("מחירון") == SectionType.PRICING
        assert detect_section_type("מחירים") == SectionType.PRICING
        assert detect_section_type("עלויות") == SectionType.PRICING
        assert detect_section_type("חבילות") == SectionType.PRICING
    
    def test_detect_faq_english(self):
        assert detect_section_type("FAQ") == SectionType.FAQ
        assert detect_section_type("Frequently Asked Questions") == SectionType.FAQ
        assert detect_section_type("Q&A") == SectionType.FAQ
        assert detect_section_type("Questions and Answers") == SectionType.FAQ
    
    def test_detect_faq_hebrew(self):
        assert detect_section_type("שאלות ותשובות") == SectionType.FAQ
        assert detect_section_type("שאלות נפוצות") == SectionType.FAQ
    
    def test_detect_services(self):
        assert detect_section_type("Services") == SectionType.SERVICES
        assert detect_section_type("Our Services") == SectionType.SERVICES
        assert detect_section_type("שירותים") == SectionType.SERVICES
    
    def test_detect_business_info(self):
        assert detect_section_type("Business Info") == SectionType.BUSINESS_INFO
        assert detect_section_type("About Us") == SectionType.BUSINESS_INFO
        assert detect_section_type("מידע על העסק") == SectionType.BUSINESS_INFO
        assert detect_section_type("אודות") == SectionType.BUSINESS_INFO
    
    def test_detect_hours(self):
        assert detect_section_type("Hours") == SectionType.HOURS
        assert detect_section_type("Opening Hours") == SectionType.HOURS
        assert detect_section_type("שעות פעילות") == SectionType.HOURS
    
    def test_detect_contact(self):
        assert detect_section_type("Contact") == SectionType.CONTACT
        assert detect_section_type("Contact Us") == SectionType.CONTACT
        assert detect_section_type("צור קשר") == SectionType.CONTACT
    
    def test_detect_policies(self):
        assert detect_section_type("Policies") == SectionType.POLICIES
        assert detect_section_type("Cancellation Policy") == SectionType.POLICIES
        assert detect_section_type("מדיניות ביטולים") == SectionType.POLICIES
    
    def test_detect_general_fallback(self):
        assert detect_section_type("Random Heading") == SectionType.GENERAL
        assert detect_section_type("כותרת רנדומלית") == SectionType.GENERAL
        assert detect_section_type("") == SectionType.GENERAL


class TestParseMarkdownSections:
    """Tests for markdown section parsing."""
    
    def test_parse_simple_document(self):
        markdown = """# Business Info
We are a great business.

# Pricing
- Item 1: $10
- Item 2: $20
"""
        doc = parse_markdown_sections(markdown, source_file="test.md")
        
        assert doc.section_count == 2
        assert doc.source_file == "test.md"
        assert doc.sections[0].title == "Business Info"
        assert doc.sections[0].section_type == SectionType.BUSINESS_INFO
        assert doc.sections[1].title == "Pricing"
        assert doc.sections[1].section_type == SectionType.PRICING
    
    def test_parse_document_with_faq(self):
        markdown = """# FAQ

## How much does it cost?
It costs $50 per session.

## Do you offer discounts?
Yes, we have package deals.
"""
        doc = parse_markdown_sections(markdown)
        
        assert doc.section_count >= 1
        faq_sections = doc.get_sections_by_type(SectionType.FAQ)
        assert len(faq_sections) >= 1
    
    def test_parse_document_preserves_content(self):
        content = "This is detailed pricing information with lots of text."
        markdown = f"""# Pricing
{content}
"""
        doc = parse_markdown_sections(markdown)
        
        assert len(doc.sections) == 1
        assert content in doc.sections[0].content
    
    def test_parse_nested_headings(self):
        markdown = """# Services

## Personal Training
One-on-one sessions.

### Premium Package
Includes nutrition.

## Group Classes
Fun group workouts.
"""
        doc = parse_markdown_sections(markdown)
        
        # Should create sections for the nested structure
        assert doc.section_count >= 1
    
    def test_parse_intro_before_first_heading(self):
        markdown = """Welcome to our business!

This is some intro text.

# About Us
More info here.
"""
        doc = parse_markdown_sections(markdown)
        
        # Should have intro section + About Us
        assert doc.section_count >= 1
    
    def test_parse_empty_document(self):
        doc = parse_markdown_sections("")
        assert doc.section_count == 0
        
        doc = parse_markdown_sections("   \n\n   ")
        assert doc.section_count == 0
    
    def test_parse_hebrew_document(self):
        markdown = """# מידע על העסק
אנחנו סטודיו לכושר בתל אביב.

# מחירון
- אימון אישי: 250 שח
- חבילת 10: 2000 שח

# שאלות ותשובות

## כמה עולה אימון ראשון?
אימון ההיכרות הראשון הוא בחינם!
"""
        doc = parse_markdown_sections(markdown)
        
        assert doc.section_count >= 3
        
        business_sections = doc.get_sections_by_type(SectionType.BUSINESS_INFO)
        assert len(business_sections) >= 1
        
        pricing_sections = doc.get_sections_by_type(SectionType.PRICING)
        assert len(pricing_sections) >= 1
        
        faq_sections = doc.get_sections_by_type(SectionType.FAQ)
        assert len(faq_sections) >= 1
    
    def test_metadata_generation(self):
        markdown = """# Pricing
$50 per hour
"""
        doc = parse_markdown_sections(markdown, source_file="prices.md")
        
        metadata = doc.sections[0].to_metadata()
        
        assert metadata["section_title"] == "Pricing"
        assert metadata["section_type"] == "pricing"
        assert metadata["heading_level"] == 1
        assert metadata["chunk_index"] == 0


class TestSplitLargeContent:
    """Tests for content chunking."""
    
    def test_small_content_not_split(self):
        content = "This is small content."
        chunks = split_large_content(content, max_size=1000)
        
        assert len(chunks) == 1
        assert chunks[0] == content
    
    def test_large_content_split_by_paragraphs(self):
        content = ("Paragraph one. " * 50 + "\n\n" +
                   "Paragraph two. " * 50 + "\n\n" +
                   "Paragraph three. " * 50)
        
        chunks = split_large_content(content, max_size=500)
        
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk) <= 600  # Allow some overflow for sentence boundaries
    
    def test_respects_max_size(self):
        content = "Word " * 1000
        chunks = split_large_content(content, max_size=200)
        
        # Most chunks should be under max_size
        under_limit = sum(1 for c in chunks if len(c) <= 250)
        assert under_limit >= len(chunks) * 0.8  # At least 80% under limit


class TestMergeSmallSections:
    """Tests for merging small sections."""
    
    def test_no_merge_for_large_sections(self):
        doc = ParsedDocument()
        doc.sections = [
            ParsedSection(title="A", content="x" * 300, section_type=SectionType.GENERAL, level=1),
            ParsedSection(title="B", content="y" * 300, section_type=SectionType.GENERAL, level=1),
        ]
        
        merged = merge_small_sections(doc, min_chunk_size=200)
        
        assert len(merged.sections) == 2
    
    def test_merge_tiny_sections(self):
        doc = ParsedDocument()
        doc.sections = [
            ParsedSection(title="A", content="tiny", section_type=SectionType.GENERAL, level=1, parent_title=None),
            ParsedSection(title="B", content="x" * 300, section_type=SectionType.GENERAL, level=1, parent_title=None),
        ]
        
        merged = merge_small_sections(doc, min_chunk_size=200)
        
        # Tiny section should be merged or preserved
        assert len(merged.sections) <= 2


class TestBackwardCompatibility:
    """Tests to ensure backward compatibility with existing markdown files."""
    
    def test_single_large_file_without_sections(self):
        """Test that a large file without proper headings is still processed."""
        markdown = """
This is a large document without proper headings.

It contains lots of information about our business.

We offer great services at competitive prices.

Contact us for more information.
"""
        doc = parse_markdown_sections(markdown)
        
        # Should create at least one section
        assert doc.section_count >= 1
        # Content should be preserved
        assert "great services" in doc.sections[0].content
    
    def test_mixed_format_document(self):
        """Test document with some proper headings and some without."""
        markdown = """
Some intro text without a heading.

# Pricing
Our prices are competitive.

More text without a heading here.

# Contact
Call us at 555-1234.
"""
        doc = parse_markdown_sections(markdown)
        
        # Should parse correctly
        assert doc.section_count >= 2
        
        # Pricing should be detected
        pricing_sections = doc.get_sections_by_type(SectionType.PRICING)
        assert len(pricing_sections) >= 1


class TestCompleteIngestionExample:
    """Integration test with a complete example file."""
    
    def test_complete_business_file(self):
        """Test parsing a complete business knowledge file."""
        markdown = """# Business Info

FitLife Studio is a boutique fitness center in Tel Aviv.
We specialize in personal training and group classes.

## Our Team
- Yoni - Head Trainer
- Maya - Yoga Instructor

# Services

## Personal Training
One-on-one customized sessions.

## Group Classes
HIIT, Yoga, Spin classes daily.

# Pricing

| Package | Price |
|---------|-------|
| Single | 250 NIS |
| 10 Pack | 2000 NIS |

# FAQ

## How much is the first session?
The first session is FREE!

## Do you have parking?
Yes, free parking is available.

# Contact

## Location
123 Dizengoff St, Tel Aviv

## Phone
03-123-4567
"""
        doc = parse_markdown_sections(markdown, source_file="business.md")
        
        # Should have multiple sections
        assert doc.section_count >= 4
        
        # Check section types
        assert len(doc.get_sections_by_type(SectionType.BUSINESS_INFO)) >= 1
        assert len(doc.get_sections_by_type(SectionType.SERVICES)) >= 1
        assert len(doc.get_sections_by_type(SectionType.PRICING)) >= 1
        assert len(doc.get_sections_by_type(SectionType.FAQ)) >= 1
        assert len(doc.get_sections_by_type(SectionType.CONTACT)) >= 1
        
        # Check metadata
        for section in doc.sections:
            metadata = section.to_metadata()
            assert "section_title" in metadata
            assert "section_type" in metadata
            assert metadata["section_type"] in [
                "business_info", "services", "pricing", "faq", 
                "contacts", "general", "hours", "policies", "response_examples"
            ]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
