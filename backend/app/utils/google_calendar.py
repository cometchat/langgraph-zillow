"""Google Calendar client for tour scheduling."""

import os
from dataclasses import dataclass

from google.oauth2 import service_account
from googleapiclient.discovery import Resource, build

SCOPES = ["https://www.googleapis.com/auth/calendar"]

DEFAULT_CALENDAR_ID = (
    "c_7000354ca0522cb73ecdf80265b9110cdae1b1a913d1e32e199a08fffa217f3d@group.calendar.google.com"
)
DEFAULT_TIME_ZONE = "Asia/Kolkata"

_cached_client: Resource | None = None


@dataclass
class CalendarEvent:
    """Represents a calendar event."""

    id: str
    summary: str | None
    description: str | None
    start: str
    end: str
    html_link: str | None


@dataclass
class AvailabilitySlot:
    """Represents an available time slot."""

    start: str
    end: str
    label: str


def get_calendar_client() -> Resource:
    """Get or create a Google Calendar client."""
    global _cached_client

    if _cached_client is not None:
        return _cached_client

    client_email = os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    private_key_raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")

    if not client_email or not private_key_raw:
        raise ValueError(
            "Google Calendar credentials missing. "
            "Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
        )

    # Handle escaped newlines
    private_key = private_key_raw.replace("\\n", "\n")

    credentials = service_account.Credentials.from_service_account_info(
        {
            "client_email": client_email,
            "private_key": private_key,
            "token_uri": "https://oauth2.googleapis.com/token",
        },
        scopes=SCOPES,
    )

    _cached_client = build("calendar", "v3", credentials=credentials)
    return _cached_client


def get_calendar_id() -> str:
    """Get the calendar ID from environment or default."""
    return os.getenv("GOOGLE_CALENDAR_ID") or DEFAULT_CALENDAR_ID


def get_time_zone() -> str:
    """Get the time zone from environment or default."""
    return os.getenv("GOOGLE_CALENDAR_TIMEZONE") or DEFAULT_TIME_ZONE


def get_calendar_events(
    time_min: str,
    time_max: str,
    calendar_id: str | None = None,
) -> list[CalendarEvent]:
    """Fetch calendar events in a time range."""
    client = get_calendar_client()
    cal_id = calendar_id or get_calendar_id()

    response = (
        client.events()
        .list(
            calendarId=cal_id,
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
            showDeleted=False,
        )
        .execute()
    )

    events = response.get("items", [])

    result = []
    for event in events:
        start = event.get("start", {})
        end = event.get("end", {})

        start_time = start.get("dateTime")
        end_time = end.get("dateTime")

        if not start_time or not end_time:
            continue

        result.append(
            CalendarEvent(
                id=event.get("id", ""),
                summary=event.get("summary"),
                description=event.get("description"),
                start=start_time,
                end=end_time,
                html_link=event.get("htmlLink"),
            )
        )

    return result


def create_calendar_event(
    summary: str,
    start: str,
    end: str,
    description: str | None = None,
    calendar_id: str | None = None,
) -> CalendarEvent:
    """Create a calendar event."""
    client = get_calendar_client()
    cal_id = calendar_id or get_calendar_id()
    time_zone = get_time_zone()

    event_body = {
        "summary": summary,
        "description": description,
        "start": {
            "dateTime": start,
            "timeZone": time_zone,
        },
        "end": {
            "dateTime": end,
            "timeZone": time_zone,
        },
    }

    response = (
        client.events()
        .insert(
            calendarId=cal_id,
            body=event_body,
        )
        .execute()
    )

    return CalendarEvent(
        id=response.get("id", ""),
        summary=response.get("summary"),
        description=response.get("description"),
        start=response.get("start", {}).get("dateTime", start),
        end=response.get("end", {}).get("dateTime", end),
        html_link=response.get("htmlLink"),
    )


def clear_client_cache() -> None:
    """Clear the cached client (useful for testing)."""
    global _cached_client
    _cached_client = None
