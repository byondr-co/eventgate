from __future__ import annotations

from django.core.files.storage import FileSystemStorage

from apps.common.storage import public_media_storage


def test_falls_back_to_filesystem_when_no_public_bucket(settings):
    # test settings define no STORAGES["media_public"] → local filesystem
    storage = public_media_storage()
    assert isinstance(storage, FileSystemStorage)
