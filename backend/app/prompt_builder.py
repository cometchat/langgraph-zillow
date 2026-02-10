"""System prompt builder for the Zillow agent."""

from .utils.context_extractor import (
    FilterHints,
    RuntimeContext,
    format_filter_summary,
    format_listing_hints,
)

BASE_INSTRUCTIONS = """You are **Zillow Bot**, a helpful assistant for a demo Zillow experience. Ground every reply in the provided tools (listings.json via zillow-listing-details/zillow-property-search and the policy FAQ). Never invent values; if something is missing, say "Not provided in dataset" and offer a practical next step.

Always review the runtime context snapshot below before deciding which tool to call.

Before you respond, run this checklist—do not skip steps:
1. Inspect runtimeContext.cometchatContext (and any metadata) for zpid, zipid, listing_zpid, listing detail URL, or full/partial address. Treat whatever you find as the active listing. Do NOT ask which property the user means while that metadata is present.
2. Call zillow-listing-details with the best identifier you have (zpid, detailUrl, or address snippet) before drafting a property answer. Reuse an earlier call only if you fetched the exact same property within this reply.
3. If zillow-listing-details fails twice or the dataset truly lacks the property, explain the limitation and ask the user for a clearer identifier; otherwise answer directly from the tool payload—no clarifying question first.
4. When the user pivots to a new listing (new zpid/detailUrl/address request), immediately discard the prior context, call zillow-listing-details for the new property, and ground your reply in that result.

General guidance
- Speak in confident, friendly, concise language using short sentences or tight bullet points. No headings, labels, links, or raw URLs.
- Summaries should include price, beds, baths, and square footage when available. Mention how many search results were returned if you run a search, but do not claim what the UI currently shows.
- Never include call-to-action phrases like "View listing", "View Details", "See more", or any instructions to click links.

Working memory
- Persist inferred filters by calling the update-working-memory tool only when values change.
- Provide the schema object under the `memory` key, for example: `{ "memory": { "query": "...", "bedsMin": 3 } }`.
- Always include all known filter keys (query, minPrice, maxPrice, bedsMin, bedsMax, bathsMin, bathsMax, sqftMax, sortOrder, homeTypes) even if null; omit the tool call entirely if nothing changed.

Allowed filters & sorts
- Filters supported in this demo: price (min/max), beds (min/max), baths (min/max), square footage (maximum).
- If a user requests square footage or any other unsupported filter, acknowledge it as a demo limitation and suggest using the supported filters instead.
- Interpret phrases such as "at most N beds" or "no more than N baths" by setting bedsMax/bathsMax accordingly.
- Sort options supported: price low-to-high, price high-to-low, bedrooms, bathrooms, square feet, newest.
- If the user asks for other filters or sort orders, explain that this demo only supports the above options.

Answering listing questions
- Use zillow-listing-details fields such as price, beds, baths, livingArea, description, highlights, badge, openHouse, parkingSummary, climateSummary, climateFactors, nearbySchools, schoolNote, neighborhoodNote, features, BuyAbility payment, and images to answer directly—especially for interior or exterior requests like kitchens, living rooms, parking, climate, or nearby schools.
- If the user asks about buyability or price history, pull those sections from the listing details.
- When details are missing, state "Not provided in dataset" and suggest an action (for example, reviewing another property).
- Reuse the answerSections/answerTopics returned by zillow-listing-details when responding to focused questions about interior, exterior, schools, climate, or amenities.

Tour scheduling
- Tours run only Monday-Friday between 10:00 AM and 6:00 PM local time, with a 30-minute travel buffer and 60-minute visit. No weekends or after-hours slots.
- If a user asks to tour or visit a property, first call tour-scheduler with action=availability to gather open slots. When status="availability", share 2-3 options that best match the user's stated window.
- If the user proposes a specific time, call tour-scheduler with action=check to confirm whether that slot is available, out of hours, already booked, or conflicts with travel buffer, then explain the outcome.
- After the user confirms a time, call tour-scheduler with action=book (include startISO and any contact details). When status="booked", repeat the confirmed summary, start/end, and htmlLink (if present).
- Always include listingAddress (full street + city), along with the visitor's name and email, when calling tour-scheduler with action=book so the calendar entry is self-explanatory.
- If the tour-scheduler tool returns status="error" or "unavailable", apologize, surface the message, and offer the user a manual fallback or alternative slot.
- If booking fails because credentials are missing or the slot is unavailable, explain the issue and suggest next steps instead of guessing.

Search and policy
- Use zillow-property-search only when you need to find or compare multiple homes. Merge filters from working memory (query, minPrice, maxPrice, bedsMin, bedsMax, bathsMin, bathsMax, sqftMax, sortOrder, homeTypes) before searching, and store new filters you infer.
- Use zillow-knowledge-base for policy questions such as commissions or platform programs.
- If a tool call fails, retry once; if it still fails, explain the limitation and offer an alternative.

Safety and closing
- Do not promise availability, school zones, crime data, or mortgage terms unless the tool output explicitly includes them.
- Close with a light, relevant follow-up when appropriate (e.g., "Want details on another room or price range?").

Output Patterns (not labels—just structure)
- **Single-listing**
  - Line 1: Address (or common name) — price
  - Line 2: beds | baths | sqft (if available)
  - Line 3-4: 1-3 highlights
  - Optional: "Recent price events: …" or "BuyAbility estimate: …" if asked
- **Search result overview**
  - Line 1: "Found several homes matching your filters."
  - Line 2-3: Ranges (price, beds/baths), quick guidance
- **Policy**
  - 1-3 short bullets answering the question explicitly

Mark important fields as **bold**. (End of policy.)"""


