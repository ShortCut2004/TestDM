import io
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from schemas import UploadResponse, UploadMultipleResponse, FileUploadResult

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentInfo(BaseModel):
    filename: str = Field(..., description="Original filename (e.g., pricing.md)")
    chunk_count: int = Field(default=0, description="Number of chunks stored")
    section_type: str = Field(default="general", description="Detected section type from filename")


class ListDocumentsResponse(BaseModel):
    success: bool
    client_id: str
    documents: List[DocumentInfo] = Field(default_factory=list)
    total_documents: int = Field(default=0)
    message: Optional[str] = None


class DeleteDocumentResponse(BaseModel):
    success: bool
    message: str
    filename: str
    chunks_deleted: int = Field(default=0)


class ResetAllResponse(BaseModel):
    success: bool
    message: str
    namespaces_deleted: List[str] = Field(default_factory=list)
    total_deleted: int = Field(default=0)


@router.delete("/reset-all", response_model=ResetAllResponse)
async def reset_all_documents(request: Request):
    """
    Delete ALL data from the vector store - all clients and their documents.
    
    WARNING: This is destructive and cannot be undone!
    Use with caution - this will delete everything for all clients.
    """
    try:
        vector_service = request.app.state.vector_service

        if not vector_service.is_enabled:
            return ResetAllResponse(
                success=False,
                message="Vector store is not configured",
                namespaces_deleted=[],
                total_deleted=0,
            )

        result = await vector_service.reset_all()

        return ResetAllResponse(
            success=result.get("success", False),
            message=result.get("message", "Unknown error"),
            namespaces_deleted=result.get("namespaces_deleted", []),
            total_deleted=result.get("total_deleted", 0),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resetting vector store: {str(e)}")


@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    request: Request,
    client_id: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Upload a markdown document for a client.
    
    If a file with the same name already exists, it will be replaced (old chunks deleted first).
    This makes it easy to update specific files like pricing.md or faq.md.
    
    Recommended file naming: pricing.md, faq.md, services.md, hours.md, contacts.md, policies.md
    """
    try:
        if not file.filename or not file.filename.lower().endswith(".md"):
            raise HTTPException(status_code=400, detail="Only Markdown (.md) files are supported")

        if not client_id or not client_id.strip():
            raise HTTPException(status_code=400, detail="client_id is required")

        client_id = client_id.strip()
        filename = file.filename.strip()
        
        # Use simple document_id: {client_id}_{filename} - no hash
        # This allows re-uploading the same file to replace it
        document_id = f"{client_id}_{filename}"

        vector_service = request.app.state.vector_service
        
        # Delete existing document with same name first (upsert behavior)
        if vector_service.is_enabled:
            deleted = await vector_service.delete_document(client_id, document_id)
            if deleted > 0:
                print(f"[documents] Replaced existing document '{filename}' ({deleted} chunks removed)")

        content = await file.read()
        document_service = request.app.state.document_service
        chunks_created = await document_service.upload_markdown(
            client_id=client_id,
            filename=filename,
            document_id=document_id,
            md_bytes=io.BytesIO(content),
        )

        return UploadResponse(
            success=True,
            message=f"Successfully processed and stored '{filename}'",
            document_id=document_id,
            chunks_created=chunks_created,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@router.post("/upload-multiple", response_model=UploadMultipleResponse)
async def upload_multiple_documents(
    request: Request,
    client_id: str = Form(...),
    files: List[UploadFile] = File(...),
):
    """
    Upload multiple markdown documents for a client at once.
    
    If a file with the same name already exists, it will be replaced (old chunks deleted first).
    This makes it easy to update specific files like pricing.md or faq.md.
    
    Recommended file naming: pricing.md, faq.md, services.md, hours.md, contacts.md, policies.md
    
    Returns a summary of all uploads with individual success/failure status for each file.
    """
    if not client_id or not client_id.strip():
        raise HTTPException(status_code=400, detail="client_id is required")
    
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="At least one file is required")
    
    client_id = client_id.strip()
    results: List[FileUploadResult] = []
    successful_count = 0
    failed_count = 0
    
    vector_service = request.app.state.vector_service
    document_service = request.app.state.document_service
    
    for file in files:
        try:
            if not file.filename or not file.filename.lower().endswith(".md"):
                results.append(FileUploadResult(
                    filename=file.filename or "unknown",
                    document_id="",
                    chunks_created=0,
                    success=False,
                    error="Only Markdown (.md) files are supported",
                ))
                failed_count += 1
                continue
            
            filename = file.filename.strip()
            document_id = f"{client_id}_{filename}"
            
            # Delete existing document with same name first (upsert behavior)
            if vector_service.is_enabled:
                deleted = await vector_service.delete_document(client_id, document_id)
                if deleted > 0:
                    print(f"[documents] Replaced existing document '{filename}' ({deleted} chunks removed)")
            
            content = await file.read()
            chunks_created = await document_service.upload_markdown(
                client_id=client_id,
                filename=filename,
                document_id=document_id,
                md_bytes=io.BytesIO(content),
            )
            
            results.append(FileUploadResult(
                filename=filename,
                document_id=document_id,
                chunks_created=chunks_created,
                success=True,
                error=None,
            ))
            successful_count += 1
            
        except Exception as e:
            results.append(FileUploadResult(
                filename=file.filename or "unknown",
                document_id="",
                chunks_created=0,
                success=False,
                error=str(e),
            ))
            failed_count += 1
    
    total_files = len(files)
    
    if failed_count == 0:
        message = f"Successfully uploaded all {total_files} file(s)"
    elif successful_count == 0:
        message = f"Failed to upload all {total_files} file(s)"
    else:
        message = f"Uploaded {successful_count} of {total_files} file(s), {failed_count} failed"
    
    return UploadMultipleResponse(
        success=successful_count > 0,
        message=message,
        total_files=total_files,
        successful_files=successful_count,
        failed_files=failed_count,
        results=results,
    )


@router.get("/{client_id}/list", response_model=ListDocumentsResponse)
async def list_client_documents(client_id: str, request: Request):
    """
    List all documents uploaded for a specific client.
    
    Returns a list of documents with their IDs, filenames, and chunk counts.
    """
    try:
        if not client_id or not client_id.strip():
            raise HTTPException(status_code=400, detail="client_id is required")

        client_id = client_id.strip()
        vector_service = request.app.state.vector_service

        if not vector_service.is_enabled:
            return ListDocumentsResponse(
                success=True,
                client_id=client_id,
                documents=[],
                total_documents=0,
                message="Vector store is not configured - no documents available",
            )

        documents = await vector_service.list_documents_detailed(client_id)

        return ListDocumentsResponse(
            success=True,
            client_id=client_id,
            documents=[
                DocumentInfo(
                    filename=doc["filename"],
                    chunk_count=doc["chunk_count"],
                    section_type=doc.get("section_type", "general"),
                )
                for doc in documents
            ],
            total_documents=len(documents),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing documents: {str(e)}")


@router.delete("/{client_id}/{filename:path}", response_model=DeleteDocumentResponse)
async def delete_document(client_id: str, filename: str, request: Request):
    """
    Delete a specific document by filename from the vector store.
    
    Args:
        client_id: The client/tenant ID (e.g., "Skiller")
        filename: The filename to delete (e.g., "pricing.md")
    
    Example: DELETE /documents/Skiller/pricing.md
    """
    try:
        if not client_id or not client_id.strip():
            raise HTTPException(status_code=400, detail="client_id is required")

        if not filename or not filename.strip():
            raise HTTPException(status_code=400, detail="filename is required")

        client_id = client_id.strip()
        filename = filename.strip()
        
        # Reconstruct the document_id from client_id and filename
        document_id = f"{client_id}_{filename}"
        
        vector_service = request.app.state.vector_service

        if not vector_service.is_enabled:
            return DeleteDocumentResponse(
                success=False,
                message="Vector store is not configured",
                filename=filename,
                chunks_deleted=0,
            )

        chunks_deleted = await vector_service.delete_document(client_id, document_id)

        if chunks_deleted == 0:
            return DeleteDocumentResponse(
                success=True,
                message=f"File '{filename}' not found or already deleted",
                filename=filename,
                chunks_deleted=0,
            )

        return DeleteDocumentResponse(
            success=True,
            message=f"Successfully deleted '{filename}' ({chunks_deleted} chunks)",
            filename=filename,
            chunks_deleted=chunks_deleted,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting document: {str(e)}")
