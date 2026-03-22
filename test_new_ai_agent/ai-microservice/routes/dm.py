import asyncio
import traceback

from fastapi import APIRouter, HTTPException, Request

from schemas import DMRequest, DMResponse

router = APIRouter(prefix="/dm", tags=["dm"])


@router.post("/respond", response_model=DMResponse)
async def respond_to_dm(request: Request, payload: DMRequest):
    try:
        if not payload.client_id or not payload.client_id.strip():
            raise HTTPException(status_code=400, detail="client_id is required")
        
        if not payload.current_message or not payload.current_message.strip():
            raise HTTPException(status_code=400, detail="current_message is required")

        dm_service = request.app.state.dm_service

        # Add overall timeout for the entire request (generous for AI response time)
        try:
            result = await asyncio.wait_for(
                dm_service.respond(
                    client_id=payload.client_id.strip(),
                    system_prompt=payload.system_prompt,
                    current_message=payload.current_message,
                    conversation_history=payload.conversation_history,
                    sender_name=payload.sender_name,
                    tenant_profile=payload.tenant_profile.model_dump() if payload.tenant_profile else None,
                    lead_state=payload.lead_state.model_dump() if payload.lead_state else None,
                    locale=payload.locale or "he-IL",
                    instagram_username=payload.instagram_username,
                ),
                timeout=120.0  # 2 minute overall timeout
            )
        except asyncio.TimeoutError:
            print(f"[DM Route] Request timed out for client {payload.client_id}")
            # Return None response - frontend should not send anything
            return DMResponse(
                response=None,
                sources_used=[],
                confidence=0.0,
                lead_metadata=None,
                usage=None,
                subagent_usage=None,
                debug={"error": "timeout", "retries_exhausted": True},
            )

        return DMResponse(
            response=result.get("response"),  # Can be None if all retries failed
            sources_used=result.get("sources", []),
            confidence=result.get("confidence", 0.3),
            lead_metadata=result.get("lead_metadata"),
            usage=result.get("usage"),
            subagent_usage=result.get("subagent_usage"),
            debug=result.get("debug"),
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[DM Route] Error: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating response: {str(e)}")



