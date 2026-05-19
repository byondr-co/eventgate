from celery import shared_task


@shared_task
def ping() -> str:
    """Smoke task. Returns 'pong'."""
    return "pong"
