import anthropic
from django.conf import settings

MODEL = 'claude-sonnet-5'

_client = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            max_retries=3,
        )
    return _client


def create_message(*, messages, system=None, max_tokens=4096, **kwargs):
    if system is not None:
        kwargs['system'] = system
    return get_client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=messages,
        **kwargs,
    )
