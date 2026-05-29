from django.urls import path
from .views import (
    groups_view,
    join_group_view,
    group_detail_view,
    group_members_view,
    group_expenses_view,
    group_settlements_view,
)

urlpatterns = [
    path("groups/", groups_view),
    path("groups/join/", join_group_view),
    path("groups/<int:group_id>/", group_detail_view),
    path("groups/<int:group_id>/members/", group_members_view),
    path("groups/<int:group_id>/expenses/", group_expenses_view),
    path("groups/<int:group_id>/settlements/", group_settlements_view),
]
