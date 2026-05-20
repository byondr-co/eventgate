"""QR PNG rendering.

Renders the raw token directly — no URL wrapping, per brief Appendix A
(pre-registered QR = identity, staff scanner session = permission).
"""

from __future__ import annotations

import io

import segno


def render_png(token: str, *, scale: int = 17, border: int = 2) -> bytes:
    """Render `token` as a PNG QR code. Default size ~370x370 px."""
    qr = segno.make(token, error="M")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=scale, border=border)
    return buf.getvalue()
