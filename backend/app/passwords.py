import hashlib
import hmac
import secrets

_SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT_PARAMS)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    salt, expected = password_hash.split(":")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **_SCRYPT_PARAMS)
    return hmac.compare_digest(digest.hex(), expected)
