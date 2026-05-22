"""Allow AuditEvent.organization to be NULL for orphan audit events.

Required by the Telegram webhook /start <token> handler: when the inbound
token does not match any guest, there is no organization to attribute the
event to, but we still want to record the attempt for operator visibility.
"""

from __future__ import annotations

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("audit", "0002_append_only_trigger"),
        ("orgs", "0002_invite"),
    ]

    operations = [
        migrations.AlterField(
            model_name="auditevent",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="orgs.organization",
            ),
        ),
    ]
