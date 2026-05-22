from django.urls import path

from apps.notifications.views import telegram_webhook

urlpatterns = [
    path("telegram/webhook/", telegram_webhook, name="telegram-webhook"),
]
