"""
Markdown parsing utilities for intelligent document ingestion.
Splits markdown by headings and detects section types for enhanced RAG retrieval.
"""

import re
import uuid
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum


class SectionType(str, Enum):
    """Known section types for improved retrieval filtering."""
    BUSINESS_INFO = "business_info"
    PRICING = "pricing"
    SERVICES = "services"
    FAQ = "faq"
    RESPONSE_EXAMPLES = "response_examples"
    POLICIES = "policies"
    HOURS = "hours"
    CONTACT = "contacts"
    GENERAL = "general"


# Mapping of heading patterns to section types (Hebrew and English)
SECTION_TYPE_PATTERNS: Dict[SectionType, List[str]] = {
    SectionType.BUSINESS_INFO: [
        r"business\s*info", r"about\s*(us|the\s*business)?", r"company\s*info",
        r"מידע\s*(על\s*)?העסק", r"אודות", r"מי\s*אנחנו",
    ],
    SectionType.PRICING: [
        r"pricing", r"prices?", r"costs?", r"rates?", r"packages?", r"plans?",
        r"מחיר(ון|ים)?", r"עלויות?", r"חבילות?", r"תעריפ(ון|ים)?",
    ],
    SectionType.SERVICES: [
        r"services?", r"offerings?", r"what\s*we\s*(do|offer)",
        r"שירות(ים)?", r"מה\s*אנחנו\s*מציע(ים)?",
    ],
    SectionType.FAQ: [
        r"faq", r"frequently\s*asked", r"questions?\s*(and\s*)?answers?", r"q\s*&\s*a",
        r"שאלות\s*(ו?תשובות|נפוצות)", r"ש\"ת",
    ],
    SectionType.RESPONSE_EXAMPLES: [
        r"response\s*examples?", r"sample\s*responses?", r"templates?",
        r"דוגמאות?\s*(תשובות?|תגובות?)?", r"תבניות?\s*תשובה",
    ],
    SectionType.POLICIES: [
        r"polic(y|ies)", r"terms?", r"rules?", r"cancellation", r"refund",
        r"מדיניות", r"תנאים", r"ביטול(ים)?", r"החזר(ים)?",
    ],
    SectionType.HOURS: [
        r"hours?", r"schedule", r"availability", r"when\s*(are\s*)?we\s*open",
        r"שעות?\s*(פעילות|פתיחה)?", r"זמינות", r"מתי\s*פתוח",
    ],
    SectionType.CONTACT: [
        r"contact", r"reach\s*us", r"get\s*in\s*touch", r"location", r"contacts"
        r"צור\s*קשר", r"יצירת?\s*קשר", r"מיקום", r"כתובת",
    ],
}


@dataclass
class ParsedSection:
    """Represents a parsed markdown section with metadata."""
    title: str
    content: str
    section_type: SectionType
    level: int  # Heading level (1 for #, 2 for ##, etc.)
    parent_title: Optional[str] = None
    chunk_index: int = 0
    
    def to_metadata(self) -> Dict[str, Any]:
        """Convert to metadata dict for vector storage."""
        return {
            "section_title": self.title,
            "section_type": self.section_type.value,
            "heading_level": self.level,
            "parent_section": self.parent_title,
            "chunk_index": self.chunk_index,
        }


@dataclass
class ParsedDocument:
    """Represents a fully parsed markdown document."""
    sections: List[ParsedSection] = field(default_factory=list)
    source_file: str = ""
    upload_id: str = field(default_factory=lambda: str(uuid.uuid4())[:12])
    
    @property
    def section_count(self) -> int:
        return len(self.sections)
    
    def get_sections_by_type(self, section_type: SectionType) -> List[ParsedSection]:
        return [s for s in self.sections if s.section_type == section_type]


def detect_section_type(text: str) -> SectionType:
    """
    Detect the section type from text (heading or filename).
    Returns SectionType.GENERAL if no known type matches.
    """
    normalized = text.lower().strip()
    # Remove markdown heading markers and file extensions
    normalized = re.sub(r'^#+\s*', '', normalized)
    normalized = re.sub(r'\.md$', '', normalized)
    
    for section_type, patterns in SECTION_TYPE_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, normalized, re.IGNORECASE):
                return section_type
    
    return SectionType.GENERAL


def detect_section_type_from_filename(filename: str) -> SectionType:
    """
    Detect the section type from a filename.
    
    Examples:
        pricing.md -> PRICING
        faq.md -> FAQ
        services.md -> SERVICES
        hours.md -> HOURS
        contacts.md -> CONTACT
        policies.md -> POLICIES
    """
    return detect_section_type(filename)


