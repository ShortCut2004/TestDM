from typing import BinaryIO

from repositories.document_repository import DocumentRepository


class DocumentService:
    def __init__(self, document_repository: DocumentRepository):
        self.document_repository = document_repository

    async def upload_markdown(self, *, client_id: str, filename: str, document_id: str, md_bytes: BinaryIO) -> int:
        return await self.document_repository.process_and_store_markdown(
            client_id=client_id,
            filename=filename,
            document_id=document_id,
            md_content=md_bytes,
        )

    async def delete_client_documents(self, client_id: str):
        return await self.document_repository.delete_client_documents(client_id)

    async def list_client_documents(self, client_id: str):
        return await self.document_repository.list_client_documents(client_id)
