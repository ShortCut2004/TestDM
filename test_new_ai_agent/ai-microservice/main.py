from dotenv import load_dotenv

# Load .env file from the ai-microservice directory
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.dm_agent import DmAgent
from agents.gender_agent import GenderAgent
from agents.training_agent import TrainingAgent
from repositories.document_repository import DocumentRepository
from repositories.training_repository import TrainingRepository
from routes.clients import router as clients_router
from routes.dm import router as dm_router
from routes.documents import router as documents_router
from routes.health import router as health_router
from routes.training import router as training_router
from services.dm_service import DmService
from services.document_service import DocumentService
from services.openrouter_client import OpenRouterClient
from services.training_service import TrainingService
from services.vector_store_service import VectorStoreService

app = FastAPI(
    title="Instagram DM AI Service",
    description="AI-powered Instagram DM response automation with RAG",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    openrouter_client = OpenRouterClient()
    vector_service = VectorStoreService()

    document_repository = DocumentRepository(vector_service)
    training_repository = TrainingRepository(vector_service)

    gender_agent = GenderAgent(openrouter_client)
    dm_agent = DmAgent(vector_service, openrouter_client)
    training_agent = TrainingAgent(openrouter_client)

    app.state.vector_service = vector_service  # Expose for clients route
    app.state.document_service = DocumentService(document_repository)
    app.state.training_service = TrainingService(training_agent, training_repository)
    app.state.dm_service = DmService(gender_agent, dm_agent)


app.include_router(health_router)
app.include_router(clients_router)
app.include_router(dm_router)
app.include_router(documents_router)
app.include_router(training_router)
