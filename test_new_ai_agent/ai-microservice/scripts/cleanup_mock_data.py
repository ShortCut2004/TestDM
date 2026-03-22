#!/usr/bin/env python3
"""
Clean up mock data from Upstash Vector database.

This script removes all test data created by seed_mock_data.py.
Run this to clean up test data and avoid junk in your database.

Usage:
    cd test_new_ai_agent/ai-microservice
    python scripts/cleanup_mock_data.py
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

from upstash_vector import Index


# Test namespaces to clean up (must match seed_mock_data.py)
TEST_NAMESPACES = [
    "fitness-studio-test",
    "beauty-salon-test", 
    "restaurant-test",
]


def get_credentials():
    """Get Upstash credentials from environment."""
    upstash_url = os.environ.get("UPSTASH_VECTOR_REST_URL")
    upstash_token = os.environ.get("UPSTASH_VECTOR_REST_TOKEN")
    
    if not upstash_url or not upstash_token:
        print("ERROR: Upstash credentials not found!")
        print("Make sure UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN are set in your .env file")
        sys.exit(1)
    
    return upstash_url, upstash_token


def cleanup_namespace(index: Index, namespace: str):
    """Delete all vectors in a namespace."""
    try:
        index.delete(delete_all=True, namespace=namespace)
        print(f"  Cleaned: {namespace}")
        return True
    except Exception as e:
        print(f"  Error cleaning {namespace}: {e}")
        return False


def main():
    print("=" * 60)
    print("MOCK DATA CLEANUP - Upstash Vector")
    print("=" * 60)
    
    # Confirm before proceeding
    print(f"\nThis will DELETE all vectors in these test namespaces:")
    for ns in TEST_NAMESPACES:
        print(f"  - {ns}")
    
    response = input("\nAre you sure? (yes/no): ").strip().lower()
    if response != "yes":
        print("Cancelled.")
        sys.exit(0)
    
    # Get credentials
    upstash_url, upstash_token = get_credentials()
    print("\nCredentials loaded successfully")
    
    # Initialize client
    index = Index(url=upstash_url, token=upstash_token)
    print("Connected to Upstash Vector\n")
    
    # Clean each namespace
    cleaned = 0
    for namespace in TEST_NAMESPACES:
        if cleanup_namespace(index, namespace):
            cleaned += 1
    
    print("\n" + "=" * 60)
    print(f"DONE! Cleaned {cleaned}/{len(TEST_NAMESPACES)} namespaces")
    print("=" * 60)


if __name__ == "__main__":
    main()
