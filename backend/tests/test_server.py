"""Tests for FastAPI server endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.server import app


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_returns_ok(self, client):
        """Health endpoint should return healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "zillow-agent"


class TestRootEndpoint:
    """Tests for / endpoint."""

    def test_root_returns_api_info(self, client):
        """Root endpoint should return API information."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Zillow Agent API"
        assert "endpoints" in data


class TestRunEndpoint:
    """Tests for /run endpoint."""

    def test_accepts_camel_case_ids(self, client):
        """Should accept camelCase threadId and runId."""
        response = client.post(
            "/run",
            json={
                "messages": [{"role": "user", "content": "hello"}],
                "threadId": "test-thread",
                "runId": "test-run",
            },
            headers={"Accept": "application/x-ndjson"},
        )
        # Should not error on request parsing
        assert response.status_code == 200

    def test_accepts_snake_case_ids(self, client):
        """Should accept snake_case thread_id and run_id."""
        response = client.post(
            "/run",
            json={
                "messages": [{"role": "user", "content": "hello"}],
                "thread_id": "test-thread",
                "run_id": "test-run",
            },
            headers={"Accept": "application/x-ndjson"},
        )
        assert response.status_code == 200

    def test_accepts_forwarded_props(self, client):
        """Should accept forwardedProps with cometchatContext."""
        response = client.post(
            "/run",
            json={
                "messages": [{"role": "user", "content": "hello"}],
                "threadId": "test-thread",
                "forwardedProps": {
                    "cometchatContext": {
                        "sender": {"uid": "user-1", "role": "default"},
                        "messageMetadata": {"zpid": "12345"}
                    }
                }
            },
            headers={"Accept": "application/x-ndjson"},
        )
        assert response.status_code == 200

    def test_returns_ndjson_content_type(self, client):
        """Should return NDJSON content type."""
        response = client.post(
            "/run",
            json={
                "messages": [{"role": "user", "content": "hello"}],
                "threadId": "test-thread",
            },
        )
        assert response.headers["content-type"] == "application/x-ndjson"
