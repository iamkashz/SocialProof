"""Gravatar profile lookup."""

from __future__ import annotations

import hashlib

import httpx


def gravatar_lookup(email: str) -> dict:
    """Look up a Gravatar profile for the given email address.

    Gravatar profiles often include display name, location, bio, and links to
    other social accounts the user has registered.

    Args:
        email: The email address to look up.

    Returns:
        Dict with keys: email, hash (md5), exists, profile_url, avatar_url,
        display_name, preferred_username, about_me, location, accounts, error.
    """
    normalized = email.strip().lower().encode()
    sha256 = hashlib.sha256(normalized).hexdigest()
    md5 = hashlib.md5(normalized).hexdigest()
    url = f"https://gravatar.com/{sha256}.json"

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                url,
                headers={
                    "User-Agent": "SocialProof-OSINT",
                    "Accept": "application/json",
                },
            )
    except httpx.HTTPError as exc:
        return {"email": email, "hash": md5, "exists": False, "error": str(exc)}

    if response.status_code >= 400:
        return {
            "email": email,
            "hash": md5,
            "exists": False,
            "avatar_url": f"https://gravatar.com/avatar/{md5}?d=404",
        }

    try:
        payload = response.json()
    except ValueError:
        return {
            "email": email,
            "hash": md5,
            "exists": False,
            "error": "Invalid JSON response from Gravatar",
        }

    entry = (payload.get("entry") or [{}])[0] if payload.get("entry") else {}
    accounts = [
        {"shortname": a.get("shortname"), "url": a.get("url")}
        for a in (entry.get("accounts") or [])
    ]
    return {
        "email": email,
        "hash": md5,
        "exists": True,
        "profile_url": entry.get("profileUrl"),
        "avatar_url": entry.get("thumbnailUrl") or f"https://gravatar.com/avatar/{md5}",
        "display_name": entry.get("displayName"),
        "preferred_username": entry.get("preferredUsername"),
        "about_me": entry.get("aboutMe"),
        "location": entry.get("currentLocation"),
        "accounts": accounts,
    }
