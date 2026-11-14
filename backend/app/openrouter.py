import os
import ssl
from pathlib import Path
from typing import Any

import httpx2 as httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
DEFAULT_CA_BUNDLE_PATH = Path("/data/openrouter-ca.pem")


class OpenRouterConfigurationError(RuntimeError):
    pass


class OpenRouterError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        public_message: str = "AI provider request failed",
    ) -> None:
        super().__init__(message)
        self.public_message = public_message


class OpenRouterClient:
    def __init__(
        self,
        api_key: str | None = None,
        *,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._api_key = api_key if api_key is not None else os.getenv("OPENROUTER_API_KEY")
        self._http_client = http_client
        configured_ca_bundle = os.getenv("OPENROUTER_CA_BUNDLE")
        self._ca_bundle = (
            Path(configured_ca_bundle)
            if configured_ca_bundle
            else DEFAULT_CA_BUNDLE_PATH
            if DEFAULT_CA_BUNDLE_PATH.is_file()
            else None
        )

    def _ssl_context(self) -> ssl.SSLContext | bool:
        if self._ca_bundle is None:
            return True

        context = ssl.create_default_context()
        try:
            context.load_verify_locations(cafile=self._ca_bundle)
        except (OSError, ssl.SSLError):
            raise OpenRouterConfigurationError(
                "The configured OpenRouter CA bundle could not be loaded"
            ) from None
        return context

    def complete(self, prompt: str, *, json_mode: bool = False) -> str:
        if not self._api_key:
            raise OpenRouterConfigurationError("OPENROUTER_API_KEY is not configured")

        request = {
            "model": OPENROUTER_MODEL,
            "messages": [{"role": "user", "content": prompt}],
        }
        if json_mode:
            request["response_format"] = {"type": "json_object"}
        try:
            if self._http_client is not None:
                response = self._http_client.post(
                    OPENROUTER_URL,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=request,
                    timeout=30,
                )
            else:
                with httpx.Client(timeout=30, verify=self._ssl_context()) as client:
                    response = client.post(
                        OPENROUTER_URL,
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        json=request,
                    )
        except httpx.HTTPError as error:
            if "certificate_verify_failed" in str(error).lower():
                raise OpenRouterError(
                    "OpenRouter TLS certificate verification failed",
                    public_message=(
                        "OpenRouter TLS verification failed. Configure a trusted "
                        "OPENROUTER_CA_BUNDLE."
                    ),
                ) from None
            raise OpenRouterError("OpenRouter request failed") from None

        if response.is_error:
            raise OpenRouterError(
                f"OpenRouter returned HTTP {response.status_code}",
                public_message=(
                    f"OpenRouter returned HTTP {response.status_code}. "
                    "Check the API key and provider account."
                ),
            )

        try:
            result: Any = response.json()
        except ValueError:
            raise OpenRouterError("OpenRouter returned invalid JSON") from None

        try:
            content = result["choices"][0]["message"]["content"]
        except (IndexError, KeyError, TypeError):
            raise OpenRouterError("OpenRouter response did not contain a message") from None
        if not isinstance(content, str) or not content.strip():
            raise OpenRouterError("OpenRouter response did not contain a message")
        return content.strip()
