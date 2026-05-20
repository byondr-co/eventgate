from apps.common.qr import render_png


def test_render_png_returns_bytes() -> None:
    data = render_png("hello-world-token")
    assert isinstance(data, bytes)
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(data) > 100


def test_render_png_deterministic_for_same_input() -> None:
    a = render_png("abc")
    b = render_png("abc")
    assert a == b


def test_render_png_differs_for_different_input() -> None:
    assert render_png("a") != render_png("b")


def test_render_png_handles_long_token() -> None:
    long_token = "x" * 256
    data = render_png(long_token)
    assert data[:8] == b"\x89PNG\r\n\x1a\n"


def test_render_png_minimum_pixel_size_320() -> None:
    data = render_png("abc")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    assert width >= 320
    assert height >= 320
