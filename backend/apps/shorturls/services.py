from __future__ import annotations

import secrets

from apps.shorturls.models import ShortUrl

# Base58: avoid 0, O, I, l for unambiguous reading
_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def generate_short_code(length: int = 8, max_attempts: int = 20) -> str:
    """Generate a unique short code. Retries up to max_attempts on collision."""
    for _ in range(max_attempts):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        if not ShortUrl.objects.filter(short_code=code).exists():
            return code
    raise RuntimeError(f"Failed to generate unique short_code after {max_attempts} attempts")