def parse_markdown_sections(
    markdown_text: str,
    source_file: str = "unknown",
    upload_id: Optional[str] = None,
    max_chunk_size: int = 1500,
) -> ParsedDocument:
    """
    Parse markdown text into logical sections based on headings.
    
    Args:
        markdown_text: The raw markdown content
        source_file: Original filename for metadata
        upload_id: Optional upload batch ID (auto-generated if not provided)
        max_chunk_size: Maximum characters per chunk before splitting
    
    Returns:
        ParsedDocument containing all parsed sections with metadata
    """
    if not markdown_text or not markdown_text.strip():
        return ParsedDocument(source_file=source_file, upload_id=upload_id or str(uuid.uuid4())[:12])
    
    document = ParsedDocument(
        source_file=source_file,
        upload_id=upload_id or str(uuid.uuid4())[:12],
    )
    
    # Split by top-level headings (# Heading)
    # This regex captures: heading level markers, heading text, and content until next heading
    heading_pattern = r'^(#{1,3})\s+(.+?)$'
    
    lines = markdown_text.split('\n')
    current_section: Optional[Dict[str, Any]] = None
    current_content_lines: List[str] = []
    parent_titles: Dict[int, str] = {}  # Track parent headings by level
    chunk_counter = 0
    
    def finalize_section():
        """Helper to finalize and add current section."""
        nonlocal current_section, current_content_lines, chunk_counter
        
        if current_section is None:
            # Content before first heading - treat as general intro
            if current_content_lines:
                content = '\n'.join(current_content_lines).strip()
                if content:
                    chunks = split_large_content(content, max_chunk_size)
                    for i, chunk in enumerate(chunks):
                        document.sections.append(ParsedSection(
                            title="Introduction",
                            content=chunk,
                            section_type=SectionType.GENERAL,
                            level=0,
                            parent_title=None,
                            chunk_index=chunk_counter,
                        ))
                        chunk_counter += 1
            current_content_lines = []
            return
        
        content = '\n'.join(current_content_lines).strip()
        if content or current_section.get('title'):
            # Include heading in content for context
            full_content = f"# {current_section['title']}\n\n{content}" if content else f"# {current_section['title']}"
            chunks = split_large_content(full_content, max_chunk_size)
            
            for i, chunk in enumerate(chunks):
                document.sections.append(ParsedSection(
                    title=current_section['title'],
                    content=chunk,
                    section_type=current_section['type'],
                    level=current_section['level'],
                    parent_title=current_section.get('parent'),
                    chunk_index=chunk_counter,
                ))
                chunk_counter += 1
        
        current_content_lines = []
    
    for line in lines:
        heading_match = re.match(heading_pattern, line, re.MULTILINE)
        
        if heading_match:
            # Finalize previous section
            finalize_section()
            
            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()
            section_type = detect_section_type(title)
            
            # Track parent hierarchy
            parent_title = None
            if level > 1:
                # Find the nearest parent heading
                for parent_level in range(level - 1, 0, -1):
                    if parent_level in parent_titles:
                        parent_title = parent_titles[parent_level]
                        break
            
            parent_titles[level] = title
            # Clear lower-level parents when we hit a new section at this level
            for l in list(parent_titles.keys()):
                if l > level:
                    del parent_titles[l]
            
            current_section = {
                'title': title,
                'type': section_type,
                'level': level,
                'parent': parent_title,
            }
        else:
            current_content_lines.append(line)
    
    # Finalize the last section
    finalize_section()
    
    return document


def split_large_content(content: str, max_size: int) -> List[str]:
    """
    Split content that exceeds max_size into smaller chunks.
    Tries to split at paragraph boundaries first, then sentences.
    """
    if len(content) <= max_size:
        return [content]
    
    chunks = []
    
    # Try to split by paragraphs first
    paragraphs = re.split(r'\n\n+', content)
    current_chunk = ""
    
    for para in paragraphs:
        if not para.strip():
            continue
            
        if len(current_chunk) + len(para) + 2 <= max_size:
            current_chunk = f"{current_chunk}\n\n{para}" if current_chunk else para
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            
            # If single paragraph is too large, split by sentences
            if len(para) > max_size:
                sentences = re.split(r'(?<=[.!?])\s+', para)
                current_chunk = ""
                for sent in sentences:
                    if len(current_chunk) + len(sent) + 1 <= max_size:
                        current_chunk = f"{current_chunk} {sent}" if current_chunk else sent
                    else:
                        if current_chunk:
                            chunks.append(current_chunk.strip())
                        current_chunk = sent
            else:
                current_chunk = para
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks if chunks else [content[:max_size]]


def merge_small_sections(
    document: ParsedDocument,
    min_chunk_size: int = 200,
) -> ParsedDocument:
    """
    Optionally merge very small sections with their parent or siblings.
    This helps avoid too many tiny chunks in the vector store.
    """
    if len(document.sections) <= 1:
        return document
    
    merged_sections = []
    pending_merge: Optional[ParsedSection] = None
    
    for section in document.sections:
        if pending_merge is not None:
            # Try to merge with current section if they share parent
            if (len(pending_merge.content) < min_chunk_size and 
                section.parent_title == pending_merge.parent_title):
                # Merge pending into current
                merged_content = f"{pending_merge.content}\n\n{section.content}"
                section = ParsedSection(
                    title=section.title,
                    content=merged_content,
                    section_type=section.section_type,
                    level=section.level,
                    parent_title=section.parent_title,
                    chunk_index=section.chunk_index,
                )
                pending_merge = None
            else:
                merged_sections.append(pending_merge)
                pending_merge = None
        
        if len(section.content) < min_chunk_size:
            pending_merge = section
        else:
            merged_sections.append(section)
    
    if pending_merge is not None:
        merged_sections.append(pending_merge)
    
    # Reindex chunks
    for i, section in enumerate(merged_sections):
        section.chunk_index = i
    
    document.sections = merged_sections
    return document
