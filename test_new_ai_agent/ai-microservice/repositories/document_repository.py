from typing import BinaryIO

from services.vector_store_service import VectorStoreService


class DocumentRepository:
    def __init__(self, vector_service: VectorStoreService):
        self.vector_service = vector_service

    async def process_and_store_markdown(self, *, client_id: str, filename: str, document_id: str, md_content: BinaryIO) -> int:
        return await self.vector_service.process_and_store_markdown(
            md_content=md_content,
            client_id=client_id,
            document_id=document_id,
            filename=filename,
        )

    async def delete_client_documents(self, client_id: str):
        return await self.vector_service.delete_client_documents(client_id)

    async def list_client_documents(self, client_id: str):
        return await self.vector_service.list_client_documents(client_id)
