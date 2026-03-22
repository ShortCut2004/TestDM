import asyncio
import traceback
from typing import Optional

from agents.dm_agent import DmAgent
from agents.gender_agent import GenderAgent


class DmService:
    def __init__(self, gender_agent: GenderAgent, dm_agent: DmAgent):
        self.gender_agent = gender_agent
        self.dm_agent = dm_agent

    async def respond(
        self,
        *,
        client_id: str,
        system_prompt: str,
        current_message: str,
        conversation_history: list,
        sender_name: Optional[str] = None,
        tenant_profile: Optional[dict] = None,
        lead_state: Optional[dict] = None,
        locale: str = "he-IL",
        instagram_username: Optional[str] = None,
    ) -> dict:
        lead_state = lead_state or {}
        gender_locked = bool(lead_state.get("genderLocked"))
        current_gender = (lead_state.get("gender") or "").strip().lower()

        effective_gender = current_gender if current_gender in {"male", "female"} else "unknown"
        gender_decision = None
        gender_usage = None
        gender_error = None

        # Gender classification with error handling (shouldn't block response generation)
        if not gender_locked and effective_gender == "unknown":
            try:
                # Run gender classification with a short timeout (rule-based is instant, LLM has its own timeout)
                gender_decision = await asyncio.wait_for(
                    self.gender_agent.classify_gender(
                        current_message=current_message,
                        conversation_history=conversation_history,
                        sender_name=sender_name,
                        instagram_username=instagram_username,
                        locale=locale,
                    ),
                    timeout=30.0  # 30 second timeout for gender classification
                )

                # Extract usage for cost tracking
                gender_usage = gender_decision.get("usage") if gender_decision else None

                if (
                    gender_decision
                    and gender_decision.get("gender") in {"male", "female"}
                    and float(gender_decision.get("confidence", 0.0)) >= float(gender_decision.get("threshold", 0.7))
                ):
                    effective_gender = gender_decision["gender"]
                    
            except asyncio.TimeoutError:
                gender_error = "Gender classification timed out"
                print(f"[DmService] Gender classification timed out, proceeding with unknown gender")
            except Exception as e:
                gender_error = str(e)
                print(f"[DmService] Gender classification failed: {e}")
                # Continue with unknown gender - don't let gender classification block response

        lead_state["gender"] = effective_gender

        # Main response generation with retry logic
        max_retries = 2
        last_error = None
        result = None
        
        for attempt in range(max_retries):
            try:
                result = await self.dm_agent.generate_response(
                    client_id=client_id,
                    system_prompt=system_prompt,
                    current_message=current_message,
                    conversation_history=conversation_history,
                    sender_name=sender_name,
                    tenant_profile=tenant_profile,
                    lead_state=lead_state,
                    locale=locale,
                    instagram_username=instagram_username,
                )
                # If successful, break out of retry loop
                break
            except Exception as e:
                last_error = e
                print(f"[DmService] Response generation failed (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.5)  # Brief delay before retry
                    
        # If all retries failed, return None response (don't send anything to user)
        if result is None:
            print(f"[DmService] All retries failed, returning no response")
            print(traceback.format_exc())
            return {
                "response": None,  # None = don't send any message
                "sources": [],
                "confidence": 0.0,
                "lead_metadata": {"gender": effective_gender} if effective_gender in {"male", "female"} else None,
                "usage": None,
                "subagent_usage": None,
                "debug": {
                    "error": str(last_error) if last_error else "Unknown error",
                    "gender_decision": gender_decision,
                    "gender_error": gender_error,
                    "retries_exhausted": True,
                },
            }

        lead_metadata = result.get("lead_metadata") or {}
        if effective_gender in {"male", "female"} and not lead_metadata.get("gender"):
            lead_metadata["gender"] = effective_gender

        # Add debug information
        debug = result.get("debug") or {}
        if gender_decision:
            debug["gender_decision"] = gender_decision
        if gender_error:
            debug["gender_error"] = gender_error
        result["debug"] = debug

        # Add gender agent usage to subagent_usage for cost tracking
        subagent_usage = result.get("subagent_usage") or []
        if gender_usage:
            subagent_usage.append({"operation": "SetterAI-Gender", **(gender_usage or {})})
        result["subagent_usage"] = subagent_usage if subagent_usage else None

        result["lead_metadata"] = lead_metadata if lead_metadata else None
        return result
