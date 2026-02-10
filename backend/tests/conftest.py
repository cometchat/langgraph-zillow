"""Pytest configuration and fixtures."""

import os
import sys

# Add app directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set test environment variables
os.environ.setdefault("OPENAI_API_KEY", "test-key")
