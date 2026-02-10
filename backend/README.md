# LangGraph Zillow Agent

A real estate chatbot built with LangGraph, featuring property search, listing details, FAQ knowledge base, and tour scheduling via Google Calendar.

## Features

- **Property Search**: Search listings by location, price, beds, baths, sqft, and home type
- **Listing Details**: Get comprehensive property information including schools, climate factors, and price history
- **Knowledge Base**: Answer FAQs about Zillow policies (commissions, Zestimates, Premier Agent)
- **Tour Scheduling**: Book property tours with Google Calendar integration
- **AG-UI Protocol**: Streaming responses compatible with AG-UI clients
- **Working Memory**: Filter persistence across conversation turns

## Setup

### Prerequisites

- Python 3.11 or higher

### 1. Create Virtual Environment

```bash
cd langgraph-zillow
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -e .
```

Or with uv:

```bash
uv pip install -e .
```

### 3. Configure Environment

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google service account email for Calendar API
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: Google service account private key
- `GOOGLE_CALENDAR_ID`: Google Calendar ID for tour bookings
- `GOOGLE_CALENDAR_TIMEZONE`: Timezone for tour scheduling (default: America/Denver)

Optional:

- `TOUR_WORKING_HOURS_START`: Start hour for tours (default: 9)
- `TOUR_WORKING_HOURS_END`: End hour for tours (default: 18)
- `HOST`: Server host (default: 0.0.0.0)
- `PORT`: Server port (default: 8000)

### 4. Run the Server

```bash
python -m app.main
```

Or with uvicorn directly:

```bash
uvicorn app.server:app --host 0.0.0.0 --port 8000 --reload
```

## API Usage

### POST /run

Run the agent with AG-UI streaming events.

**Request Body (RunAgentInput):**

```json
{
  "messages": [
    {"role": "user", "content": "Show me houses in Texas under $400k"}
  ],
  "threadId": "thread-123",
  "runId": "run-456",
  "forwardedProps": {
    "cometchatContext": {
      "sender": {"uid": "user-1", "role": "default"},
      "messageMetadata": {
        "filters": {
          "query": "Texas",
          "maxPrice": 400000
        }
      }
    }
  }
}
```

**Response:** Server-Sent Events stream with AG-UI events:

- `run_started`: Processing started
- `text_message_start`: New message started
- `text_message_content`: Message content chunk
- `text_message_end`: Message completed
- `tool_call_start`: Tool invocation started
- `tool_call_args`: Tool arguments
- `tool_call_end`: Tool completed with result
- `run_finished`: Processing completed
- `run_error`: Error occurred

### GET /health

Health check endpoint.

### GET /

API information.

## Project Structure

```
langgraph-zillow
├── app
│   ├── __init__.py
│   ├── agent.py
│   ├── agui_events.py
│   ├── data
│   │   ├── __init__.py
│   │   ├── listings.json
│   │   └── loader.py
│   ├── main.py
│   ├── memory.py
│   ├── prompt_builder.py
│   ├── server.py
│   ├── tools
│   │   ├── __init__.py
│   │   ├── knowledge_base.py
│   │   ├── listing_details.py
│   │   ├── property_search.py
│   │   └── tour_scheduler.py
│   └── utils
│       ├── __init__.py
│       ├── context_extractor.py
│       ├── google_calendar.py
│       └── normalizers.py
├── pyproject.toml
├── README.md
├── .env.example
└── tests
    ├── __init__.py
    ├── conftest.py
    ├── test_context_extractor.py
    ├── test_memory.py
    ├── test_property_search.py
    └── test_server.py
```

## Development

### Running Tests

Run all tests:

```bash
pytest
```

Run with verbose output:

```bash
pytest -v
```

Run specific test file:

```bash
pytest tests/test_context_extractor.py
```

Run with coverage:

```bash
pytest --cov=app
```

### Code Formatting

```bash
ruff check .
ruff format .
```

