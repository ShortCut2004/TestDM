#!/usr/bin/env python3
"""
Seed mock data into Upstash Vector database for testing.

This script creates sample documents for multiple test clients (namespaces).
Run this after setting up your .env file with Upstash credentials.

Usage:
    cd test_new_ai_agent/ai-microservice
    python scripts/seed_mock_data.py
"""

import os
import sys
from pathlib import Path

# Add parent directory to path so we can import services
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env file - handle missing python-dotenv gracefully
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("Note: python-dotenv not installed. Make sure to install dependencies first:")
    print("  pip install -e .")
    print("Or install it directly:")
    print("  pip install python-dotenv")
    print("")
    # Try to load .env manually as fallback
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        print(f"Loading .env from {env_path}")
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip())

from upstash_vector import Index, Vector
from langchain_openai import OpenAIEmbeddings


# ============================================================================
# MOCK DATA - Edit this section to customize test data
# ============================================================================

MOCK_CLIENTS = {
    "fitness-studio-test": {
        "name": "פיט פרו - סטודיו לאימונים",
        "documents": [
            {
                "id": "services-doc",
                "filename": "services.md",
                "content": """# השירותים שלנו

## אימונים אישיים
אימון אישי מותאם לך בדיוק. המאמן שלנו יבנה תוכנית מותאמת אישית.
- משך אימון: 60 דקות
- מחיר: 250 ש"ח לאימון בודד
- חבילת 10 אימונים: 2,000 ש"ח (200 ש"ח לאימון)
- חבילת 20 אימונים: 3,600 ש"ח (180 ש"ח לאימון)

## אימוני קבוצות
אימונים בקבוצות קטנות של עד 8 משתתפים.
- משך אימון: 45 דקות
- מחיר: 80 ש"ח לאימון
- מנוי חודשי ללא הגבלה: 450 ש"ח

## ייעוץ תזונה
פגישת ייעוץ עם דיאטנית קלינית.
- פגישה ראשונה: 350 ש"ח (שעה וחצי)
- פגישת מעקב: 200 ש"ח (45 דקות)
- חבילת 4 פגישות: 800 ש"ח

## אימון היכרות
אימון היכרות ראשון - חינם! בואו להכיר את הסטודיו והמאמנים שלנו.
"""
            },
            {
                "id": "faq-doc",
                "filename": "faq.md",
                "content": """# שאלות נפוצות

## מה צריך להביא לאימון?
ביגוד ספורטיבי נוח, מגבת ובקבוק מים. יש לנו מלתחות עם מקלחות.

## האם יש חניה?
כן, יש חניה חינם ללקוחות הסטודיו בחניון הבניין.

## מהן שעות הפעילות?
ראשון-חמישי: 06:00-22:00
שישי: 06:00-14:00
שבת: סגור

## האם מתאים למתחילים?
בהחלט! כל האימונים מותאמים לרמת הכושר שלך. המאמן יתאים את התוכנית בדיוק בשבילך.

## איך מבטלים אימון?
ביטול עד 24 שעות לפני - ללא חיוב
ביטול פחות מ-24 שעות - חיוב מלא
"""
            }
        ]
    },
    "beauty-salon-test": {
        "name": "ביוטי קווין - מכון יופי",
        "documents": [
            {
                "id": "treatments-doc",
                "filename": "treatments.md",
                "content": """# הטיפולים שלנו

## טיפולי פנים
### טיפול פנים קלאסי
ניקוי עמוק, פילינג ומסכה מזינה.
- משך: 60 דקות
- מחיר: 280 ש"ח

### טיפול אנטי-אייג'ינג
טיפול מתקדם עם סרומים וטכנולוגיה מתקדמת.
- משך: 90 דקות  
- מחיר: 450 ש"ח

## הסרת שיער בלייזר
### אזורים קטנים (שפם, סנטר)
- מחיר לטיפול: 150 ש"ח
- חבילת 6 טיפולים: 750 ש"ח

### רגליים מלאות
- מחיר לטיפול: 600 ש"ח
- חבילת 6 טיפולים: 3,000 ש"ח

## מניקור ופדיקור
### מניקור ג'ל
- מחיר: 120 ש"ח

### פדיקור ספא
- מחיר: 150 ש"ח

### קומבו מניקור + פדיקור
- מחיר: 220 ש"ח
"""
            }
        ]
    },
    "restaurant-test": {
        "name": "מסעדת הים התיכון",
        "documents": [
            {
                "id": "menu-doc",
                "filename": "menu.md",
                "content": """# התפריט שלנו

## מנות פתיחה
- חומוס הבית: 38 ש"ח
- סלט ים תיכוני: 42 ש"ח
- קרפצ'יו סלמון: 58 ש"ח

## מנות עיקריות
### דגים
- פילה דניס בגריל: 98 ש"ח
- סלמון בתנור: 112 ש"ח
- לברק שלם: 145 ש"ח

### בשרים
- שיפודי עוף: 78 ש"ח
- סטייק אנטריקוט: 145 ש"ח
- צלעות טלה: 168 ש"ח

## קינוחים
- קרם ברולה: 42 ש"ח
- פאי תפוחים: 38 ש"ח
- סלט פירות העונה: 36 ש"ח

## שעות פעילות
ראשון-חמישי: 12:00-23:00
שישי: 12:00-16:00
מוצאי שבת: 20:00-23:30

## הזמנת מקום
מומלץ להזמין מקום מראש בטלפון: 03-1234567
"""
            }
        ]
    }
}


