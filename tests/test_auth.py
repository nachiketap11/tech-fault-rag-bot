from unittest.mock import patch

import pytest

from app.services.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_correct_password():
    hashed = hash_password("correctpassword")
    assert verify_password("correctpassword", hashed)


def test_wrong_password_does_not_verify():
    hashed = hash_password("correctpassword")
    assert not verify_password("wrongpassword", hashed)


def test_hash_is_not_plaintext():
    password = "mysecret123"
    hashed = hash_password(password)
    assert password not in hashed


def test_two_hashes_of_same_password_differ():
    hashed_a = hash_password("samepassword")
    hashed_b = hash_password("samepassword")
    assert hashed_a != hashed_b  # different salts


def test_create_and_decode_token():
    user = {"id": "user-abc", "email": "test@example.com"}
    with patch("app.services.auth.ACCESS_TOKEN_EXPIRE_SECONDS", 3600):
        token = create_access_token(user)
    payload = decode_access_token(token)
    assert payload["sub"] == "user-abc"
    assert payload["email"] == "test@example.com"


def test_expired_token_raises_401():
    from fastapi import HTTPException
    user = {"id": "user-abc", "email": "test@example.com"}
    with patch("app.services.auth.ACCESS_TOKEN_EXPIRE_SECONDS", -1):
        token = create_access_token(user)
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(token)
    assert exc_info.value.status_code == 401


def test_tampered_token_raises_401():
    from fastapi import HTTPException
    user = {"id": "user-abc", "email": "test@example.com"}
    with patch("app.services.auth.ACCESS_TOKEN_EXPIRE_SECONDS", 3600):
        token = create_access_token(user)
    tampered = token[:-5] + "XXXXX"
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(tampered)
    assert exc_info.value.status_code == 401
