from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("guests", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="guest",
            constraint=models.UniqueConstraint(
                fields=("event", "gate", "scanner"),
                condition=models.Q(entry_status="displayed", guest_type="walk_in"),
                name="one_displayed_walkin_per_scope",
            ),
        ),
    ]
