"""Rate limiting middleware — disabled for internal enterprise use.

With 200 staff and 50-70 concurrent users on an internal network,
rate limiting is unnecessary and would degrade the chat experience.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# No default limits — internal enterprise app, 200 staff, no public exposure
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],  # No rate limits
    enabled=False,
)
