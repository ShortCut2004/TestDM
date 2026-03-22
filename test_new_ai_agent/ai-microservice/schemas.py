from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str = Field(..., description="Role of the message sender (user/assistant)")
    content: str = Field(..., description="Content of the message")


class TenantProfile(BaseModel):
    name: Optional[str] = None
    businessType: Optional[str] = None
    services: Optional[str] = None
    ownerName: Optional[str] = None
    botGoal: Optional[str] = None
    ctaType: Optional[str] = None
    bookingInstructions: Optional[str] = None
    workingHours: Optional[str] = None
    voiceGreeting: Optional[str] = None
    voiceEnergy: Optional[str] = None
    voicePhrases: Optional[str] = None
    voicePhrasesMale: Optional[str] = None
    voicePhrasesFemale: Optional[str] = None
    voiceEmoji: Optional[str] = None
    voiceLength: Optional[str] = None
    voiceHumor: Optional[str] = None
    voiceAvoid: Optional[str] = None
    voicePersonality: Optional[str] = None
    slangWords: Optional[str] = None
    voiceExamples: Optional[str] = None
    customFlowInstructions: Optional[str] = None


class LeadState(BaseModel):
    entryType: Optional[str] = None
    conversationMode: Optional[str] = None
    qualificationScore: Optional[int] = None
    intent: Optional[str] = None
    gathered: Dict[str, Any] = Field(default_factory=dict)
    bookingLinkSent: Optional[bool] = None
    gender: Optional[str] = None
    genderLocked: Optional[bool] = None
    needsHuman: Optional[bool] = None
    status: Optional[str] = None
    interest: Optional[str] = None
    name: Optional[str] = None


class DMRequest(BaseModel):
    client_id: str = Field(..., description="Unique client/business identifier for namespace filtering")
    system_prompt: str = Field(..., description="Full system prompt built in Node (authoritative, DB-driven)")
    current_message: str = Field(..., description="The current Instagram DM message to respond to")
    conversation_history: List[Message] = Field(default_factory=list)
    sender_name: Optional[str] = Field(default=None, description="Name of the person sending the DM")
    tenant_profile: Optional[TenantProfile] = Field(default=None, description="Minimal tenant configuration snapshot")
    lead_state: Optional[LeadState] = Field(default=None, description="Minimal lead state snapshot")
    locale: Optional[str] = Field(default="he-IL", description="Locale hint (default he-IL)")
    instagram_username: Optional[str] = Field(default=None, description="Instagram @username of the sender")


class DMResponse(BaseModel):
    response: Optional[str] = Field(default=None, description="AI-generated response to send. None means don't send any message (error/timeout)")
    sources_used: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, description="Confidence score of the response (0-1)")
    lead_metadata: Optional[dict] = Field(default=None)
    usage: Optional[dict] = Field(default=None)
    subagent_usage: Optional[List[dict]] = Field(default=None)
    debug: Optional[dict] = Field(default=None)


class UploadResponse(BaseModel):
    success: bool
    message: str
    document_id: str
    chunks_created: int


class FileUploadResult(BaseModel):
    filename: str
    document_id: str
    chunks_created: int
    success: bool
    error: Optional[str] = None


class UploadMultipleResponse(BaseModel):
    success: bool
    message: str
    total_files: int
    successful_files: int
    failed_files: int
    results: List[FileUploadResult] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    version: str


class CreateClientRequest(BaseModel):
    client_id: str = Field(..., description="Unique client identifier (PostgreSQL tenant ID)")
    client_name: Optional[str] = Field(default=None, description="Optional client/business name for logging")
    client_gmail: Optional[str] = Field(default=None, description="Client's Gmail address for identification")
    business_name: Optional[str] = Field(default=None, description="Business name for identification")


class CreateClientResponse(BaseModel):
    success: bool
    message: str
    client_id: str
    namespace_created: bool = Field(..., description="Whether the vector store namespace was created")
    rag_enabled: bool = Field(..., description="Whether RAG features are available for this client")


class ClientDocument(BaseModel):
    document_id: str = Field(..., description="Unique document identifier")
    filename: str = Field(..., description="Original filename of the document")
    section_type: str = Field(default="general", description="Type of content section")
    chunk_count: int = Field(default=0, description="Number of chunks stored for this document")


class ClientInfo(BaseModel):
    client_id: str = Field(..., description="Unique client identifier (namespace)")
    client_gmail: Optional[str] = Field(default=None, description="Client's Gmail address")
    business_name: Optional[str] = Field(default=None, description="Business name")
    vector_count: int = Field(default=0, description="Total number of vectors stored for this client")
    documents: List[ClientDocument] = Field(default_factory=list, description="List of documents uploaded for this client")


class ListClientsResponse(BaseModel):
    success: bool
    message: str
    clients: List[ClientInfo] = Field(default_factory=list, description="List of all clients in the vector database")
    total_clients: int = Field(default=0, description="Total number of clients")
    rag_enabled: bool = Field(..., description="Whether RAG features are available")



