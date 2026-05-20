from django.urls import path

from apps.devices.views import DeviceEnrollView, OrgDeviceViewSet

device_list = OrgDeviceViewSet.as_view({"get": "list", "post": "create"})
device_detail = OrgDeviceViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/devices/",
        device_list,
        name="device-list",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/devices/<uuid:device_id>/",
        device_detail,
        name="device-detail",
    ),
    path("devices/enroll/", DeviceEnrollView.as_view(), name="device-enroll"),
]
