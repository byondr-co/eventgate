from django.urls import path

from apps.shorturls.views import redirect_short_url

urlpatterns = [
    path("r/<str:short_code>/", redirect_short_url, name="shorturl-redirect"),
]
