from rest_framework.routers import SimpleRouter

from apps.orgs.views import OrganizationViewSet

router = SimpleRouter(trailing_slash=True)
router.register("orgs", OrganizationViewSet, basename="orgs")

urlpatterns = router.urls
