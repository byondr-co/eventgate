from apps.common.tokens import generate_token, hash_token, tokens_match


def test_generate_token_is_long_random() -> None:
    t1 = generate_token()
    t2 = generate_token()
    assert t1 != t2
    assert len(t1) >= 43  # 32 bytes urlsafe-base64-encoded
    assert all(c.isalnum() or c in "-_" for c in t1)


def test_hash_token_is_deterministic_per_input() -> None:
    raw = "abcdef"
    h1 = hash_token(raw)
    h2 = hash_token(raw)
    assert h1 == h2
    assert h1 != raw


def test_hash_differs_per_input() -> None:
    assert hash_token("a") != hash_token("b")


def test_tokens_match_with_constant_time_compare() -> None:
    raw = generate_token()
    stored = hash_token(raw)
    assert tokens_match(raw, stored)
    assert not tokens_match(raw + "x", stored)
    assert not tokens_match("", stored)
