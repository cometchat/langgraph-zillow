"""FastAPI server for the Zillow agent."""

import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, ConfigDict, Field

from .agent import ZillowAgent
from .events import EventStream
from .memory import FilterHints, get_memory_manager
from .utils.context_extractor import extract_runtime_context
from .utils.logging import logger

load_dotenv()

class Message(BaseModel):
    """A chat message."""

    role: str = Field(..., description="Message role: user, assistant, or system")
    content: str = Field(..., description="Message content")
    id: str | None = Field(None, description="Optional message ID")


class ForwardedProps(BaseModel):
    """Forwarded properties from the client."""

    model_config = ConfigDict(extra="allow")

    cometchatContext: dict[str, Any] | None = Field(None, description="CometChat context")


class RunAgentInput(BaseModel):
    """Input for the /run endpoint following AG-UI protocol."""

    model_config = ConfigDict(extra="allow")

    messages: list[Message] = Field(..., description="Chat messages")
    # Accept both camelCase and snake_case
    threadId: str | None = Field(None, description="Thread identifier (camelCase)")
    thread_id: str | None = Field(None, description="Thread identifier (snake_case)")
    runId: str | None = Field(None, description="Run identifier (camelCase)")
    run_id: str | None = Field(None, description="Run identifier (snake_case)")
    forwardedProps: ForwardedProps | None = Field(None, description="Forwarded properties")
    # Also accept cometchatContext at root level
    cometchatContext: dict[str, Any] | None = Field(None, description="CometChat context at root")

    def get_thread_id(self) -> str:
        """Get thread ID from either format."""
        return self.threadId or self.thread_id or "default"

    def get_run_id(self) -> str:
        """Get run ID from either format."""
        return self.runId or self.run_id or "default"

    def get_forwarded_props(self) -> dict[str, Any] | None:
        """Get forwarded props, checking both locations for cometchatContext."""
        if self.forwardedProps:
            return self.forwardedProps.model_dump()
        if self.cometchatContext:
            return {"cometchatContext": self.cometchatContext}
        return None


app = FastAPI(
    title="Zillow Agent API",
    description="LangGraph-based Zillow real estate chatbot with AG-UI protocol support",
    version="1.0.0",
)

# CORS configuration - defaults to allow all origins for development
cors_origins = os.getenv("CORS_ORIGINS", "*")
cors_origins_list = [origin.strip() for origin in cors_origins.split(",")] if cors_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_agent: ZillowAgent | None = None

def get_agent() -> ZillowAgent:
    """Get or create the agent instance."""
    global _agent
    if _agent is None:
        db_path = os.getenv("AGENT_DB_PATH", ":memory:")
        _agent = ZillowAgent(db_path)
    return _agent


