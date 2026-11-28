import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from funnels.models import Plantilla
from subscriptions.configuracion import validar_clave_sandbox
from subscriptions.models import EventoStripe, PruebaUsada, SuscripcionWorkspace
from subscriptions.recomendaciones import RECOMENDACIONES
from users.models import Usuario
from workspaces.models import Membresia, Workspace


class StripeSandboxConfigurationTests(SimpleTestCase):
    def test_only_test_secret_keys_are_accepted(self):
        self.assertEqual(validar_clave_sandbox("sk_test_example"), "sk_test_example")
        for key in ("", "sk_live_example", None):
            with self.subTest(key=key):
                with self.assertRaises(ImproperlyConfigured):
                    validar_clave_sandbox(key)


class RecommendationTemplateMappingTests(TestCase):
    def test_all_recommended_templates_exist_in_the_seeded_django_catalog(self):
        call_command("cargar_plantillas", verbosity=0)
        for recommendation in RECOMENDACIONES.values():
            with self.subTest(template=recommendation["template_slug"]):
                self.assertTrue(
                    Plantilla.objects.filter(
                        slug=recommendation["template_slug"],
                        tipo=Plantilla.Tipo.BIBLIOTECA,
                    ).exists()
                )


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_signed-test-secret")
class SubscriptionFlowTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create(correo="owner@example.com")
        self._use_user(self.user)

    def _use_user(self, user):
        session = self.client.session
        session["usuario_uid"] = str(user.uid)
        session.save()

    @staticmethod
    def checkout_event(
        event_id="evt_checkout_1",
        slug="company-one",
        email="owner@example.com",
        subscription_id="sub_test_1",
        plan="pro",
    ):
        return {
            "id": event_id,
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "mode": "subscription",
                    "subscription": subscription_id,
                    "customer": "cus_test_1",
                    "metadata": {
                        "slug": slug,
                        "nombre": "Empresa de prueba",
                        "plan": plan,
                        "correo": email,
                    },
                }
            },
        }

    def send_event(self, event):
        payload = json.dumps(event, separators=(",", ":")).encode("utf-8")
        timestamp = int(timezone.now().timestamp())
        signed_payload = str(timestamp).encode() + b"." + payload
        signature = hmac.new(
            b"whsec_signed-test-secret", signed_payload, hashlib.sha256
        ).hexdigest()
        with patch(
            "subscriptions.views.stripe.Subscription.retrieve",
            return_value=SimpleNamespace(
                trial_end=int(
                    (timezone.now() + timedelta(days=7)).timestamp()
                )
            ),
        ):
            return self.client.post(
                reverse("webhook_stripe"),
                data=payload,
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE=f"t={timestamp},v1={signature}",
            )

    def test_checkout_form_preselects_the_plan_without_reasking(self):
        response = self.client.get(reverse("suscripcion") + "?plan=pro")
        self.assertContains(response, "Plan elegido:")
        self.assertContains(response, "Pro")
        self.assertContains(response, "Cambiar plan")
        self.assertNotContains(response, "<legend>Elige tu plan</legend>")
        self.assertContains(response, "7 días gratis; después 1 USD/mes")
        self.assertContains(response, "Modo de prueba: no se cobra dinero real")

    def test_plans_page_shows_recommendation_limits_and_sandbox_price(self):
        response = self.client.get(reverse("planes") + "?plan=pro")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Recomendado para ti")
        self.assertContains(response, "Plan Pro")
        self.assertContains(response, "Cuestionarios publicados: hasta 3 por empresa")
        self.assertContains(response, "Cuestionarios publicados: hasta 10 por empresa")
        self.assertContains(response, "Cuestionarios publicados: hasta 25 por empresa")
        self.assertContains(response, "Modo de prueba: 1 USD")
        self.assertContains(response, "Precio de prueba: 1 USD. Los valores son provisionales.")

    def test_subscription_requires_a_session_and_uses_an_internal_next(self):
        self.client.session.flush()
        response = self.client.get(reverse("suscripcion") + "?plan=pro")
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("/acceso/?next="))
        self.assertIn("suscripcion", response["Location"])

    @patch(
        "subscriptions.views.stripe.checkout.Session.create",
        return_value=SimpleNamespace(url="https://checkout.stripe.test/session"),
    )
    def test_checkout_uses_server_metadata_and_seven_day_sandbox_trial(self, create):
        response = self.client.post(
            reverse("suscripcion") + "?plan=pro",
            {"plan_id": "pro", "nombre": "Mi empresa", "slug": "mi-empresa"},
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"], "https://checkout.stripe.test/session"
        )
        params = create.call_args.kwargs
        self.assertEqual(params["mode"], "subscription")
        self.assertEqual(params["line_items"][0]["quantity"], 1)
        self.assertEqual(params["client_reference_id"], "mi-empresa")
        self.assertEqual(
            params["metadata"],
            {
                "slug": "mi-empresa",
                "nombre": "Mi empresa",
                "plan": "pro",
                "correo": "owner@example.com",
            },
        )
        self.assertEqual(params["subscription_data"]["trial_period_days"], 7)
        self.assertEqual(
            params["subscription_data"]["metadata"], params["metadata"]
        )
        self.assertNotIn("card", params)
        self.assertNotIn("payment_method", params)
        self.assertIn("checkout=success&slug=mi-empresa", params["success_url"])
        self.assertIn("session_id={CHECKOUT_SESSION_ID}", params["success_url"])
        self.assertIn("checkout=cancelled", params["cancel_url"])

    @patch("subscriptions.views.stripe.checkout.Session.create")
    def test_used_trial_email_is_rejected(self, create):
        PruebaUsada.objects.create(correo=self.user.correo, slug="old-company")
        response = self.client.post(
            reverse("suscripcion"),
            {"plan_id": "inicial", "nombre": "Empresa", "slug": "new-company"},
        )
        self.assertContains(
            response,
            "Este correo ya tiene una empresa registrada",
        )
        create.assert_not_called()

    @patch("subscriptions.views.stripe.checkout.Session.create")
    def test_duplicate_slug_is_rejected_before_checkout(self, create):
        Workspace.objects.create(slug="already-used", nombre="Existente")
        response = self.client.post(
            reverse("suscripcion"),
            {"plan_id": "inicial", "nombre": "Empresa", "slug": "already-used"},
        )
        self.assertContains(response, "ya está en uso")
        create.assert_not_called()

    @patch("subscriptions.views.stripe.checkout.Session.create")
    def test_reserved_slug_is_rejected_before_checkout(self, create):
        response = self.client.post(
            reverse("suscripcion"),
            {"plan_id": "inicial", "nombre": "Empresa", "slug": "clearia"},
        )
        self.assertContains(response, "Este slug está reservado.")
        create.assert_not_called()

    def test_signed_checkout_creates_workspace_membership_and_subscription_once(self):
        event = self.checkout_event()
        first = self.send_event(event)
        second = self.send_event(event)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        workspace = Workspace.objects.get(slug="company-one")
        self.assertEqual(workspace.plan, Workspace.Plan.PRO)
        membership = Membresia.objects.para(workspace).get(
            correo=self.user.correo
        )
        self.assertEqual(membership.usuario, self.user)
        self.assertEqual(membership.rol, Membresia.Rol.PROPIETARIO)
        self.assertTrue(membership.ver_leads)
        self.assertTrue(membership.gestionar_leads)
        self.assertTrue(membership.editar_cuestionarios)
        self.assertTrue(membership.publicar_cuestionarios)
        subscription = SuscripcionWorkspace.objects.para(workspace).get()
        self.assertEqual(subscription.estado, SuscripcionWorkspace.Estado.PRUEBA)
        self.assertEqual(subscription.stripe_customer_id, "cus_test_1")
        self.assertEqual(subscription.stripe_subscription_id, "sub_test_1")
        self.assertEqual(subscription.precio, Decimal("1.00"))
        self.assertGreater(
            subscription.prueba_hasta,
            timezone.now() + timedelta(days=6, hours=23),
        )
        self.assertTrue(PruebaUsada.objects.filter(correo=self.user.correo).exists())
        self.assertEqual(EventoStripe.objects.filter(stripe_event_id="evt_checkout_1").count(), 1)

    @patch("subscriptions.views.stripe.Subscription.cancel")
    def test_second_checkout_for_used_email_is_cancelled(self, cancel):
        self.send_event(self.checkout_event())
        duplicate = self.checkout_event(
            event_id="evt_checkout_2",
            slug="company-two",
            subscription_id="sub_test_2",
        )
        response = self.send_event(duplicate)
        self.assertEqual(response.status_code, 200)
        cancel.assert_called_once_with("sub_test_2")
        self.assertFalse(Workspace.objects.filter(slug="company-two").exists())
        self.assertTrue(
            EventoStripe.objects.filter(
                stripe_event_id="evt_checkout_2", procesado=True
            ).exists()
        )

    @patch("subscriptions.views.stripe.Subscription.cancel")
    def test_checkout_slug_collision_cancels_the_new_stripe_subscription(self, cancel):
        Workspace.objects.create(slug="occupied", nombre="Otra empresa")
        response = self.send_event(
            self.checkout_event(slug="occupied", email="new@example.com")
        )
        self.assertEqual(response.status_code, 200)
        cancel.assert_called_once_with("sub_test_1")
        self.assertFalse(PruebaUsada.objects.filter(correo="new@example.com").exists())
        self.assertTrue(
            EventoStripe.objects.filter(
                stripe_event_id="evt_checkout_1", procesado=True
            ).exists()
        )

    def _create_subscription(self):
        workspace = Workspace.objects.create(
            slug="billing-company", nombre="Billing company", plan=Workspace.Plan.PRO
        )
        SuscripcionWorkspace.objects.para(workspace).create(
            estado=SuscripcionWorkspace.Estado.PRUEBA,
            prueba_hasta=timezone.now() + timedelta(days=7),
            stripe_customer_id="cus_billing",
            stripe_subscription_id="sub_billing",
        )
        return workspace

    def test_payment_failure_and_subscription_cancellation_update_status(self):
        workspace = self._create_subscription()
        failed = {
            "id": "evt_failed",
            "type": "invoice.payment_failed",
            "data": {"object": {"subscription": "sub_billing"}},
        }
        self.assertEqual(self.send_event(failed).status_code, 200)
        subscription = SuscripcionWorkspace.objects.para(workspace).get()
        self.assertEqual(
            subscription.estado, SuscripcionWorkspace.Estado.PAGO_PENDIENTE
        )
        self.assertEqual(workspace.estado, Workspace.Estado.ACTIVA)

        paid = {
            "id": "evt_paid",
            "type": "invoice.paid",
            "data": {"object": {"subscription": "sub_billing"}},
        }
        self.assertEqual(self.send_event(paid).status_code, 200)
        subscription.refresh_from_db()
        self.assertEqual(subscription.estado, SuscripcionWorkspace.Estado.ACTIVA)

        canceled = {
            "id": "evt_cancelled",
            "type": "customer.subscription.updated",
            "data": {"object": {"id": "sub_billing", "status": "canceled"}},
        }
        self.assertEqual(self.send_event(canceled).status_code, 200)
        subscription.refresh_from_db()
        workspace.refresh_from_db()
        self.assertEqual(
            subscription.estado, SuscripcionWorkspace.Estado.CANCELADA
        )
        self.assertEqual(workspace.estado, Workspace.Estado.SUSPENDIDA)

    def test_subscription_deleted_event_cancels_and_suspends_workspace(self):
        workspace = self._create_subscription()
        response = self.send_event(
            {
                "id": "evt_deleted",
                "type": "customer.subscription.deleted",
                "data": {"object": {"id": "sub_billing", "status": "canceled"}},
            }
        )
        self.assertEqual(response.status_code, 200)
        subscription = SuscripcionWorkspace.objects.para(workspace).get()
        workspace.refresh_from_db()
        self.assertEqual(
            subscription.estado, SuscripcionWorkspace.Estado.CANCELADA
        )
        self.assertEqual(workspace.estado, Workspace.Estado.SUSPENDIDA)

    def test_events_for_unknown_company_are_ignored(self):
        response = self.send_event(
            {
                "id": "evt_unknown",
                "type": "invoice.paid",
                "data": {"object": {"subscription": "sub_missing"}},
            }
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            EventoStripe.objects.filter(
                stripe_event_id="evt_unknown", procesado=True
            ).exists()
        )

    def test_invalid_signature_is_rejected(self):
        response = self.client.post(
            reverse("webhook_stripe"),
            data=b'{"signed":"payload"}',
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=invalid",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(EventoStripe.objects.count(), 0)

    @patch(
        "subscriptions.views.stripe.billing_portal.Session.create",
        return_value=SimpleNamespace(url="https://billing.stripe.test/session"),
    )
    def test_only_workspace_owner_can_open_the_portal(self, create):
        workspace_a = self._create_subscription()
        workspace_b = Workspace.objects.create(
            slug="other-billing", nombre="Other billing"
        )
        Membresia.objects.para(workspace_a).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.PROPIETARIO,
        )
        foreign = self.client.post(
            reverse("portal_suscripcion", args=[workspace_b.uid])
        )
        self.assertEqual(foreign.status_code, 404)

        regular_user = Usuario.objects.create(correo="regular@example.com")
        Membresia.objects.para(workspace_a).create(
            correo=regular_user.correo,
            usuario=regular_user,
            rol=Membresia.Rol.USUARIO,
        )
        self._use_user(regular_user)
        forbidden = self.client.post(
            reverse("portal_suscripcion", args=[workspace_a.uid])
        )
        self.assertEqual(forbidden.status_code, 404)

        self._use_user(self.user)
        allowed = self.client.post(
            reverse("portal_suscripcion", args=[workspace_a.uid])
        )
        self.assertEqual(allowed.status_code, 302)
        self.assertEqual(
            allowed["Location"], "https://billing.stripe.test/session"
        )

        admin_user = Usuario.objects.create(correo="admin@example.com")
        Membresia.objects.para(workspace_a).create(
            correo=admin_user.correo,
            usuario=admin_user,
            rol=Membresia.Rol.ADMIN,
        )
        self._use_user(admin_user)
        admin_allowed = self.client.post(
            reverse("portal_suscripcion", args=[workspace_a.uid])
        )
        self.assertEqual(admin_allowed.status_code, 404)
        self.assertEqual(create.call_count, 1)

    @patch("subscriptions.views.stripe.billing_portal.Session.create")
    def test_internal_workspace_does_not_use_billing_portal(self, create):
        workspace = Workspace.objects.create(
            slug="internal-workspace",
            nombre="Internal",
            plan=Workspace.Plan.INTERNO,
        )
        Membresia.objects.para(workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.PROPIETARIO,
        )
        response = self.client.post(
            reverse("portal_suscripcion", args=[workspace.uid])
        )
        self.assertEqual(response.status_code, 404)
        create.assert_not_called()

    def test_preparation_endpoint_exposes_only_the_current_users_membership(self):
        workspace = Workspace.objects.create(
            slug="prepared-company", nombre="Prepared company"
        )
        response = self.client.get(
            reverse("estado_preparacion_suscripcion"),
            {"slug": workspace.slug},
        )
        self.assertEqual(response.json(), {"ready": False})
        Membresia.objects.para(workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.PROPIETARIO,
        )
        ready = self.client.get(
            reverse("estado_preparacion_suscripcion"),
            {"slug": workspace.slug},
        )
        self.assertTrue(ready.json()["ready"])
        self.assertEqual(
            ready.json()["url"],
            reverse("resumen_workspace", args=[workspace.uid]),
        )

    @patch("subscriptions.views.stripe.Subscription.retrieve")
    @patch("subscriptions.views.stripe.checkout.Session.retrieve")
    def test_preparation_endpoint_reconciles_completed_checkout(
        self,
        retrieve_session,
        retrieve_subscription,
    ):
        retrieve_session.return_value = SimpleNamespace(
            status="complete",
            mode="subscription",
            subscription="sub_recovered",
            customer="cus_recovered",
            metadata={
                "slug": "recovered-company",
                "nombre": "Empresa recuperada",
                "plan": "pro",
                "correo": self.user.correo,
            },
        )
        retrieve_subscription.return_value = SimpleNamespace(
            trial_end=int((timezone.now() + timedelta(days=7)).timestamp()),
        )

        response = self.client.get(
            reverse("estado_preparacion_suscripcion"),
            {
                "slug": "recovered-company",
                "session_id": "cs_recovered",
            },
        )

        self.assertTrue(response.json()["ready"])
        workspace = Workspace.objects.get(slug="recovered-company")
        membership = Membresia.objects.para(workspace).get()
        subscription = SuscripcionWorkspace.objects.para(workspace).get()
        self.assertEqual(membership.usuario, self.user)
        self.assertEqual(membership.rol, Membresia.Rol.PROPIETARIO)
        self.assertEqual(subscription.stripe_subscription_id, "sub_recovered")

    def test_subscription_status_is_visible_to_admin_but_portal_button_is_owner_only(
        self,
    ):
        workspace = self._create_subscription()
        Membresia.objects.para(workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.PROPIETARIO,
        )
        owner_response = self.client.get(
            reverse("resumen_workspace", args=[workspace.uid])
        )
        self.assertContains(owner_response, "Estado de la suscripción: Prueba")
        self.assertContains(owner_response, "Plan: Pro")
        self.assertContains(owner_response, "Administrar suscripción")

        admin_user = Usuario.objects.create(correo="admin@example.com")
        Membresia.objects.para(workspace).create(
            correo=admin_user.correo,
            usuario=admin_user,
            rol=Membresia.Rol.ADMIN,
        )
        self._use_user(admin_user)
        admin_response = self.client.get(
            reverse("resumen_workspace", args=[workspace.uid])
        )
        self.assertContains(admin_response, "Estado de la suscripción: Prueba")
        self.assertContains(admin_response, "Plan: Pro")
        self.assertNotContains(admin_response, "Administrar suscripción")

        regular_user = Usuario.objects.create(correo="viewer@example.com")
        Membresia.objects.para(workspace).create(
            correo=regular_user.correo,
            usuario=regular_user,
            rol=Membresia.Rol.USUARIO,
        )
        self._use_user(regular_user)
        member_response = self.client.get(
            reverse("resumen_workspace", args=[workspace.uid])
        )
        self.assertNotContains(member_response, "Estado de la suscripción")
        self.assertNotContains(member_response, "Plan: Pro")
        self.assertNotContains(member_response, "Administrar suscripción")
