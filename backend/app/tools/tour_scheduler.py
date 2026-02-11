"""Tour scheduler tool for booking property tours."""

import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from langchain_core.tools import tool

from ..data.loader import load_listings
from ..utils.google_calendar import (
    create_calendar_event,
    get_calendar_events,
    get_time_zone,
)
from ..utils.logging import logger


# Configuration from environment
def get_visit_duration() -> int:
    return int(os.getenv("TOUR_VISIT_DURATION_MINUTES", "60"))


def get_travel_buffer() -> int:
    return int(os.getenv("TOUR_TRAVEL_BUFFER_MINUTES", "30"))


def get_work_start_hour() -> int:
    return int(os.getenv("TOUR_WORKING_HOURS_START", "10"))


def get_work_end_hour() -> int:
    return int(os.getenv("TOUR_WORKING_HOURS_END", "18"))


WEEKEND_DAYS = {5, 6}  # Saturday=5, Sunday=6 in Python's weekday()


# Build listing lookup maps
def _build_listing_maps() -> tuple[dict[str, dict], dict[str, dict], dict[str, dict]]:
    """Build lookup maps for listings."""
    listings = load_listings()

    by_zpid: dict[str, dict] = {}
    by_address: dict[str, dict] = {}
    by_slug: dict[str, dict] = {}

    def slugify(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")

    def register(hint: str | None, listing: dict) -> None:
        if not hint:
            return
        lower = hint.lower()
        if lower not in by_address:
            by_address[lower] = listing
        slug = slugify(hint)
        if slug and slug not in by_slug:
            by_slug[slug] = listing

    for listing in listings:
        zpid = listing.get("zpid") or listing.get("id")
        if zpid:
            by_zpid[str(zpid)] = listing

        register(listing.get("displayAddress"), listing)
        register(listing.get("name"), listing)
        register(listing.get("detailUrl"), listing)

        address = listing.get("address", {})
        parts = [
            address.get("streetAddress"),
            address.get("city"),
            address.get("state"),
            address.get("zipcode"),
        ]
        register(", ".join(str(p) for p in parts if p), listing)

    return by_zpid, by_address, by_slug


def find_listing_for_hint(hint: str) -> dict | None:
    """Find a listing by hint."""
    by_zpid, by_address, by_slug = _build_listing_maps()

    lower = hint.lower()
    if lower in by_address:
        return by_address[lower]

    slug = re.sub(r"[^a-z0-9]+", "-", lower).strip("-")
    if slug in by_slug:
        return by_slug[slug]

    # Try extracting zpid
    digits = re.sub(r"\D", "", hint)
    if digits and digits in by_zpid:
        return by_zpid[digits]

    # Try finding any 5+ digit number
    matches = re.findall(r"\d{5,}", hint)
    for match in matches:
        if match in by_zpid:
            return by_zpid[match]

    return None


@dataclass
class TourContext:
    """Resolved tour context."""

    address: str | None
    zpid: str | None


def resolve_tour_context(
    listing_address: str | None,
    listing_name: str | None,
    listing_zpid: str | int | None,
    detail_url: str | None,
    notes: str | None,
) -> TourContext:
    """Resolve tour context from hints."""
    hints = [
        str(h).strip()
        for h in [listing_address, listing_name, listing_zpid, detail_url, notes]
        if h is not None and str(h).strip()
    ]

    listing = None
    for hint in hints:
        listing = find_listing_for_hint(hint)
        if listing:
            break

    address = None
    if listing:
        address = listing.get("displayAddress") or listing.get("name")
        if not address:
            addr = listing.get("address", {})
            parts = [
                addr.get("streetAddress"),
                addr.get("city"),
                addr.get("state"),
                addr.get("zipcode"),
            ]
            address = ", ".join(str(p) for p in parts if p) or None

    if not address:
        # Use first hint that looks like an address
        for hint in hints:
            if re.search(r"[a-zA-Z]", hint):
                address = hint
                break

    zpid = None
    if listing:
        zpid = str(listing.get("zpid") or listing.get("id") or "")
    if not zpid:
        for hint in hints:
            matches = re.findall(r"\d{5,}", hint)
            if matches:
                zpid = matches[0]
                break

    return TourContext(address=address, zpid=zpid or None)


def parse_iso_datetime(value: str, tz: ZoneInfo) -> datetime | None:
    """Parse an ISO datetime string."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(tz)
    except ValueError:
        return None


@dataclass
class SlotAssessment:
    """Result of assessing a time slot."""

    available: bool
    start: datetime | None = None
    end: datetime | None = None
    reason: str | None = None
    message: str | None = None


def assess_slot_availability(start_iso: str, time_zone: str) -> SlotAssessment:
    """Assess if a time slot is available."""
    tz = ZoneInfo(time_zone)
    start = parse_iso_datetime(start_iso, tz)

    if not start:
        return SlotAssessment(
            available=False,
            reason="invalid_start",
            message="Invalid start time provided.",
        )

    now = datetime.now(tz)
    travel_buffer = get_travel_buffer()
    visit_duration = get_visit_duration()
    work_start = get_work_start_hour()
    work_end = get_work_end_hour()

    # Check if too soon
    if start < now + timedelta(minutes=travel_buffer):
        return SlotAssessment(
            available=False,
            reason="too_soon",
            message="Requested start time is too soon to allow for travel buffer.",
        )

    # Check weekend
    if start.weekday() in WEEKEND_DAYS:
        return SlotAssessment(
            available=False,
            reason="weekend",
            message="Requested day falls on a weekend when tours are unavailable.",
        )

    # Check working hours
    day_start = start.replace(hour=work_start, minute=0, second=0, microsecond=0)
    day_end = start.replace(hour=work_end, minute=0, second=0, microsecond=0)
    earliest_visit = day_start + timedelta(minutes=travel_buffer)
    latest_visit = day_end - timedelta(minutes=visit_duration + travel_buffer)

    if start < earliest_visit or start > latest_visit:
        return SlotAssessment(
            available=False,
            reason="outside_hours",
            message=f"Requested time falls outside working hours ({work_start}:00 AM – {work_end}:00 PM with required travel buffer).",
        )

    # Check for conflicts
    window_start = start - timedelta(minutes=travel_buffer)
    window_end = start + timedelta(minutes=visit_duration + travel_buffer)

    try:
        events = get_calendar_events(
            window_start.isoformat(),
            window_end.isoformat(),
        )
    except Exception as e:
        return SlotAssessment(
            available=False,
            reason="calendar_error",
            message=f"Could not check calendar: {str(e)}",
        )

    for event in events:
        event_start = parse_iso_datetime(event.start, tz)
        event_end = parse_iso_datetime(event.end, tz)
        if not event_start or not event_end:
            continue

        event_window_start = event_start - timedelta(minutes=travel_buffer)
        event_window_end = event_end + timedelta(minutes=travel_buffer)

        if event_window_start < window_end and event_window_end > window_start:
            return SlotAssessment(
                available=False,
                reason="conflict",
                message="This window overlaps with an existing booking or required travel buffer.",
            )

    end = start + timedelta(minutes=visit_duration)
    return SlotAssessment(available=True, start=start, end=end)


def compute_availability(
    from_iso: str | None,
    to_iso: str | None,
    max_slots: int = 10,
) -> list[dict[str, str]]:
    """Compute available tour slots."""
    time_zone = get_time_zone()
    tz = ZoneInfo(time_zone)
    now = datetime.now(tz)

    visit_duration = get_visit_duration()
    travel_buffer = get_travel_buffer()
    work_start = get_work_start_hour()
    work_end = get_work_end_hour()
    slot_step = visit_duration + travel_buffer

    start_boundary = parse_iso_datetime(from_iso, tz) if from_iso else now
    end_boundary = (
        parse_iso_datetime(to_iso, tz) if to_iso else (start_boundary + timedelta(days=7))
    )

    if not start_boundary:
        start_boundary = now
    if not end_boundary:
        end_boundary = start_boundary + timedelta(days=7)

    # Fetch all events in range
    try:
        events = get_calendar_events(
            (start_boundary - timedelta(days=1)).isoformat(),
            (end_boundary + timedelta(days=1)).isoformat(),
        )
    except Exception:
        events = []

    # Build busy intervals
    busy_intervals = []
    for event in events:
        event_start = parse_iso_datetime(event.start, tz)
        event_end = parse_iso_datetime(event.end, tz)
        if event_start and event_end:
            busy_intervals.append(
                (
                    event_start - timedelta(minutes=travel_buffer),
                    event_end + timedelta(minutes=travel_buffer),
                )
            )

    slots = []
    current_day = start_boundary.replace(hour=0, minute=0, second=0, microsecond=0)

    while current_day <= end_boundary and len(slots) < max_slots:
        # Skip weekends
        if current_day.weekday() in WEEKEND_DAYS:
            current_day += timedelta(days=1)
            continue

        day_start = current_day.replace(hour=work_start, minute=0)
        day_end = current_day.replace(hour=work_end, minute=0)

        if day_end <= now:
            current_day += timedelta(days=1)
            continue

        earliest_start = day_start + timedelta(minutes=travel_buffer)
        latest_start = day_end - timedelta(minutes=visit_duration + travel_buffer)

        if latest_start < earliest_start:
            current_day += timedelta(days=1)
            continue

        # Find first valid candidate
        candidate = max(
            earliest_start,
            start_boundary + timedelta(minutes=travel_buffer),
            now + timedelta(minutes=travel_buffer),
        )

        # Align to slot step
        if candidate > earliest_start:
            diff = (candidate - earliest_start).total_seconds() / 60
            steps = int(diff // slot_step) + 1
            candidate = earliest_start + timedelta(minutes=steps * slot_step)

        while candidate <= latest_start and len(slots) < max_slots:
            travel_window_start = candidate - timedelta(minutes=travel_buffer)
            travel_window_end = candidate + timedelta(minutes=visit_duration + travel_buffer)

            if travel_window_start < day_start or travel_window_end > day_end:
                candidate += timedelta(minutes=slot_step)
                continue

            # Check for conflicts
            has_conflict = False
            for busy_start, busy_end in busy_intervals:
                if busy_start < travel_window_end and busy_end > travel_window_start:
                    has_conflict = True
                    break

            if not has_conflict:
                visit_end = candidate + timedelta(minutes=visit_duration)
                slots.append(
                    {
                        "start": candidate.isoformat(),
                        "end": visit_end.isoformat(),
                        "label": f"{candidate.strftime('%a %d %b, %I:%M %p')} – {visit_end.strftime('%I:%M %p')}",
                    }
                )

            candidate += timedelta(minutes=slot_step)

        current_day += timedelta(days=1)

    return slots[:max_slots]


@tool("tourSchedulerTool")
def tour_scheduler(
    action: Literal["availability", "check", "book"],
    fromISO: str | None = None,
    toISO: str | None = None,
    startISO: str | None = None,
    listingAddress: str | None = None,
    listingName: str | None = None,
    listingZpid: str | int | None = None,
    detailUrl: str | None = None,
    customerName: str | None = None,
    customerEmail: str | None = None,
    notes: str | None = None,
    maxSlots: int = 10,
) -> dict[str, Any]:
    """
    Schedule property tours on Google Calendar.

    Args:
        action: Action to perform - "availability" to list slots, "check" to verify a slot, "book" to create a tour.
        fromISO: Start of availability window (ISO format).
        toISO: End of availability window (ISO format).
        startISO: Specific start time for check/book (ISO format).
        listingAddress: Property address.
        listingName: Property name.
        listingZpid: Property zpid.
        detailUrl: Property detail URL.
        customerName: Visitor's name.
        customerEmail: Visitor's email.
        notes: Additional notes.
        maxSlots: Maximum slots to return for availability.

    Returns:
        Tour scheduling result.
    """
    logger.debug("tour-scheduler called with action=%s", action)

    time_zone = get_time_zone()

    if action == "availability":
        try:
            slots = compute_availability(fromISO, toISO, maxSlots)
            return {
                "status": "availability",
                "timezone": time_zone,
                "slots": slots,
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e),
            }

    if action == "check":
        if not startISO:
            return {
                "status": "error",
                "message": "startISO is required for check action.",
            }

        assessment = assess_slot_availability(startISO, time_zone)
        if not assessment.available:
            return {
                "status": "check",
                "available": False,
                "reason": assessment.reason,
                "message": assessment.message,
            }

        return {
            "status": "check",
            "available": True,
            "start": assessment.start.isoformat() if assessment.start else None,
            "end": assessment.end.isoformat() if assessment.end else None,
        }

    if action == "book":
        if not startISO:
            return {
                "status": "error",
                "message": "startISO is required for book action.",
            }

        assessment = assess_slot_availability(startISO, time_zone)
        if not assessment.available:
            return {
                "status": "unavailable",
                "available": False,
                "reason": assessment.reason,
                "message": assessment.message,
            }

        context = resolve_tour_context(listingAddress, listingName, listingZpid, detailUrl, notes)

        # Build summary and description
        address_label = context.address or listingAddress or listingName or "this property"
        summary = f"Property tour at {address_label}"
        if customerName:
            summary += f" for {customerName}"

        description_parts = []
        if context.address:
            description_parts.append(f"Listing address: {context.address}")
        if context.zpid:
            description_parts.append(f"Listing ZPID: {context.zpid}")
        if customerName:
            description_parts.append(f"Visitor: {customerName}")
        if customerEmail:
            description_parts.append(f"Visitor email: {customerEmail}")
        if notes:
            description_parts.append(f"Notes: {notes}")

        description = "\n".join(description_parts) if description_parts else None

        try:
            event = create_calendar_event(
                summary=summary,
                start=assessment.start.isoformat(),
                end=assessment.end.isoformat(),
                description=description,
            )

            return {
                "status": "booked",
                "summary": event.summary or summary,
                "start": event.start,
                "end": event.end,
                "eventId": event.id,
                "htmlLink": event.html_link,
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e),
            }

    return {
        "status": "error",
        "message": f"Invalid action: {action}",
    }
