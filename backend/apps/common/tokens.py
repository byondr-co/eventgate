"""Small token utilities used by magic-link and invite flows.

Tokens are 32 random bytes encoded urlsafe-base64. We store SHA-256 of the
token in the database so a DB leak doesn't expose live tokens. SHA-256 is
deterministic and fast (the tokens are already high-entropy; bcrypt is
overkill here).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets


def generate_token() -> str:
    """Return a 32-byte urlsafe random token (~43 chars)."""
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    """Return the hex SHA-256 of the token. Deterministic; constant-time-compared via tokens_match."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def tokens_match(raw: str, stored_hash: str) -> bool:
    """Constant-time compare. Returns False on empty raw."""
    if not raw:
        return False
    return hmac.compare_digest(hash_token(raw), stored_hash)
