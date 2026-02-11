# Zillow Clone UI

A React-based real estate frontend with Zillow-style interface and CometChat AI assistant integration.

## Features

- **Property Search** - Filter listings by location, price, beds, baths, sqft, and home type
- **Listing Grid** - Browse properties with sorting options
- **Listing Details** - View comprehensive property information in a modal
- **AI Assistant** - Chat with an AI agent powered by CometChat and LangGraph
- **Real-time Updates** - UI automatically updates when the AI agent returns search results

## Prerequisites

- Node.js 18 or higher
- A [CometChat](https://www.cometchat.com/) account with an app configured

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure CometChat

This application requires CometChat for the AI assistant functionality. You'll need:

1. A CometChat account (sign up at [cometchat.com](https://www.cometchat.com/))
2. A CometChat app with a LangGraph AI agent configured
3. The agent's endpoint URL should point to your backend server's `/run` endpoint

Copy the example environment file and fill in your CometChat credentials:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `VITE_COMETCHAT_APP_ID` | Your CometChat App ID |
| `VITE_COMETCHAT_REGION` | Your CometChat region (e.g., `us`, `eu`) |
| `VITE_COMETCHAT_AUTH_KEY` | Your CometChat Auth Key |
| `VITE_COMETCHAT_UID` | User ID for the chat session |
| `VITE_COMETCHAT_ASSISTANT_UID` | The UID of your LangGraph AI agent in CometChat |

You can find these values in your CometChat dashboard under your app settings.

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm test` | Run tests with Vitest |

## Project Structure

```
ui
├── src
│   ├── components
│   │   ├── TopBar.jsx
│   │   ├── SearchBar.jsx
│   │   ├── MapPanel.jsx
│   │   ├── ListingGrid.jsx
│   │   ├── ListingCard.jsx
│   │   └── ListingModal.jsx
│   ├── hooks
│   │   ├── useAssistantChat.js
│   │   └── useListingsManager.js
│   ├── constants
│   │   ├── filterOptions.js
│   │   └── sortOptions.js
│   ├── utils
│   │   ├── cometchat.js
│   │   ├── filterMetadata.js
│   │   └── listingMetadata.js
│   ├── data
│   │   └── listings.json
│   ├── App.jsx
│   └── main.jsx
├── package.json
└── vite.config.js
```

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **CometChat SDK** - Chat functionality and AI assistant integration
- **Vitest** - Testing framework

## How It Works

1. The UI loads sample listings from `src/data/listings.json`
2. Users can filter and sort listings using the search bar
3. Clicking "Ask AI" opens the CometChat assistant panel
4. User messages are sent to CometChat, which routes them to the LangGraph backend
5. The backend processes requests and returns AG-UI streaming events
6. Tool results (like property searches) automatically update the UI filters and listings