@app.post("/run")
async def run_agent(
    request: RunAgentInput,
    debug: int = Query(0, ge=0, le=1, description="Debug mode")
):
    """
    Run the Zillow agent with streaming AG-UI events.

    This endpoint accepts AG-UI RunAgentInput format and streams
    AG-UI events as Server-Sent Events.
    """

    thread_id = request.get_thread_id()
    run_id = request.get_run_id()
    forwarded_props = request.get_forwarded_props()
    logger.debug("debug mode: %s", debug)

    if debug:
        logger.info("[/run] Received request:")
        logger.info("  threadId: %s", thread_id)
        logger.info("  runId: %s", run_id)
        logger.info("  messages: %s", [{'role': m.role, 'content': m.content[:100]} for m in request.messages])
        logger.info("  forwardedProps: %s", forwarded_props)

    agent = get_agent()

    async def event_stream():
        stream = EventStream(run_id)

        # Emit run started
        start_event = stream.start()
        if debug:
            logger.info("[YIELD] %s", start_event[:80])
        yield start_event

        try:
            # Extract context
            runtime_context = extract_runtime_context(forwarded_props)

            # Get working memory
            memory_manager = get_memory_manager()
            merged_memory = memory_manager.merge_filters(
                thread_id,
                FilterHints(),
                runtime_context.filter_hints,
            )

            # Convert messages
            langchain_messages = []
            for msg in request.messages:
                if msg.role == "user":
                    langchain_messages.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    langchain_messages.append(AIMessage(content=msg.content))
                elif msg.role == "system":
                    langchain_messages.append(SystemMessage(content=msg.content))

            # Build initial state
            initial_state = {
                "messages": langchain_messages,
                "runtime_context": runtime_context,
                "working_memory": merged_memory,
                "thread_id": thread_id,
            }

            # Stream from agent
            config = {"configurable": {"thread_id": thread_id}}
            message_started = False

            # Buffer for tool calls (emit all events together on tool_end)
            pending_tool_name: str | None = None
            pending_tool_args: dict | None = None

            async for event in agent.graph.astream_events(initial_state, config, version="v1"):
                event_type = event.get("event")
                event_name = event.get("name", "N/A")
                if debug:
                    logger.debug("[EVENT] %s: %s", event_type, event_name)

                # Handle chat model stream events - only for text content
                if event_type == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk:
                        # Check for content
                        content = getattr(chunk, "content", None)
                        if content:  # Non-empty string
                            if debug:
                                logger.debug("[CHUNK] content=%s...", content[:50])
                            if not message_started:
                                msg_start = stream.start_message()
                                if debug:
                                    logger.info("[YIELD] text_start")
                                yield msg_start
                                message_started = True
                            msg_content = stream.message_content(content)
                            yield msg_content

                # Handle tool start - BUFFER only, don't emit yet
                elif event_type == "on_tool_start":
                    pending_tool_name = event_name
                    pending_tool_args = event.get("data", {}).get("input")
                    if debug:
                        logger.info("[BUFFER] tool_start: %s, args: %s", pending_tool_name, pending_tool_args)

                # Handle tool end - FLUSH all tool events together
                elif event_type == "on_tool_end":
                    output = event.get("data", {}).get("output")

                    # Extract content from ToolMessage or string
                    if hasattr(output, "content"):
                        result = output.content
                    elif isinstance(output, str):
                        result = output
                    else:
                        result = str(output) if output else None

                    # Only emit if we have a pending tool
                    if pending_tool_name:
                        # Emit tool_call_start
                        start_evt = stream.start_tool_call(pending_tool_name)
                        if debug:
                            logger.info("[YIELD] tool_call_start: %s", pending_tool_name)
                        yield start_evt

                        # Emit tool_call_args
                        if pending_tool_args:
                            args_evt = stream.tool_call_args(pending_tool_args)
                            if debug:
                                logger.info("[YIELD] tool_call_args: %s", pending_tool_args)
                            yield args_evt

                        # Emit tool_call_end + tool_result
                        end_events = stream.end_tool_call(result)
                        if debug:
                            logger.info("[YIELD] tool_call_end + tool_result")
                        yield end_events

                        # Reset buffer
                        pending_tool_name = None
                        pending_tool_args = None

                # Handle chat model end
                elif event_type == "on_chat_model_end":
                    if message_started:
                        msg_end = stream.end_message()
                        if debug:
                            logger.info("[YIELD] text_end")
                        yield msg_end
                        message_started = False

            # Ensure message is ended
            if message_started:
                yield stream.end_message()

            # Save working memory
            memory_manager.save_filters(thread_id, merged_memory)

        except Exception as e:
            yield stream.error(str(e))

        # Emit run finished
        finish_event = stream.finish()
        if debug:
            logger.info("[YIELD] %s", finish_event[:80])
        yield finish_event

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "zillow-agent"}


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Zillow Agent API",
        "version": "1.0.0",
        "endpoints": {
            "/run": "POST - Run agent with AG-UI streaming",
            "/health": "GET - Health check",
        },
    }
