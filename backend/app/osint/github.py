"""GitHub commit-search and profile lookup."""

from __future__ import annotations

import os

import httpx

_USER_AGENT = "SocialProof-OSINT"


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": _USER_AGENT,
    }
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _profile_payload(u: dict) -> dict:
    return {
        "login": u.get("login"),
        "name": u.get("name"),
        "bio": u.get("bio"),
        "location": u.get("location"),
        "company": u.get("company"),
        "blog": u.get("blog"),
        "twitter_username": u.get("twitter_username"),
        "public_repos": u.get("public_repos"),
        "followers": u.get("followers"),
        "created_at": u.get("created_at"),
        "avatar_url": u.get("avatar_url"),
        "html_url": u.get("html_url"),
    }


def github_profile_lookup(username: str) -> dict:
    """Fetch the public GitHub profile for a known username.

    Use this when a username has already been discovered (from a commit
    search, breach mention, or another platform) and you need profile
    metadata: real name, location, company, linked Twitter, blog, account
    age. May reveal further linked identities to pivot on.

    Args:
        username: The GitHub login to look up.

    Returns:
        Dict with keys: username, found, profile (optional), error (optional).
    """
    if not username or not username.strip():
        return {"username": username, "found": False, "error": "empty username"}
    try:
        with httpx.Client(timeout=8.0, headers=_headers()) as client:
            response = client.get(f"https://api.github.com/users/{username}")
    except httpx.HTTPError as exc:
        return {"username": username, "found": False, "error": str(exc)}

    if response.status_code == 404:
        return {"username": username, "found": False}
    if response.status_code >= 400:
        return {
            "username": username,
            "found": False,
            "error": f"GitHub API {response.status_code}",
        }
    return {
        "username": username,
        "found": True,
        "profile": _profile_payload(response.json()),
    }


def github_lookup(email: str) -> dict:
    """Search GitHub public commits and user metadata associated with an email.

    Discovers usernames by querying commit search with `<email> in:author-email`,
    then enriches with profile data (real name, location, bio, account age, etc.)
    for the first discovered username.

    Args:
        email: The email address to search for.

    Returns:
        Dict with keys: email, commit_count, usernames, profile (optional),
        recent_commits, error (optional).
    """
    finding: dict = {
        "email": email,
        "commit_count": 0,
        "usernames": [],
        "recent_commits": [],
    }

    # The `author-email:<value>` qualifier is the documented form and is
    # case-insensitive. The older `<email> in:author-email` form silently
    # under-matches (returned 0 for a known-good address during testing).
    normalized = (email or "").strip().lower()
    search_url = "https://api.github.com/search/commits"
    try:
        with httpx.Client(timeout=10.0, headers=_headers()) as client:
            search_resp = client.get(
                search_url,
                params={"q": f"author-email:{normalized}", "per_page": 20},
                headers={"Accept": "application/vnd.github.cloak-preview+json"},
            )
            if search_resp.status_code >= 400:
                finding["error"] = f"GitHub commit search {search_resp.status_code}"
                return finding

            data = search_resp.json()
            finding["commit_count"] = data.get("total_count", 0)
            usernames: set[str] = set()
            for item in data.get("items") or []:
                author = item.get("author") or {}
                committer = item.get("committer") or {}
                login = author.get("login") or committer.get("login")
                if login:
                    usernames.add(login)
                commit = item.get("commit") or {}
                message = (commit.get("message") or "").splitlines()
                finding["recent_commits"].append(
                    {
                        "repo": (item.get("repository") or {}).get("full_name"),
                        "message": (message[0] if message else "")[:200],
                        "sha": (item.get("sha") or "")[:7],
                        "url": item.get("html_url"),
                        "date": (commit.get("author") or {}).get("date"),
                    }
                )
            finding["usernames"] = sorted(usernames)

            primary = finding["usernames"][0] if finding["usernames"] else None
            if primary:
                profile_resp = client.get(f"https://api.github.com/users/{primary}")
                if profile_resp.status_code < 400:
                    finding["profile"] = _profile_payload(profile_resp.json())
    except httpx.HTTPError as exc:
        finding["error"] = str(exc)
    return finding
