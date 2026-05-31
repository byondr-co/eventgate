"""Storage selector for publicly-served uploads (e.g. event banners).

Returns an S3 (Tigris) storage with public-read ACL and NO signed-URL expiry
when a public bucket is configured (prod/staging), else the default local
filesystem storage (dev/test). Used as a callable `storage=` on ImageFields so
the chosen backend is resolved at runtime, not baked into migrations.
"""

from __future__ import annotations

from django.conf import settings
from django.core.files.storage import FileSystemStorage, storages


def public_media_storage():
    if "media_public" in getattr(settings, "STORAGES", {}):
        return storages["media_public"]
    return FileSystemStorage()
