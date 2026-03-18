"""Rate limiting middleware for enterprise use.

Conservative limits to prevent abuse while allowing normal usage
for 200 staff / 50-70 concurrent users on an internal network.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],  # generous default for normal API use
    enabled=True,
)
