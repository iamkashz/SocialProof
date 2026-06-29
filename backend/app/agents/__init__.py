"""Multi-agent SocialProof orchestration.

Topology:

    SocialProofRoot (Sequential)
    ├─ seed_agent              # validates the email; seeds state['email']
    ├─ recon_phase (Parallel)
    │  ├─ breach_agent         # XposedOrNot
    │  ├─ github_email_agent   # commit search + profile
    │  ├─ gravatar_agent       # public profile JSON
    │  ├─ paste_agent          # IntelligenceX (paste/leak/darknet)
    │  └─ account_enum_agent   # user-scanner email-side (~95 services)
    ├─ post_recon_identity_agent  # collects candidate usernames into state
    ├─ pivot_phase (Loop, max=2)
    │  └─ pivot_step (Sequential)
    │     ├─ username_enum_agent          # user-scanner usernames (~95)
    │     ├─ profile_pivot_agent          # GitHub profile enrichment
    │     ├─ pivot_identity_agent         # re-aggregate after pivot
    │     ├─ handle_discovery_agent       # Gemini prose-mines new handles
    │     ├─ post_discovery_identity_agent # re-aggregate after discovery
    │     └─ pivot_guard                  # escalates when no new handles
    ├─ analyst_agent           # calls deterministic correlate_risk
    └─ narrator_agent          # writes short executive summary
"""

from .root import root_agent

__all__ = ["root_agent"]
