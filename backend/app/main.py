"""Main entry point for the Zillow Agent server."""

import os

import uvicorn
from dotenv import load_dotenv

from .utils.logging import logger

load_dotenv()

def main():
    """Run the Zillow Agent server."""
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "false").lower() == "true"

    logger.info("Starting Zillow Agent server on %s:%s", host, port)

    uvicorn.run(
        "app.server:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    main()
