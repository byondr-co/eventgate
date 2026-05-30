"""Invite lifecycle: send + accept. Membership CRUD."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.common.tokens import generate_token, hash_token, tokens_match
from apps.orgs.models import Invite, Organization, OrganizationMembership


class InviteError(Exception):
    pass


class InviteAlreadyMember(InviteError):
    pass


class InviteExpired(InviteError):
    pass


class InviteEmailMismatch(InviteError):
    pass


class InviteInvalid(InviteError):
    pass


@transaction.atomic
def send_invite(*, organization: Organization, email: str, role: str, invited_by) -> Invite:
    email = email.strip().lower()
    if OrganizationMembership.objects.filter(
        organization=organization, user__email=email, is_active=True
    ).exists():
        raise InviteAlreadyMember(email)

    # Revoke any prior open invite
    Invite.objects.filter(
        organization=organization, email=email, accepted_at__isnull=True, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())

    raw = generate_token()
    invite = Invite.objects.create(
        organization=organization,
        email=email,
        role=role,
        token_hash=hash_token(raw),
        invited_by=invited_by,
        expires_at=timezone.now() + timedelta(hours=settings.INVITE_TTL_HOURS),
    )
    # Tests set this attribute on the returned Invite instance to retrieve the
    # raw token. Production callers receive the raw token via email only.
    invite.raw_token_for_test = raw  # type: ignore[attr-defined]

    link = f"{settings.MAGIC_LINK_FRONTEND_URL}/invites/{raw}"
    send_mail(
        subject=f"You're invited to {organization.name} on Eventgate",
        message=(
            f"{invited_by.email if invited_by else 'Someone'} invited you to join "
            f"{organization.name} as {role}.\n\nAccept the invite within "
            f"{settings.INVITE_TTL_HOURS} hours:\n\n{link}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )
    return invite


@transaction.atomic
def accept_invite(*, raw_token: str, user) -> OrganizationMembership:
    token_hash = hash_token(raw_token)
    try:
        invite = Invite.objects.select_for_update().get(token_hash=token_hash)
    except Invite.DoesNotExist as exc:
        raise InviteInvalid("Unknown invite") from exc

    if not tokens_match(raw_token, invite.token_hash):
        raise InviteInvalid("Token mismatch")

    if invite.accepted_at is not None:
        raise InviteInvalid("Invite already accepted")

    if invite.revoked_at is not None:
        raise InviteInvalid("Invite revoked")

    if invite.expires_at <= timezone.now():
        raise InviteExpired("Invite expired")

    if user.email.lower() != invite.email.lower():
        raise InviteEmailMismatch(f"Invite is for {invite.email}, not {user.email}")

    membership, _ = OrganizationMembership.objects.update_or_create(
        organization=invite.organization,
        user=user,
        defaults={"role": invite.role, "is_active": True, "accepted_at": timezone.now()},
    )
    invite.accepted_at = timezone.now()
    invite.save(update_fields=["accepted_at"])
    return membership


def update_membership_role(
    *, membership: OrganizationMembership, new_role: str
) -> OrganizationMembership:
    """Change a member's role. Prevent demoting the sole remaining owner."""
    if membership.role == "owner" and new_role != "owner":
        other_active_owners = (
            OrganizationMembership.objects.filter(
                organization=membership.organization,
                role="owner",
                is_active=True,
            )
            .exclude(pk=membership.pk)
            .exists()
        )
        if not other_active_owners:
            raise ValidationError(
                {
                    "detail": "Cannot demote the sole owner of this organization. "
                    "Promote another member to owner first."
                }
            )
    membership.role = new_role
    membership.save(update_fields=["role", "updated_at"])
    return membership


def remove_membership(*, membership: OrganizationMembership) -> OrganizationMembership:
    """Soft-remove (is_active=False). Prevent removing the sole remaining owner."""
    if membership.role == "owner":
        other_active_owners = (
            OrganizationMembership.objects.filter(
                organization=membership.organization,
                role="owner",
                is_active=True,
            )
            .exclude(pk=membership.pk)
            .exists()
        )
        if not other_active_owners:
            raise ValidationError(
                {
                    "detail": "Cannot remove the sole owner of this organization. "
                    "Promote another member to owner first."
                }
            )
    membership.is_active = False
    membership.save(update_fields=["is_active", "updated_at"])
    return membership


def cancel_invite(*, invite: Invite) -> Invite:
    """Revoke a pending invite. No-op if already revoked. Raises if already accepted."""
    if invite.accepted_at is not None:
        raise ValidationError({"detail": "Cannot cancel an accepted invite."})
    if invite.revoked_at is None:
        invite.revoked_at = timezone.now()
        invite.save(update_fields=["revoked_at"])
    return invite
