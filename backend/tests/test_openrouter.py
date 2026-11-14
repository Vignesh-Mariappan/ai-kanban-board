import json
import os
import re
import ssl
from collections.abc import Callable
from pathlib import Path

import httpx2 as httpx
import pytest

from app.openrouter import (
    OPENROUTER_MODEL,
    OPENROUTER_URL,
    OpenRouterClient,
    OpenRouterConfigurationError,
    OpenRouterError,
)

API_KEY = "test-key-not-a-secret"


def mocked_client(
    handler: Callable[[httpx.Request], httpx.Response],
) -> tuple[OpenRouterClient, httpx.Client]:
    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    return OpenRouterClient(API_KEY, http_client=http_client), http_client


def test_complete_sends_configured_model_and_parses_reply() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert str(request.url) == OPENROUTER_URL
        assert request.headers["Authorization"] == f"Bearer {API_KEY}"
        assert json.loads(request.content) == {
            "model": OPENROUTER_MODEL,
            "messages": [{"role": "user", "content": "What is 2+2?"}],
        }
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "  4  "}}]},
        )

    client, http_client = mocked_client(respond)
    with http_client:
        assert client.complete("What is 2+2?") == "4"


def test_complete_requests_json_output_when_enabled() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["response_format"] == {"type": "json_object"}
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"response":"ok"}'}}]},
        )

    client, http_client = mocked_client(respond)
    with http_client:
        assert client.complete("Return JSON", json_mode=True) == '{"response":"ok"}'


def test_provider_error_does_not_expose_key_or_response_body() -> None:
    client, http_client = mocked_client(
        lambda _: httpx.Response(401, text=f"invalid token: {API_KEY}")
    )
    with http_client, pytest.raises(OpenRouterError, match="HTTP 401") as error:
        client.complete("Hello")

    assert API_KEY not in str(error.value)


def test_transport_error_is_reported_without_request_details() -> None:
    def fail(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection failed")

    client, http_client = mocked_client(fail)
    with http_client, pytest.raises(OpenRouterError, match="request failed"):
        client.complete("Hello")


def test_missing_api_key_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(OpenRouterConfigurationError, match="not configured"):
        OpenRouterClient().complete("Hello")


def test_configured_ca_bundle_is_added_to_default_trust(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    default_bundle = ssl.get_default_verify_paths().cafile
    assert default_bundle is not None
    monkeypatch.setenv("OPENROUTER_CA_BUNDLE", default_bundle)

    context = OpenRouterClient(API_KEY)._ssl_context()

    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


def test_invalid_ca_bundle_is_reported_without_disabling_tls(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("OPENROUTER_CA_BUNDLE", str(tmp_path / "missing.pem"))

    with pytest.raises(
        OpenRouterConfigurationError,
        match="CA bundle could not be loaded",
    ):
        OpenRouterClient(API_KEY)._ssl_context()


def test_tls_errors_explain_ca_configuration_without_provider_details() -> None:
    client, http_client = mocked_client(
        lambda _: (_ for _ in ()).throw(
            httpx.ConnectError("CERTIFICATE_VERIFY_FAILED: internal cert detail")
        )
    )
    with http_client, pytest.raises(OpenRouterError) as error:
        client.complete("Hello")

    assert "OPENROUTER_CA_BUNDLE" in error.value.public_message


def test_api_key_is_read_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", API_KEY)

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == f"Bearer {API_KEY}"
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "ok"}}]},
        )

    http_client = httpx.Client(transport=httpx.MockTransport(respond))
    with http_client:
        assert OpenRouterClient(http_client=http_client).complete("Hello") == "ok"


def test_invalid_provider_response_is_reported() -> None:
    client, http_client = mocked_client(lambda _: httpx.Response(200, json={}))
    with http_client, pytest.raises(OpenRouterError, match="did not contain a message"):
        client.complete("Hello")


@pytest.mark.openrouter
@pytest.mark.skipif(
    os.getenv("RUN_OPENROUTER_SMOKE_TEST") != "1",
    reason="set RUN_OPENROUTER_SMOKE_TEST=1 to call OpenRouter",
)
def test_openrouter_smoke_check_answers_two_plus_two() -> None:
    answer = OpenRouterClient().complete(
        "What is 2+2? Include the digit 4 in your answer."
    )

    assert re.search(r"(?<!\d)4(?!\d)", answer)