# ============================================================================
# SCRIPT LOGIC - Don't edit below unless you know what you're doing
# ============================================================================

def get_credentials():
    """Get Upstash and OpenRouter credentials from environment."""
    upstash_url = os.environ.get("UPSTASH_VECTOR_REST_URL")
    upstash_token = os.environ.get("UPSTASH_VECTOR_REST_TOKEN")
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    
    if not upstash_url or not upstash_token:
        print("ERROR: Upstash credentials not found!")
        print("Make sure UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN are set in your .env file")
        sys.exit(1)
    
    if not openrouter_key:
        print("ERROR: OpenRouter API key not found!")
        print("Make sure OPENROUTER_API_KEY is set in your .env file")
        sys.exit(1)
    
    return upstash_url, upstash_token, openrouter_key


def create_embeddings_client(openrouter_key: str) -> OpenAIEmbeddings:
    """Create OpenAI embeddings client via OpenRouter."""
    return OpenAIEmbeddings(
        model=os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small"),
        openai_api_key=openrouter_key,
        openai_api_base=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        default_headers={
            "HTTP-Referer": "http://localhost",
            "X-Title": "SetterAI Mock Data Seeder",
        },
    )


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    """Simple text chunking by paragraphs."""
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""
    
    for para in paragraphs:
        if len(current_chunk) + len(para) < chunk_size:
            current_chunk += para + "\n\n"
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para + "\n\n"
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks if chunks else [text]


def seed_client_data(index: Index, embeddings: OpenAIEmbeddings, client_id: str, client_data: dict):
    """Seed documents for a single client (namespace)."""
    print(f"\n  Seeding client: {client_data['name']} (namespace: {client_id})")
    
    total_vectors = 0
    
    for doc in client_data["documents"]:
        chunks = chunk_text(doc["content"])
        print(f"    Document '{doc['filename']}': {len(chunks)} chunks")
        
        vectors = []
        for i, chunk in enumerate(chunks):
            embedding = embeddings.embed_query(chunk)
            vector_id = f"{doc['id']}_chunk_{i}"
            
            vectors.append(Vector(
                id=vector_id,
                vector=embedding,
                metadata={
                    "client_id": client_id,
                    "document_id": doc["id"],
                    "filename": doc["filename"],
                    "chunk_index": i,
                    "kind": "document",
                    "content": chunk[:500],  # Store preview in metadata
                },
                data=chunk,  # Full content in data field
            ))
        
        # Upsert in batches
        batch_size = 50
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            index.upsert(vectors=batch, namespace=client_id)
        
        total_vectors += len(vectors)
    
    print(f"    Total vectors: {total_vectors}")
    return total_vectors


def main():
    print("=" * 60)
    print("MOCK DATA SEEDER - Upstash Vector")
    print("=" * 60)
    
    # Get credentials
    upstash_url, upstash_token, openrouter_key = get_credentials()
    print("\nCredentials loaded successfully")
    
    # Initialize clients
    index = Index(url=upstash_url, token=upstash_token)
    embeddings = create_embeddings_client(openrouter_key)
    print("Connected to Upstash Vector")
    
    # Seed each client
    total = 0
    for client_id, client_data in MOCK_CLIENTS.items():
        count = seed_client_data(index, embeddings, client_id, client_data)
        total += count
    
    print("\n" + "=" * 60)
    print(f"DONE! Seeded {total} vectors across {len(MOCK_CLIENTS)} clients")
    print("=" * 60)
    print("\nTest namespaces created:")
    for client_id in MOCK_CLIENTS.keys():
        print(f"  - {client_id}")
    print("\nYou can now test the /dm/respond endpoint with these client_id values.")


if __name__ == "__main__":
    main()
