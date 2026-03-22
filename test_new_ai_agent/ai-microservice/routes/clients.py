from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from schemas import CreateClientRequest, CreateClientResponse, ListClientsResponse, ClientInfo, ClientDocument

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientLookupResponse(BaseModel):
    success: bool
    message: str
    client: Optional[ClientInfo] = None


@router.get("", response_model=ListClientsResponse)
async def list_all_clients(request: Request):
    """
    List all clients in the vector database.
    
    Returns a list of all client namespaces with their document counts and file information.
    This is useful for admin purposes to see which clients have data stored.
    """
    try:
        vector_service = request.app.state.vector_service
        
        if not vector_service.is_enabled:
            return ListClientsResponse(
                success=True,
                message="Vector store is not configured. No clients available.",
                clients=[],
                total_clients=0,
                rag_enabled=False,
            )
        
        # Get all namespaces from the vector store
        index = vector_service.index
        info = index.info()
        
        clients = []
        namespaces = []
        
        # Extract namespace information from index info
        if hasattr(info, 'namespaces') and info.namespaces:
            namespaces = list(info.namespaces.keys())
        
        for ns in namespaces:
            if not ns or not ns.strip():  # Skip empty/default namespace
                continue
            
            # Get document details for this client
            try:
                documents = await vector_service.list_documents_detailed(ns)
                doc_list = [
                    ClientDocument(
                        document_id=doc.get("document_id", "unknown"),
                        filename=doc.get("filename", "unknown"),
                        section_type=doc.get("section_type", "general"),
                        chunk_count=doc.get("chunk_count", 0),
                    )
                    for doc in documents
                ]
                
                # Get vector count for this namespace
                ns_info = info.namespaces.get(ns, {})
                vector_count = ns_info.vector_count if hasattr(ns_info, 'vector_count') else 0
                
                # Get client metadata from namespace marker
                client_info = await vector_service.get_client_info(ns)
                
                clients.append(ClientInfo(
                    client_id=ns,
                    client_gmail=client_info.get("client_gmail", "") if client_info else "",
                    business_name=client_info.get("business_name", "") if client_info else "",
                    vector_count=vector_count,
                    documents=doc_list,
                ))
            except Exception as e:
                print(f"[Clients] Warning: Could not get details for namespace {ns}: {e}")
                clients.append(ClientInfo(
                    client_id=ns,
                    vector_count=0,
                    documents=[],
                ))
        
        return ListClientsResponse(
            success=True,
            message=f"Found {len(clients)} clients in the vector database",
            clients=clients,
            total_clients=len(clients),
            rag_enabled=True,
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing clients: {str(e)}")


@router.get("/by-gmail/{gmail}", response_model=ClientLookupResponse)
async def get_client_by_gmail(gmail: str, request: Request):
    """
    Find a client by their Gmail address.
    
    Returns the client info if found, or a not found message.
    """
    try:
        if not gmail or not gmail.strip():
            raise HTTPException(status_code=400, detail="gmail is required")
        
        gmail = gmail.strip()
        vector_service = request.app.state.vector_service
        
        if not vector_service.is_enabled:
            return ClientLookupResponse(
                success=False,
                message="Vector store is not configured",
                client=None,
            )
        
        client_data = await vector_service.find_client_by_gmail(gmail)
        
        if not client_data:
            return ClientLookupResponse(
                success=True,
                message=f"No client found with gmail: {gmail}",
                client=None,
            )
        
        # Get documents for this client
        documents = await vector_service.list_documents_detailed(client_data["client_id"])
        doc_list = [
            ClientDocument(
                document_id=doc.get("document_id", "unknown"),
                filename=doc.get("filename", "unknown"),
                section_type=doc.get("section_type", "general"),
                chunk_count=doc.get("chunk_count", 0),
            )
            for doc in documents
        ]
        
        return ClientLookupResponse(
            success=True,
            message=f"Found client with gmail: {gmail}",
            client=ClientInfo(
                client_id=client_data["client_id"],
                client_gmail=client_data.get("client_gmail", ""),
                business_name=client_data.get("business_name", ""),
                vector_count=client_data.get("vector_count", 0),
                documents=doc_list,
            ),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error finding client by gmail: {str(e)}")


@router.get("/by-business/{business_name}", response_model=ClientLookupResponse)
async def get_client_by_business_name(business_name: str, request: Request):
    """
    Find a client by their business name.
    
    Performs a case-insensitive search. Returns the client info if found.
    """
    try:
        if not business_name or not business_name.strip():
            raise HTTPException(status_code=400, detail="business_name is required")
        
        business_name = business_name.strip()
        vector_service = request.app.state.vector_service
        
        if not vector_service.is_enabled:
            return ClientLookupResponse(
                success=False,
                message="Vector store is not configured",
                client=None,
            )
        
        client_data = await vector_service.find_client_by_business_name(business_name)
        
        if not client_data:
            return ClientLookupResponse(
                success=True,
                message=f"No client found with business name: {business_name}",
                client=None,
            )
        
        # Get documents for this client
        documents = await vector_service.list_documents_detailed(client_data["client_id"])
        doc_list = [
            ClientDocument(
                document_id=doc.get("document_id", "unknown"),
                filename=doc.get("filename", "unknown"),
                section_type=doc.get("section_type", "general"),
                chunk_count=doc.get("chunk_count", 0),
            )
            for doc in documents
        ]
        
        return ClientLookupResponse(
            success=True,
            message=f"Found client with business name: {business_name}",
            client=ClientInfo(
                client_id=client_data["client_id"],
                client_gmail=client_data.get("client_gmail", ""),
                business_name=client_data.get("business_name", ""),
                vector_count=client_data.get("vector_count", 0),
                documents=doc_list,
            ),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error finding client by business name: {str(e)}")


@router.post("/create", response_model=CreateClientResponse)
async def create_client_namespace(
    request: Request,
    body: CreateClientRequest,
):
    """
    Create a namespace for a new client in the vector store.
    
    This endpoint should be called when a client signs up and pays for the 
    DM automated responses service. It initializes their vector store namespace
    so they can start uploading documents for RAG.
    
    The client_id should be the unique PostgreSQL tenant ID from the main app.
    Optionally includes client_gmail and business_name for identification.
    """
    try:
        client_id = body.client_id.strip()
        
        if not client_id:
            raise HTTPException(status_code=400, detail="client_id is required")
        
        # Get the vector store service from app state
        vector_service = request.app.state.vector_service
        
        # Check if vector store is enabled
        if not vector_service.is_enabled:
            # Return success but note that RAG is not available
            return CreateClientResponse(
                success=True,
                message=f"Client '{client_id}' registered. Note: Vector store is not configured, RAG features will be unavailable.",
                client_id=client_id,
                namespace_created=False,
                rag_enabled=False,
            )
        
        # Create the namespace by inserting a marker vector
        # Upstash Vector namespaces are created implicitly only on first write,
        # so we insert a small marker to ensure the namespace exists and appears in listings
        try:
            await vector_service.create_client_namespace(
                client_id=client_id,
                client_name=body.client_name or client_id,
                client_gmail=body.client_gmail or "",
                business_name=body.business_name or "",
            )
            
            return CreateClientResponse(
                success=True,
                message=f"Client namespace '{client_id}' created and ready for document uploads",
                client_id=client_id,
                namespace_created=True,
                rag_enabled=True,
            )
        except Exception as e:
            # Log but don't fail - namespace will be created on first document upload
            print(f"[Clients] Warning: Could not create namespace for {client_id}: {e}")
            return CreateClientResponse(
                success=True,
                message=f"Client '{client_id}' registered. Namespace will be created on first document upload.",
                client_id=client_id,
                namespace_created=False,
                rag_enabled=True,
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating client namespace: {str(e)}")


@router.delete("/{client_id}", response_model=CreateClientResponse)
async def delete_client_namespace(
    request: Request,
    client_id: str,
):
    """
    Delete all documents and data for a client from the vector store.
    
    This should be called when a client cancels their subscription or 
    requests data deletion.
    """
    try:
        if not client_id or not client_id.strip():
            raise HTTPException(status_code=400, detail="client_id is required")
        
        client_id = client_id.strip()
        vector_service = request.app.state.vector_service
        
        if not vector_service.is_enabled:
            return CreateClientResponse(
                success=True,
                message=f"Client '{client_id}' marked for deletion. Note: Vector store not configured.",
                client_id=client_id,
                namespace_created=False,
                rag_enabled=False,
            )
        
        # Delete all documents in the client's namespace
        await vector_service.delete_client_documents(client_id)
        
        return CreateClientResponse(
            success=True,
            message=f"All documents deleted for client '{client_id}'",
            client_id=client_id,
            namespace_created=False,
            rag_enabled=True,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting client data: {str(e)}")
