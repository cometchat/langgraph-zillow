"""LangGraph agent implementation for Zillow Bot."""

from typing import Annotated, Any, Literal, Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from .memory import FilterHints, get_memory_manager
from .prompt_builder import build_system_prompt
from .tools.knowledge_base import zillow_knowledge_base
from .tools.listing_details import zillow_listing_details
from .tools.property_search import zillow_property_search
from .tools.tour_scheduler import tour_scheduler
from .utils.context_extractor import RuntimeContext, extract_runtime_context
from .utils.logging import logger


class AgentState(TypedDict):
    """State for the Zillow agent."""

    messages: Annotated[Sequence[BaseMessage], add_messages]
    runtime_context: RuntimeContext
    working_memory: FilterHints
    thread_id: str


TOOLS = [
    zillow_property_search,
    zillow_listing_details,
    zillow_knowledge_base,
    tour_scheduler,
]


def create_llm(streaming: bool = True) -> ChatOpenAI:
    """Create the LLM instance."""
    return ChatOpenAI(
        model="gpt-4o",
        streaming=streaming,
        temperature=0,
    )


def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    """Determine if the agent should continue to tools or end."""
    messages = state["messages"]
    if not messages:
        return END

    last_message = messages[-1]

    # Check if the last message has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"

    return END


def call_model(state: AgentState) -> dict[str, Any]:
    """Call the LLM with the current state."""
    # Build system prompt with runtime context
    system_prompt = build_system_prompt(
        state["runtime_context"],
        state["working_memory"],
    )

    listing_hints = state["runtime_context"].listing_hints
    logger.debug(
        "[call_model] Listing hints: zpid=%s, detailUrl=%s, address=%s",
        listing_hints.zpid,
        listing_hints.detailUrl,
        listing_hints.address,
    )

    messages = [SystemMessage(content=system_prompt)] + list(state["messages"])

    llm = create_llm()
    llm_with_tools = llm.bind_tools(TOOLS)

    response = llm_with_tools.invoke(messages)

    return {"messages": [response]}


def create_agent_graph(checkpointer: MemorySaver | None = None) -> StateGraph:
    """Create the agent graph."""
    # Create tool node
    tool_node = ToolNode(TOOLS)

    # Build graph
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)

    # Set entry point
    workflow.set_entry_point("agent")

    # Add conditional edges
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            END: END,
        },
    )

    # Tools always go back to agent
    workflow.add_edge("tools", "agent")

    # Compile with checkpointer if provided
    if checkpointer:
        return workflow.compile(checkpointer=checkpointer)

    return workflow.compile()


def create_checkpointer() -> MemorySaver:
    """Create an in-memory checkpointer for thread state persistence."""
    return MemorySaver()


class ZillowAgent:
    """High-level wrapper for the Zillow agent."""

    def __init__(self, db_path: str = ":memory:"):
        """
        Initialize the Zillow agent.

        Args:
            db_path: Path to SQLite database for state persistence.
        """
        self.db_path = db_path
        self.checkpointer = create_checkpointer()
        self.graph = create_agent_graph(self.checkpointer)
        self.memory_manager = get_memory_manager(db_path)

    def invoke(
        self,
        messages: list[dict[str, str]],
        thread_id: str,
        forwarded_props: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Invoke the agent synchronously.

        Args:
            messages: List of message dicts with "role" and "content".
            thread_id: Thread identifier for state persistence.
            forwarded_props: Optional forwarded props with CometChat context.

        Returns:
            Agent response.
        """
        # Extract runtime context
        runtime_context = extract_runtime_context(forwarded_props)

        # Merge with context hints
        merged_memory = self.memory_manager.merge_filters(
            thread_id,
            FilterHints(),  # No explicit filters in invoke
            runtime_context.filter_hints,
        )

        # Convert messages
        langchain_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "user":
                langchain_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                langchain_messages.append(AIMessage(content=content))
            elif role == "system":
                langchain_messages.append(SystemMessage(content=content))

        # Build initial state
        initial_state: AgentState = {
            "messages": langchain_messages,
            "runtime_context": runtime_context,
            "working_memory": merged_memory,
            "thread_id": thread_id,
        }

        # Invoke graph
        config = {"configurable": {"thread_id": thread_id}}
        result = self.graph.invoke(initial_state, config)

        # Save updated working memory
        self.memory_manager.save_filters(thread_id, merged_memory)

        return result

    async def astream(
        self,
        messages: list[dict[str, str]],
        thread_id: str,
        forwarded_props: dict[str, Any] | None = None,
    ):
        """
        Stream agent responses asynchronously.

        Args:
            messages: List of message dicts with "role" and "content".
            thread_id: Thread identifier for state persistence.
            forwarded_props: Optional forwarded props with CometChat context.

        Yields:
            Stream events from the agent.
        """
        # Extract runtime context
        runtime_context = extract_runtime_context(forwarded_props)

        # Merge with context hints
        merged_memory = self.memory_manager.merge_filters(
            thread_id,
            FilterHints(),
            runtime_context.filter_hints,
        )

        # Convert messages
        langchain_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "user":
                langchain_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                langchain_messages.append(AIMessage(content=content))
            elif role == "system":
                langchain_messages.append(SystemMessage(content=content))

        # Build initial state
        initial_state: AgentState = {
            "messages": langchain_messages,
            "runtime_context": runtime_context,
            "working_memory": merged_memory,
            "thread_id": thread_id,
        }

        # Stream from graph
        config = {"configurable": {"thread_id": thread_id}}
        async for event in self.graph.astream_events(initial_state, config, version="v2"):
            yield event

        # Save updated working memory
        self.memory_manager.save_filters(thread_id, merged_memory)


# Global agent instance
_agent: ZillowAgent | None = None


def get_agent(db_path: str = ":memory:") -> ZillowAgent:
    """Get or create the global agent instance."""
    global _agent
    if _agent is None:
        _agent = ZillowAgent(db_path)
    return _agent


def reset_agent() -> None:
    """Reset the global agent instance (useful for testing)."""
    global _agent
    _agent = None
