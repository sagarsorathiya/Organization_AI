"""Active Directory authentication service using LDAP."""

import hashlib
import json
import logging
from dataclasses import dataclass

# --- MD4 compatibility patch for Python 3.12+ / OpenSSL 3.x ---
# OpenSSL 3.x disables MD4 by default. ldap3's NTLM auth needs it but
# doesn't pass usedforsecurity=False. Patch hashlib.new to handle this.
_original_hashlib_new = hashlib.new


def _patched_hashlib_new(name, data=b"", **kwargs):
    try:
        return _original_hashlib_new(name, data, **kwargs)
    except ValueError:
        if name.upper() == "MD4":
            return _original_hashlib_new(name, data, usedforsecurity=False)
        raise


hashlib.new = _patched_hashlib_new
# --- End MD4 patch ---

from ldap3 import Server, Connection, ALL, NTLM, SUBTREE
from ldap3.core.exceptions import LDAPException

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ADUserInfo:
    username: str
    display_name: str
    email: str | None
    department: str | None
    groups: list[str]


class ADService:
    """Handles all Active Directory / LDAP operations."""

    def __init__(self):
        self.server = Server(
            settings.AD_SERVER,
            port=settings.AD_PORT,
            use_ssl=settings.AD_USE_SSL,
            get_info=ALL,
        )

    def reload(self):
        """Recreate the LDAP server object from current in-memory settings."""
        self.server = Server(
            settings.AD_SERVER,
            port=settings.AD_PORT,
            use_ssl=settings.AD_USE_SSL,
            get_info=ALL,
        )
        logger.info("AD service reloaded: server=%s port=%s", settings.AD_SERVER, settings.AD_PORT)

    def test_connection(self) -> dict:
        """Test connectivity to the configured AD/LDAP server. Returns status dict."""
        try:
            server = Server(
                settings.AD_SERVER,
                port=settings.AD_PORT,
                use_ssl=settings.AD_USE_SSL,
                get_info=ALL,
                connect_timeout=10,
            )
            # Use bind credentials if configured, otherwise try anonymous
            if settings.AD_BIND_USER:
                ntlm_user = f"{settings.AD_DOMAIN}\\{settings.AD_BIND_USER}"
                conn = Connection(
                    server,
                    user=ntlm_user,
                    password=settings.AD_BIND_PASSWORD.get_secret_value(),
                    authentication=NTLM,
                    raise_exceptions=True,
                    read_only=True,
                )
                conn.bind()
                conn.unbind()
                return {"success": True, "message": f"Successfully authenticated to {settings.AD_SERVER}:{settings.AD_PORT} as {settings.AD_BIND_USER}"}
            else:
                conn = Connection(server, auto_bind=False, raise_exceptions=True, read_only=True)
                conn.open()
                server_info = str(server.info) if server.info else "Connected"
                conn.unbind()
                return {"success": True, "message": f"Successfully connected to {settings.AD_SERVER}:{settings.AD_PORT}"}
        except LDAPException as e:
            return {"success": False, "message": f"LDAP error: {str(e)}"}
        except OSError as e:
            return {"success": False, "message": f"Network error: {str(e)}"}
        except Exception as e:
            return {"success": False, "message": f"Connection failed: {str(e)}"}

    def authenticate(self, username: str, password: str) -> ADUserInfo | None:
        """Authenticate user against AD and return their info."""
        # Build the NTLM user string: DOMAIN\\username
        ntlm_user = f"{settings.AD_DOMAIN}\\{username}"

        try:
            conn = Connection(
                self.server,
                user=ntlm_user,
                password=password,
                authentication=NTLM,
                raise_exceptions=True,
                read_only=True,
            )

            if not conn.bind():
                logger.warning("AD auth failed for user: %s", username)
                return None

            # Search for the user to get attributes
            user_info = self._get_user_info(conn, username)
            conn.unbind()
            return user_info

        except LDAPException as e:
            logger.error("LDAP error during auth for %s: %s", username, str(e))
            return None

    def _get_user_info(self, conn: Connection, username: str) -> ADUserInfo | None:
        """Fetch user attributes from AD."""
        search_filter = f"(sAMAccountName={_escape_ldap_filter(username)})"
        attributes = [
            "sAMAccountName",
            "displayName",
            "mail",
            "department",
            "memberOf",
        ]

        conn.search(
            search_base=settings.AD_USER_SEARCH_BASE,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=attributes,
        )

        if not conn.entries:
            logger.warning("User not found in AD: %s", username)
            return None

        entry = conn.entries[0]

        # Extract group names from distinguished names
        groups = []
        member_of = entry.memberOf.values if hasattr(entry, "memberOf") and entry.memberOf else []
        for group_dn in member_of:
            # Extract CN from DN like "CN=GroupName,OU=Groups,DC=domain,DC=local"
            cn = group_dn.split(",")[0]
            if cn.upper().startswith("CN="):
                groups.append(cn[3:])

        return ADUserInfo(
            username=str(entry.sAMAccountName),
            display_name=str(entry.displayName) if entry.displayName else username,
            email=str(entry.mail) if entry.mail else None,
            department=str(entry.department) if entry.department else None,
            groups=groups,
        )

    def is_admin(self, groups: list[str]) -> bool:
        """Check if user belongs to any admin group."""
        admin_groups_lower = {g.lower() for g in settings.ADMIN_GROUPS}
        return any(g.lower() in admin_groups_lower for g in groups)


def _escape_ldap_filter(value: str) -> str:
    """Escape special characters in LDAP filter values to prevent injection."""
    replacements = {
        "\\": "\\5c",
        "*": "\\2a",
        "(": "\\28",
        ")": "\\29",
        "\x00": "\\00",
    }
    result = value
    for char, escape in replacements.items():
        result = result.replace(char, escape)
    return result


# Singleton
ad_service = ADService()
