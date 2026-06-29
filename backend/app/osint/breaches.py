"""XposedOrNot breach-analytics lookup."""

from __future__ import annotations

import httpx


def breach_lookup(email: str) -> dict:
    """Check XposedOrNot for known data breaches that exposed this email.

    Returns the list of breaches with dates, exposed data classes, record counts,
    plus an aggregated set of exposed data classes across all breaches.

    Args:
        email: The email address to look up.

    Returns:
        Dict with keys: email, breach_count, breaches, exposed_data_classes,
        risk_score (provider-supplied, optional), industry_breakdown (optional),
        error (optional).
    """
    url = f"https://api.xposedornot.com/v1/breach-analytics?email={email}"
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, headers={"Accept": "application/json"})
        if response.status_code == 404:
            return {
                "email": email,
                "breach_count": 0,
                "breaches": [],
                "exposed_data_classes": [],
            }
        if response.status_code >= 400:
            return {
                "email": email,
                "breach_count": 0,
                "breaches": [],
                "exposed_data_classes": [],
                "error": f"XposedOrNot API {response.status_code}",
            }
        payload = response.json()
    except httpx.HTTPError as exc:
        return {
            "email": email,
            "breach_count": 0,
            "breaches": [],
            "exposed_data_classes": [],
            "error": str(exc),
        }

    raw_breaches = (payload.get("ExposedBreaches") or {}).get(
        "breaches_details"
    ) or []
    breaches = []
    data_classes: set[str] = set()
    for b in raw_breaches:
        exposed_raw = b.get("xposed_data")
        exposed = (
            [s.strip() for s in exposed_raw.split(";")]
            if isinstance(exposed_raw, str)
            else (exposed_raw or [])
        )
        for cls in exposed:
            if cls:
                data_classes.add(cls)
        breaches.append(
            {
                "name": b.get("breach"),
                "date": b.get("xposed_date"),
                "exposed_data": exposed,
                "records": b.get("xposed_records"),
                "description": b.get("details"),
            }
        )

    metrics = payload.get("BreachMetrics") or {}
    risk_block = (metrics.get("risk") or [{}])[0] if metrics.get("risk") else {}
    industry_pairs = (metrics.get("industry") or [None])[0]
    industry_breakdown = (
        {k: v for k, v in industry_pairs if v > 0}
        if isinstance(industry_pairs, list)
        else None
    )

    return {
        "email": email,
        "breach_count": len(breaches),
        "breaches": breaches,
        "exposed_data_classes": sorted(data_classes),
        "risk_score": risk_block.get("risk_score") if risk_block else None,
        "industry_breakdown": industry_breakdown,
    }