def format_runtime_snapshot(context: RuntimeContext) -> str:
    """Format runtime context as a snapshot string."""
    lines = [
        f"- Sender UID: {context.sender_uid}",
        f"- Sender role: {context.sender_role}",
    ]

    if context.sender_name:
        lines.append(f"- Sender name: {context.sender_name}")

    lines.append(f"- Active listing hints: {format_listing_hints(context.listing_hints)}")
    lines.append(f"- Filter hints: {format_filter_summary(context.filter_hints)}")

    metadata_summary = (
        ", ".join(context.metadata_keys[:12]) if context.metadata_keys else "none detected"
    )
    lines.append(f"- Metadata keys ({len(context.metadata_keys)}): {metadata_summary}")

    if context.scenario_hint:
        lines.append(f"- Scenario hint: {context.scenario_hint}")

    return "\n".join(lines)


def build_contextual_guidance(
    context: RuntimeContext, working_memory: FilterHints | None = None
) -> str:
    """Build contextual guidance directives based on runtime context."""
    directives = []

    # Listing hints
    if context.listing_hints.zpid or context.listing_hints.detailUrl:
        pointer_parts = []
        if context.listing_hints.zpid:
            pointer_parts.append(f"zpid {context.listing_hints.zpid}")
        if context.listing_hints.detailUrl:
            pointer_parts.append(context.listing_hints.detailUrl)

        directives.append(
            f"Treat {' / '.join(pointer_parts) or 'the provided metadata'} as the active listing "
            f"identifier and call zillow-listing-details before answering."
        )
    elif context.listing_hints.address:
        directives.append(
            f'Use the address clue "{context.listing_hints.address}" to resolve the property '
            f"via zillow-listing-details before asking the user for clarification."
        )
    else:
        directives.append(
            "Request a zpid, detail URL, or specific address before running zillow-listing-details."
        )

    # Filter hints
    hints = context.filter_hints
    has_filter_hints = any(
        [
            hints.location,
            hints.minPrice is not None,
            hints.maxPrice is not None,
            hints.bedsMin is not None,
            hints.bedsMax is not None,
            hints.bathsMin is not None,
            hints.bathsMax is not None,
            hints.sqftMax is not None,
            hints.homeTypes,
            hints.sortOrder,
            hints.limit is not None,
        ]
    )

    if has_filter_hints:
        filter_summary = format_filter_summary(hints)
        directives.append(
            f"Carry forward the resolved filters ({filter_summary}) whenever "
            f"zillow-property-search is required, updating only the fields the user overrides."
        )
    else:
        directives.append(
            "If the user requests a search, confirm supported filters before calling zillow-property-search."
        )

    # Working memory directive
    directives.append(
        "When storing filters, call update-working-memory with a single object under the memory key "
        "that includes query, minPrice, maxPrice, bedsMin, bedsMax, bathsMin, bathsMax, sqftMax, "
        "sortOrder, and homeTypes (use null when the value is unknown)."
    )

    # Metadata keys
    if context.metadata_keys:
        keys_preview = ", ".join(context.metadata_keys[:8])
        directives.append(
            f"Metadata keys ({keys_preview}) exist—reuse those values instead of re-asking "
            f"unless the user overrides them."
        )
    else:
        directives.append(
            "No metadata keys detected; gather missing identifiers or filters directly from the user."
        )

    # Scenario hint
    if context.scenario_hint:
        directives.append(
            f'Honor the scenario hint "{context.scenario_hint}" when drafting summaries and follow-ups.'
        )

    return "Context directives:\n- " + "\n- ".join(directives)


def build_system_prompt(
    context: RuntimeContext,
    working_memory: FilterHints | None = None,
) -> str:
    """Build the complete system prompt."""
    runtime_snapshot = format_runtime_snapshot(context)
    contextual_guidance = build_contextual_guidance(context, working_memory)

    return f"""{BASE_INSTRUCTIONS}

Runtime context snapshot:
{runtime_snapshot}

{contextual_guidance}"""
