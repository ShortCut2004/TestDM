import asyncio
import os
from typing import BinaryIO, List, Optional

from utils.markdown_parser import (
    parse_markdown_sections,
    merge_small_sections,
    detect_section_type_from_filename,
    SectionType,
    ParsedDocument,
)


class VectorStoreService:
    """
    Vector store service for RAG functionality.
    Works in degraded mode (no RAG) when Upstash credentials are not configured.
    """

    def __init__(self):
        self.index: Optional[object] = None
        self.embeddings: Optional[object] = None
        self._enabled = False

        # Check if Upstash credentials are available
        upstash_url = os.environ.get("UPSTASH_VECTOR_REST_URL")
        upstash_token = os.environ.get("UPSTASH_VECTOR_REST_TOKEN")

        if upstash_url and upstash_token:
            try:
                from upstash_vector import Index

                self.index = Index(url=upstash_url, token=upstash_token)

                openrouter_api_key = os.environ.get("OPENROUTER_API_KEY") or "sk-or-v1-REPLACE_ME"
                if not openrouter_api_key:
                    raise RuntimeError("OPENROUTER_API_KEY is required")

                base_url = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
                referer = os.environ.get("BASE_URL") or os.environ.get("HTTP_REFERER") or "http://localhost"
                title = os.environ.get("X_TITLE") or "SetterAI Microservice"

                from langchain_openai import OpenAIEmbeddings

                self.embeddings = OpenAIEmbeddings(
                    model=os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small"),
                    openai_api_key=openrouter_api_key,
                    openai_api_base=base_url,
                    default_headers={
                        "HTTP-Referer": referer,
                        "X-Title": title,
                    },
                )
                self._enabled = True
                print("[VectorStoreService] Initialized with Upstash vector store")
            except Exception as e:
                print(f"[VectorStoreService] Failed to initialize Upstash: {e}")
                self._enabled = False
        else:
            print("[VectorStoreService] No Upstash credentials found - running in degraded mode (no RAG)")

    @property
    def is_enabled(self) -> bool:
        """Check if vector store is properly configured and enabled."""
        return self._enabled

    async def _embed_query_async(self, text: str) -> list:
        """Run sync LangChain embed_query in a thread pool so concurrent /dm requests don't block the event loop."""
        if not self.embeddings:
            raise RuntimeError("Embeddings not configured")
        return await asyncio.to_thread(self.embeddings.embed_query, text)

    async def process_and_store_markdown(
        self,
        md_content: BinaryIO,
        client_id: str,
        document_id: str,
        filename: str,
    ) -> int:
        """
        Process and store markdown content with intelligent section splitting.
        
        The markdown is automatically split into logical sections based on headings,
        with each section getting metadata for section_type, section_title, etc.
        This enables more precise retrieval (e.g., finding FAQ or Pricing sections).
        
        Backward compatible: single large markdown files are still processed correctly.
        """
        # Return 0 if vector store is not enabled
        if not self._enabled or not self.index or not self.embeddings:
            raise RuntimeError(
                "Vector store is not configured. Set UPSTASH_VECTOR_REST_URL and "
                "UPSTASH_VECTOR_REST_TOKEN environment variables to enable document upload."
            )

        from upstash_vector import Vector

        # Read markdown content directly from bytes
        content_bytes = md_content.read()
        try:
            markdown_text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            markdown_text = content_bytes.decode("utf-8", errors="replace")

        if not markdown_text.strip():
            return 0

        # Detect section type from filename (e.g., pricing.md -> PRICING)
        file_section_type = detect_section_type_from_filename(filename)
        
        # Use the markdown parser to split into chunks by size
        parsed_doc = parse_markdown_sections(
            markdown_text=markdown_text,
            source_file=filename,
            max_chunk_size=1500,
        )
        
        # Optionally merge very small sections
        parsed_doc = merge_small_sections(parsed_doc, min_chunk_size=150)
        
        if not parsed_doc.sections:
            return 0

        vectors_to_upsert = []

        for section in parsed_doc.sections:
            embedding = await self._embed_query_async(section.content)
            chunk_id = f"{document_id}_chunk_{section.chunk_index}"

            # Use filename-based section type as primary, fall back to heading-based
            # This ensures pricing.md chunks are all tagged as "pricing" regardless of headings
            effective_section_type = file_section_type if file_section_type != SectionType.GENERAL else section.section_type

            # Build enhanced metadata with section type for filtering
            metadata = {
                # Core identifiers
                "client_id": client_id,
                "document_id": document_id,
                "namespace": client_id,
                
                # Source tracking
                "source_file": filename,
                "filename": filename,  # Keep for backward compatibility
                "upload_id": parsed_doc.upload_id,
                
                # Section metadata for improved retrieval
                # Use filename-derived section type as primary
                "section_title": section.title,
                "section_type": effective_section_type.value,
                "heading_level": section.level,
                "parent_section": section.parent_title or "",
                "chunk_index": section.chunk_index,
                
                # Content preview for quick access
                "content": section.content[:500],
                "kind": "document",
            }

            vectors_to_upsert.append(
                Vector(
                    id=chunk_id,
                    vector=embedding,
                    metadata=metadata,
                    data=section.content,
                )
            )

        batch_size = 100
        for i in range(0, len(vectors_to_upsert), batch_size):
            batch = vectors_to_upsert[i:i + batch_size]
            self.index.upsert(vectors=batch, namespace=client_id)

        # Log section breakdown for debugging
        section_types = {}
        for section in parsed_doc.sections:
            st = section.section_type.value
            section_types[st] = section_types.get(st, 0) + 1
        print(f"[VectorStoreService] Stored {len(vectors_to_upsert)} chunks for {filename}: {section_types}")

        return len(vectors_to_upsert)

    async def search_relevant_context(
        self,
        query: str,
        client_id: str,
        top_k: int = 5,
        section_type_filter: Optional[str] = None,
    ) -> List[dict]:
        """
        Search for relevant context in the vector store.
        
        Args:
            query: The search query
            client_id: Client namespace to search in
            top_k: Number of results to return
            section_type_filter: Optional filter by section type (e.g., "pricing", "faq")
        
        Returns:
            List of relevant chunks with content, score, and metadata
        """
        # Return empty results if vector store is not enabled
        if not self._enabled or not self.index or not self.embeddings:
            return []

        query_embedding = await self._embed_query_async(query)

        # Build filter if section_type is specified
        filter_str = None
        if section_type_filter:
            filter_str = f"section_type = '{section_type_filter}'"

        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            include_data=True,
            namespace=client_id,
            filter=filter_str,
        )

        relevant_chunks = []
        seen_content = set()  # Deduplicate similar content
        
        for result in results:
            content = result.data if result.data else result.metadata.get("content", "")
            
            # Skip near-duplicate content
            content_hash = hash(content[:200]) if content else 0
            if content_hash in seen_content:
                continue
            seen_content.add(content_hash)
            
            relevant_chunks.append(
                {
                    "content": content,
                    "score": result.score,
                    "filename": result.metadata.get("filename", "unknown"),
                    "source_file": result.metadata.get("source_file", result.metadata.get("filename", "unknown")),
                    "section_title": result.metadata.get("section_title", ""),
                    "section_type": result.metadata.get("section_type", "general"),
                    "parent_section": result.metadata.get("parent_section", ""),
                    "document_id": result.metadata.get("document_id", ""),
                    "chunk_index": result.metadata.get("chunk_index", 0),
                    "kind": result.metadata.get("kind", "document"),
                }
            )

        return relevant_chunks

    async def search_with_section_priority(
        self,
        query: str,
        client_id: str,
        top_k: int = 5,
        priority_sections: Optional[List[str]] = None,
    ) -> List[dict]:
        """
        Search with priority given to specific section types.
        
        Useful when you want to prefer FAQ/Pricing answers over general content.
        Does a weighted search that boosts results from priority sections.
        
        Args:
            query: The search query
            client_id: Client namespace to search in
            top_k: Number of results to return
            priority_sections: List of section types to prioritize (e.g., ["faq", "pricing"])
        
        Returns:
            List of relevant chunks, with priority sections ranked higher
        """
        if not priority_sections:
            return await self.search_relevant_context(query, client_id, top_k)
        
        # First, search in priority sections
        priority_results = []
        for section_type in priority_sections:
            section_results = await self.search_relevant_context(
                query=query,
                client_id=client_id,
                top_k=2,  # Get top 2 from each priority section
                section_type_filter=section_type,
            )
            # Boost priority section scores slightly
            for r in section_results:
                r["score"] = min(r["score"] * 1.15, 1.0)  # 15% boost, cap at 1.0
            priority_results.extend(section_results)
        
        # Then do a general search
        general_results = await self.search_relevant_context(
            query=query,
            client_id=client_id,
            top_k=top_k,
        )
        
        # Combine and deduplicate
        all_results = priority_results + general_results
        seen_chunks = set()
        deduplicated = []
        
        for result in all_results:
            chunk_key = (result["document_id"], result["chunk_index"])
            if chunk_key not in seen_chunks:
                seen_chunks.add(chunk_key)
                deduplicated.append(result)
        
        # Sort by score and return top_k
        deduplicated.sort(key=lambda x: x["score"], reverse=True)
        return deduplicated[:top_k]

    async def delete_client_documents(self, client_id: str):
        """
        Delete all documents for a client by deleting their namespace.
        Note: The default namespace (empty string) cannot be deleted.
        """
        if not self._enabled or not self.index:
            return
        
        # Use the correct Upstash Vector SDK method to delete a namespace
        # This removes all vectors within that namespace
        if client_id and client_id.strip():
            self.index.delete_namespace(client_id)

    async def reset_all(self) -> dict:
        """
        Delete ALL data from the vector store - all clients and their documents.
        
        WARNING: This is destructive and cannot be undone!
        
        Returns:
            Dict with namespaces_deleted count and details
        """
        if not self._enabled or not self.index:
            return {"success": False, "message": "Vector store is not configured"}
        
        try:
            # Get index info to find all namespaces
            info = self.index.info()
            namespaces = []
            
            # Extract namespace information
            if hasattr(info, 'namespaces') and info.namespaces:
                namespaces = list(info.namespaces.keys())
            
            deleted_namespaces = []
            
            # Delete each namespace (except default empty namespace)
            for ns in namespaces:
                if ns and ns.strip():  # Skip empty/default namespace
                    try:
                        self.index.delete_namespace(ns)
                        deleted_namespaces.append(ns)
                        print(f"[VectorStoreService] Deleted namespace: {ns}")
                    except Exception as e:
                        print(f"[VectorStoreService] Failed to delete namespace {ns}: {e}")
            
            # Also reset the default namespace by deleting all vectors in it
            try:
                # Use reset to clear all data including default namespace
                self.index.reset()
                print("[VectorStoreService] Reset entire index")
            except Exception as e:
                print(f"[VectorStoreService] Reset failed, trying manual cleanup: {e}")
            
            return {
                "success": True,
                "namespaces_deleted": deleted_namespaces,
                "total_deleted": len(deleted_namespaces),
                "message": f"Successfully deleted {len(deleted_namespaces)} client namespaces and reset index",
            }
        except Exception as e:
            print(f"[VectorStoreService] Error resetting vector store: {e}")
            return {"success": False, "message": str(e)}

    async def create_client_namespace(
        self, 
        client_id: str, 
        client_name: str = "",
        client_gmail: str = "",
        business_name: str = "",
    ) -> bool:
        """
        Create a client namespace by inserting a marker vector.
        
        Upstash Vector namespaces are created implicitly only on first write,
        so we insert a small marker to ensure the namespace exists and appears
        in index.info().namespaces listings.
        
        Args:
            client_id: The client namespace ID (typically tenant_<uuid>)
            client_name: Optional human-readable name for the client
            client_gmail: Optional Gmail address for the client
            business_name: Optional business name for the client
            
        Returns:
            True if namespace was created successfully
        """
        if not self._enabled or not self.index or not self.embeddings:
            raise RuntimeError("Vector store is not configured")
        
        from upstash_vector import Vector
        
        # Create a simple marker embedding for the namespace initialization
        marker_text = f"Client namespace initialized for {client_name or business_name or client_id}"
        marker_embedding = await self._embed_query_async(marker_text)
        
        marker_vector = Vector(
            id=f"{client_id}_namespace_marker",
            vector=marker_embedding,
            metadata={
                "client_id": client_id,
                "client_name": client_name or client_id,
                "client_gmail": client_gmail or "",
                "business_name": business_name or "",
                "namespace": client_id,
                "kind": "namespace_marker",
                "content": marker_text,
            },
            data=marker_text,
        )
        
        self.index.upsert(vectors=[marker_vector], namespace=client_id)
        print(f"[VectorStoreService] Created namespace for client: {client_id} (gmail: {client_gmail}, business: {business_name})")
        return True

    async def list_client_documents(self, client_id: str) -> List[dict]:
        """List documents stored for a client."""
        if not self._enabled or not self.index:
            return [{"note": "Vector store is not configured - no documents available"}]
        try:
            info = self.index.info()
            return [
                {
                    "namespace": client_id,
                    "total_vectors": info.total_vector_count if hasattr(info, "total_vector_count") else "unknown",
                    "note": "For detailed document list, maintain a separate document registry",
                }
            ]
        except Exception:
            return []

    async def list_documents_detailed(self, client_id: str) -> List[dict]:
        """
        List all documents for a client with detailed information.
        
        Groups vectors by document_id and returns document metadata.
        Uses Upstash Vector's range method to iterate through all vectors.
        """
        if not self._enabled or not self.index:
            return []
        
        try:
            # Use range to iterate through all vectors in the namespace
            # This is more reliable than using a dummy query vector
            documents: dict = {}
            cursor = "0"
            
            while cursor:
                # Range through vectors in the namespace
                range_result = self.index.range(
                    cursor=cursor,
                    limit=100,
                    include_metadata=True,
                    include_data=False,
                    namespace=client_id,
                )
                
                # Process vectors in this batch
                vectors = range_result.vectors if hasattr(range_result, 'vectors') else []
                for vector in vectors:
                    metadata = vector.metadata or {}
                    
                    # Skip namespace marker vectors (they're just for namespace initialization)
                    if metadata.get("kind") == "namespace_marker":
                        continue
                    
                    doc_id = metadata.get("document_id", "unknown")
                    filename = metadata.get("filename") or metadata.get("source_file", "unknown")
                    section_type = metadata.get("section_type", "general")
                    
                    if doc_id not in documents:
                        documents[doc_id] = {
                            "document_id": doc_id,
                            "filename": filename,
                            "section_type": section_type,
                            "chunk_count": 0,
                        }
                    documents[doc_id]["chunk_count"] += 1
                
                # Get next cursor, stop if no more results
                next_cursor = range_result.next_cursor if hasattr(range_result, 'next_cursor') else ""
                if not next_cursor or next_cursor == cursor or next_cursor == "0":
                    break
                cursor = next_cursor
            
            return list(documents.values())
        except Exception as e:
            print(f"[VectorStoreService] Error listing documents: {e}")
            return []

    async def delete_document(self, client_id: str, document_id: str) -> int:
        """
        Delete a specific document and all its chunks from the vector store.
        
        Args:
            client_id: The client namespace
            document_id: The document ID to delete
            
        Returns:
            Number of chunks deleted
        """
        if not self._enabled or not self.index:
            return 0
        
        try:
            # Use range to find all vectors belonging to this document
            vector_ids = []
            cursor = "0"
            
            while cursor:
                range_result = self.index.range(
                    cursor=cursor,
                    limit=100,
                    include_metadata=True,
                    include_data=False,
                    namespace=client_id,
                )
                
                vectors = range_result.vectors if hasattr(range_result, 'vectors') else []
                for vector in vectors:
                    metadata = vector.metadata or {}
                    if metadata.get("document_id") == document_id:
                        vector_ids.append(vector.id)
                
                next_cursor = range_result.next_cursor if hasattr(range_result, 'next_cursor') else ""
                if not next_cursor or next_cursor == cursor or next_cursor == "0":
                    break
                cursor = next_cursor
            
            if not vector_ids:
                return 0
            
            # Delete vectors in batches
            batch_size = 100
            for i in range(0, len(vector_ids), batch_size):
                batch = vector_ids[i:i + batch_size]
                self.index.delete(ids=batch, namespace=client_id)
            
            print(f"[VectorStoreService] Deleted {len(vector_ids)} chunks for document {document_id}")
            return len(vector_ids)
        except Exception as e:
            print(f"[VectorStoreService] Error deleting document {document_id}: {e}")
            return 0

    async def find_client_by_gmail(self, gmail: str) -> Optional[dict]:
        """
        Find a client by their Gmail address.
        
        Searches through all namespace markers to find a matching gmail.
        
        Args:
            gmail: The Gmail address to search for
            
        Returns:
            Client info dict if found, None otherwise
        """
        if not self._enabled or not self.index:
            return None
        
        try:
            # Get all namespaces
            info = self.index.info()
            namespaces = []
            
            if hasattr(info, 'namespaces') and info.namespaces:
                namespaces = list(info.namespaces.keys())
            
            for ns in namespaces:
                if not ns or not ns.strip():
                    continue
                
                # Try to fetch the namespace marker
                try:
                    marker_id = f"{ns}_namespace_marker"
                    result = self.index.fetch(ids=[marker_id], namespace=ns, include_metadata=True)
                    
                    if result and len(result) > 0:
                        marker = result[0]
                        metadata = marker.metadata or {}
                        
                        if metadata.get("client_gmail", "").lower() == gmail.lower():
                            ns_info = info.namespaces.get(ns, {})
                            vector_count = ns_info.vector_count if hasattr(ns_info, 'vector_count') else 0
                            
                            return {
                                "client_id": ns,
                                "client_name": metadata.get("client_name", ""),
                                "client_gmail": metadata.get("client_gmail", ""),
                                "business_name": metadata.get("business_name", ""),
                                "vector_count": vector_count,
                            }
                except Exception as e:
                    print(f"[VectorStoreService] Warning: Could not check namespace {ns}: {e}")
                    continue
            
            return None
        except Exception as e:
            print(f"[VectorStoreService] Error finding client by gmail: {e}")
            return None

    async def find_client_by_business_name(self, business_name: str) -> Optional[dict]:
        """
        Find a client by their business name.
        
        Searches through all namespace markers to find a matching business name.
        Case-insensitive partial match.
        
        Args:
            business_name: The business name to search for
            
        Returns:
            Client info dict if found, None otherwise
        """
        if not self._enabled or not self.index:
            return None
        
        try:
            # Get all namespaces
            info = self.index.info()
            namespaces = []
            
            if hasattr(info, 'namespaces') and info.namespaces:
                namespaces = list(info.namespaces.keys())
            
            search_term = business_name.lower().strip()
            
            for ns in namespaces:
                if not ns or not ns.strip():
                    continue
                
                # Try to fetch the namespace marker
                try:
                    marker_id = f"{ns}_namespace_marker"
                    result = self.index.fetch(ids=[marker_id], namespace=ns, include_metadata=True)
                    
                    if result and len(result) > 0:
                        marker = result[0]
                        metadata = marker.metadata or {}
                        
                        stored_business = metadata.get("business_name", "").lower().strip()
                        
                        # Exact match or contains match
                        if stored_business == search_term or search_term in stored_business:
                            ns_info = info.namespaces.get(ns, {})
                            vector_count = ns_info.vector_count if hasattr(ns_info, 'vector_count') else 0
                            
                            return {
                                "client_id": ns,
                                "client_name": metadata.get("client_name", ""),
                                "client_gmail": metadata.get("client_gmail", ""),
                                "business_name": metadata.get("business_name", ""),
                                "vector_count": vector_count,
                            }
                except Exception as e:
                    print(f"[VectorStoreService] Warning: Could not check namespace {ns}: {e}")
                    continue
            
            return None
        except Exception as e:
            print(f"[VectorStoreService] Error finding client by business name: {e}")
            return None

    async def get_client_info(self, client_id: str) -> Optional[dict]:
        """
        Get full client info from their namespace marker.
        
        Args:
            client_id: The client namespace ID
            
        Returns:
            Client info dict if found, None otherwise
        """
        if not self._enabled or not self.index:
            return None
        
        try:
            marker_id = f"{client_id}_namespace_marker"
            result = self.index.fetch(ids=[marker_id], namespace=client_id, include_metadata=True)
            
            if result and len(result) > 0:
                marker = result[0]
                metadata = marker.metadata or {}
                
                info = self.index.info()
                ns_info = info.namespaces.get(client_id, {}) if hasattr(info, 'namespaces') else {}
                vector_count = ns_info.vector_count if hasattr(ns_info, 'vector_count') else 0
                
                return {
                    "client_id": client_id,
                    "client_name": metadata.get("client_name", ""),
                    "client_gmail": metadata.get("client_gmail", ""),
                    "business_name": metadata.get("business_name", ""),
                    "vector_count": vector_count,
                }
            
            return None
        except Exception as e:
            print(f"[VectorStoreService] Error getting client info: {e}")
            return None
