"""Active Directory authentication service using LDAP."""

import hashlib
import json
import logging
import struct
from dataclasses import dataclass

# --- MD4 compatibility patch for Python 3.12+ / OpenSSL 3.x ---
# OpenSSL 3.x may disable or completely remove MD4. ldap3's NTLM auth
# needs it. Patch hashlib.new to try usedforsecurity=False first, and
# fall back to a pure-Python MD4 if the hash is entirely unavailable.
_original_hashlib_new = hashlib.new


class _PureMD4:
    """Pure-Python MD4 (RFC 1320) used only when OpenSSL lacks MD4."""

    def __init__(self, data=b""):
        self._data = bytearray(data)

    def update(self, data):
        self._data.extend(data)
        return self

    def digest(self):
        msg = bytes(self._data)
        n = len(msg)
        msg += b"\x80"
        msg += b"\x00" * ((55 - n) % 64)
        msg += struct.pack("<Q", n * 8)

        a0, b0, c0, d0 = 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476
        M = 0xFFFFFFFF
        F = lambda x, y, z: (x & y) | ((~x) & z)
        G = lambda x, y, z: (x & y) | (x & z) | (y & z)
        H = lambda x, y, z: x ^ y ^ z
        lrot = lambda v, s: ((v << s) | (v >> (32 - s))) & M

        _R2K = [0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15]
        _R3K = [0,8,4,12,2,10,6,14,1,9,5,13,3,11,7,15]

        for i in range(0, len(msg), 64):
            X = struct.unpack("<16I", msg[i:i+64])
            a, b, c, d = a0, b0, c0, d0

            for k in range(16):
                a = lrot((a + F(b, c, d) + X[k]) & M, [3,7,11,19][k % 4])
                a, b, c, d = d, a, b, c

            for j in range(16):
                a = lrot((a + G(b, c, d) + X[_R2K[j]] + 0x5A827999) & M, [3,5,9,13][j % 4])
                a, b, c, d = d, a, b, c

            for j in range(16):
                a = lrot((a + H(b, c, d) + X[_R3K[j]] + 0x6ED9EBA1) & M, [3,9,11,15][j % 4])
                a, b, c, d = d, a, b, c

            a0 = (a0 + a) & M
            b0 = (b0 + b) & M
            c0 = (c0 + c) & M
            d0 = (d0 + d) & M

        return struct.pack("<4I", a0, b0, c0, d0)

    def hexdigest(self):
        return self.digest().hex()


def _patched_hashlib_new(name, data=b"", **kwargs):
    try:
        return _original_hashlib_new(name, data, **kwargs)
    except ValueError:
        if name.upper() == "MD4":
            try:
                return _original_hashlib_new(name, data, usedforsecurity=False)
            except ValueError:
                return _PureMD4(data)
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
        except ValueError as e:
            logger.error("NTLM hash error during auth for %s: %s", username, str(e))
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
