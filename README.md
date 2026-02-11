# Zillow Real Estate Chatbot

A full-stack real estate application featuring an AI-powered chatbot built with LangGraph and a React frontend integrated with CometChat.

## Overview

This project consists of two main components:

- **[Backend](./backend/README.md)** - LangGraph-based AI agent with property search, listing details, FAQ knowledge base, and tour scheduling
- **[UI](./ui/README.md)** - React frontend with Zillow-style interface and CometChat integration

## Quick Start

### 1. Set Up the Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
# Edit .env with your OpenAI API key and Google Calendar credentials
python -m app.main
```

The backend server will start at `http://localhost:8000`. You can access the interactive API documentation (Swagger UI) at `http://localhost:8000/docs`.

### 2. Set Up CometChat

This application requires a [CometChat](https://www.cometchat.com/) account for the AI assistant chat functionality.

1. Create a CometChat account and set up an app
2. In the CometChat dashboard, create a LangGraph AI agent
3. Configure the agent's endpoint URL as your backend's `/run` endpoint
   - CometChat requires a **publicly accessible URL** (localhost won't work)
   - For local development: Use a tunnel like [ngrok](https://ngrok.com/) to expose your backend (e.g., `https://abc123.ngrok.io/run`)
   - For production: Use your deployed backend URL (e.g., `https://your-domain.com/run`)
   - Tip: Append `?debug=1` to the URL (e.g., `https://abc123.ngrok.io/run?debug=1`) to enable verbose logging of requests and LLM calls for debugging
4. Note your App ID, Region, Auth Key, and the Assistant UID from the dashboard

### 3. Set Up the UI

```bash
cd ui
npm install
cp .env.example .env
# Edit .env with your CometChat credentials
npm run dev
```

The UI will start at `http://localhost:5173`.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   React UI      │────▶│   CometChat     │────▶│  LangGraph      │
│   (Vite)        │     │   Platform      │     │  Backend        │
│                 │◀────│                 │◀────│  (FastAPI)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Features

- **Property Search** - Search by location, price, beds, baths, sqft, and home type
- **Listing Details** - View comprehensive property information including schools and climate factors
- **Knowledge Base** - Get answers about Zillow policies and programs
- **Tour Scheduling** - Book property tours via Google Calendar integration
- **AI Chat** - Natural language interface powered by GPT-4o

## Documentation

- [Backend Documentation](./backend/README.md) - API details, setup, and development guide
- [UI Documentation](./ui/README.md) - Frontend setup and CometChat configuration

## License

See [LICENSE](./LICENSE) for details.
