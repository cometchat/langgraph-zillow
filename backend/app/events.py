"""AG-UI event formatting for streaming responses."""

import json
import uuid
from typing import Any


def format_ndjson_event(data: dict[str, Any]) -> str:
    """Format data as newline-delimited JSON (NDJSON)."""
    return f"{json.dumps(data)}\n"


def generate_message_id() -> str:
    """Generate a unique message ID."""
    return f"msg-{uuid.uuid4().hex[:12]}"


def generate_tool_call_id() -> str:
    """Generate a unique tool call ID."""
    return f"call-{uuid.uuid4().hex[:12]}"


class EventStream:
    """Helper class for building AG-UI event streams."""

    def __init__(self, run_id: str):
        """
        Initialize the event stream.

        Args:
            run_id: The run identifier.
        """
        self.run_id = run_id
        self.current_message_id: str | None = None
        self.current_tool_call_id: str | None = None
        self.current_tool_name: str | None = None

    def start(self) -> str:
        """Emit run started (not needed in new format, but keep for compatibility)."""
        # run started is handled in the adapter, do nothing
        return ""

    def finish(self) -> str:
        """Emit done event."""
        return format_ndjson_event({"type": "done"})

    def error(self, error: str) -> str:
        """Emit error event."""
        return format_ndjson_event({"type": "error", "error": error})

    def start_message(self, role: str = "assistant") -> str:
        """Start a new text message."""
        self.current_message_id = generate_message_id()
        return format_ndjson_event(
            {
                "type": "text_start",
                "message_id": self.current_message_id,
            }
        )

    def message_content(self, delta: str) -> str:
        """Emit text message content."""
        if not self.current_message_id:
            self.current_message_id = generate_message_id()
        return format_ndjson_event(
            {
                "type": "text_delta",
                "message_id": self.current_message_id,
                "content": delta,
            }
        )

    def end_message(self) -> str:
        """End the current text message."""
        if not self.current_message_id:
            return ""
        event = format_ndjson_event(
            {
                "type": "text_end",
                "message_id": self.current_message_id,
            }
        )
        self.current_message_id = None
        return event

    def start_tool_call(self, tool_name: str) -> str:
        """Start a tool call."""
        self.current_tool_call_id = generate_tool_call_id()
        self.current_tool_name = tool_name
        return format_ndjson_event(
            {
                "type": "tool_call_start",
                "tool_call_id": self.current_tool_call_id,
                "tool_name": tool_name,
            }
        )

    def tool_call_args(self, args: dict[str, Any] | str) -> str:
        """Emit tool call arguments."""
        if not self.current_tool_call_id:
            return ""
        args_value = args if isinstance(args, dict) else json.loads(args) if args else {}
        return format_ndjson_event(
            {
                "type": "tool_call_args",
                "tool_call_id": self.current_tool_call_id,
                "tool_name": self.current_tool_name,
                "args": args_value,
            }
        )

    def end_tool_call(self, result: Any = None) -> str:
        """End the current tool call."""
        if not self.current_tool_call_id:
            return ""

        # First emit tool_call_end
        end_event = format_ndjson_event(
            {
                "type": "tool_call_end",
                "tool_call_id": self.current_tool_call_id,
                "tool_name": self.current_tool_name,
            }
        )

        # Then emit tool_result
        result_str = result if isinstance(result, str) else json.dumps(result) if result else "{}"
        result_event = format_ndjson_event(
            {
                "type": "tool_result",
                "tool_call_id": self.current_tool_call_id,
                "tool_name": self.current_tool_name,
                "result": result_str,
            }
        )

        self.current_tool_call_id = None
        self.current_tool_name = None

        return end_event + result_event
