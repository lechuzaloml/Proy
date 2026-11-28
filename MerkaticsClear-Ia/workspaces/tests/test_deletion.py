from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from contacts.models import Contacto, Diagnostico, Seguimiento
from funnels.models import Cuestionario, Popup, VersionCuestionario
from subscriptions.models import EventoStripe, PruebaUsada, SuscripcionWorkspace
from users.models import Usuario
from workspaces.models import Membresia, Workspace, WorkspaceEliminacion
from workspaces.services import WorkspaceDeletionError, eliminar_workspace


class WorkspaceDeletionTests(TestCase):
    def setUp(self):
        self.owner = Usuario.objects.create(correo="delete-owner@example.com")
        self.workspace = Workspace.objects.create(
            slug="delete-company",
            nombre="Empresa para eliminar",
        )
        self.membership = Membresia.objects.para(self.workspace).create(
            correo=self.owner.correo,
            usuario=self.owner,
            rol=Membresia.Rol.PROPIETARIO,
        )

    def create_workspace_data(self, with_subscription=True):
        questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Cuestionario",
            configuracion={"preguntas": []},
        )
        version = VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=questionnaire,
            numero=1,
            configuracion={"preguntas": []},
        )
        popup = Popup.objects.para(self.workspace).create(
            titulo="Evento de prueba",
            cuestionario=questionnaire,
        )
        contact = Contacto.objects.para(self.workspace).create(
            nombre="Contacto Prueba",
            correo="contact@example.com",
            telefono="+521234567890",
            consentimiento_version="test",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        Diagnostico.objects.para(self.workspace).create(
            contacto=contact,
            cuestionario=questionnaire,
            version=1,
            respuestas={},
            puntaje_total=0,
            puntaje_maximo=0,
            porcentaje=0,
            resultado={},
        )
        Seguimiento.objects.para(self.workspace).create(
            contacto=contact,
            tipo=Seguimiento.Tipo.NOTA,
            notas="Seguimiento de prueba",
        )
        subscription = None
        if with_subscription:
            subscription = SuscripcionWorkspace.objects.para(self.workspace).create(
                estado=SuscripcionWorkspace.Estado.ACTIVA,
                prueba_hasta=timezone.now() + timedelta(days=7),
                stripe_customer_id="cus_test",
                stripe_subscription_id="sub_test_delete",
                precio=Decimal("1.00"),
            )
        return questionnaire, version, popup, contact, subscription

    def test_protected_workspaces_and_active_owned_workspaces_cannot_be_deleted(self):
        self.workspace.slug = "clearia"
        self.workspace.save(update_fields=["slug"])
        with self.assertRaises(WorkspaceDeletionError):
            eliminar_workspace(self.workspace.uid, "clearia")

        self.workspace.slug = "delete-company"
        self.workspace.save(update_fields=["slug"])
        with self.assertRaises(WorkspaceDeletionError):
            eliminar_workspace(self.workspace.uid, self.workspace.slug)

    @patch("workspaces.services.stripe.Subscription.cancel")
    @patch("workspaces.services.stripe.Subscription.retrieve")
    def test_suspended_workspace_deletes_cascade_and_keeps_user(
        self, retrieve, cancel
    ):
        self.workspace.estado = Workspace.Estado.SUSPENDIDA
        self.workspace.save(update_fields=["estado"])
        self.create_workspace_data()
        PruebaUsada.objects.create(
            correo=self.owner.correo,
            slug=self.workspace.slug,
        )
        retrieve.return_value = Mock(status="canceled")

        summary = eliminar_workspace(self.workspace.uid, self.workspace.slug)

        self.assertEqual(summary["contactos"], 1)
        self.assertEqual(summary["diagnosticos"], 1)
        self.assertEqual(summary["seguimientos"], 1)
        self.assertEqual(summary["cuestionarios"], 1)
        self.assertEqual(summary["versiones"], 1)
        self.assertEqual(summary["miembros"], 1)
        self.assertEqual(summary["popups"], 1)
        self.assertFalse(Workspace.objects.filter(pk=self.workspace.pk).exists())
        self.assertTrue(Usuario.objects.filter(pk=self.owner.pk).exists())
        self.assertFalse(
            Contacto.objects.sin_alcance()
            .filter(workspace_id=self.workspace.pk)
            .exists()
        )
        self.assertFalse(
            Diagnostico.objects.sin_alcance()
            .filter(workspace_id=self.workspace.pk)
            .exists()
        )
        self.assertFalse(
            Seguimiento.objects.sin_alcance()
            .filter(workspace_id=self.workspace.pk)
            .exists()
        )
        self.assertFalse(
            Cuestionario.objects.sin_alcance()
            .filter(workspace_id=self.workspace.pk)
            .exists()
        )
        self.assertFalse(
            VersionCuestionario.objects.sin_alcance()
            .filter(workspace_id=self.workspace.pk)
            .exists()
        )
        self.assertFalse(Popup.objects.sin_alcance().filter(workspace_id=self.workspace.pk).exists())
        self.assertTrue(PruebaUsada.objects.filter(correo=self.owner.correo).exists())
        retrieve.assert_called_once_with("sub_test_delete")
        cancel.assert_not_called()
        self.assertTrue(
            WorkspaceEliminacion.objects.filter(
                stripe_subscription_id="sub_test_delete"
            ).exists()
        )

        self.assertEqual(
            eliminar_workspace(self.workspace.uid, self.workspace.slug),
            {"ya_eliminada": True},
        )

    @patch("workspaces.services.stripe.Subscription.cancel")
    @patch("workspaces.services.stripe.Subscription.retrieve")
    def test_removing_ownerless_workspace_can_release_trial_on_request(
        self, retrieve, cancel
    ):
        self.membership.delete()
        self.create_workspace_data()
        PruebaUsada.objects.create(
            correo=self.owner.correo,
            slug=self.workspace.slug,
        )
        retrieve.return_value = Mock(status="active")

        summary = eliminar_workspace(
            self.workspace.uid,
            self.workspace.slug,
            liberar_prueba=True,
        )

        self.assertEqual(summary["pruebas_liberadas"], 1)
        self.assertFalse(PruebaUsada.objects.filter(correo=self.owner.correo).exists())
        cancel.assert_called_once_with("sub_test_delete")

    def test_ownerless_workspace_keeps_trial_record_when_release_is_not_requested(self):
        self.membership.delete()
        self.create_workspace_data(with_subscription=False)
        PruebaUsada.objects.create(
            correo=self.owner.correo,
            slug=self.workspace.slug,
        )

        summary = eliminar_workspace(self.workspace.uid, self.workspace.slug)

        self.assertEqual(summary["pruebas_liberadas"], 0)
        self.assertTrue(PruebaUsada.objects.filter(correo=self.owner.correo).exists())

    @patch("subscriptions.views._stripe_client")
    @patch("workspaces.services.stripe.Subscription.retrieve")
    def test_webhook_acknowledges_deleted_workspace_checkout_without_recreating_it(
        self, retrieve_before_delete, stripe_client
    ):
        self.workspace.estado = Workspace.Estado.SUSPENDIDA
        self.workspace.save(update_fields=["estado"])
        SuscripcionWorkspace.objects.para(self.workspace).create(
            estado=SuscripcionWorkspace.Estado.CANCELADA,
            prueba_hasta=timezone.now(),
            stripe_subscription_id="sub_deleted",
        )
        retrieve_before_delete.return_value = Mock(status="canceled")
        eliminar_workspace(self.workspace.uid, self.workspace.slug)

        event = {
            "id": "evt_deleted_checkout",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "mode": "subscription",
                    "metadata": {
                        "slug": self.workspace.slug,
                        "nombre": "Empresa recreada",
                        "plan": "inicial",
                        "correo": self.owner.correo,
                    },
                    "subscription": "sub_deleted",
                    "customer": "cus_test",
                }
            },
        }
        stripe_client.return_value.Webhook.construct_event.return_value = event
        stripe_client.return_value.Subscription.retrieve.return_value = Mock(
            status="canceled"
        )

        response = self.client.post(
            reverse("webhook_stripe"),
            data=b"{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="valid-signature",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Workspace.objects.filter(slug=self.workspace.slug).exists())
        self.assertTrue(
            WorkspaceEliminacion.objects.filter(
                stripe_subscription_id="sub_deleted"
            ).exists()
        )
        self.assertTrue(
            EventoStripe.objects.filter(
                stripe_event_id="evt_deleted_checkout",
                procesado=True,
            ).exists()
        )
