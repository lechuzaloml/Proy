from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from contacts.models import Contacto, Diagnostico
from funnels.models import Cuestionario, Plantilla, VersionCuestionario
from funnels.tests.support import questionnaire_config
from users.models import AdminPlataforma, Usuario
from workspaces.models import Membresia, Workspace


class LoadTemplatesCommandTests(TestCase):
    def test_authenticated_public_header_includes_logout_action(self):
        user = Usuario.objects.create(correo="public-header@example.com")
        session = self.client.session
        session["usuario_uid"] = str(user.uid)
        session.save()

        response = self.client.get(reverse("inicio"))

        self.assertContains(response, "Cerrar sesión")
        self.assertContains(response, 'action="/salir/"')

    def test_command_is_idempotent_and_publishes_internal_diagnostic(self):
        platform_user = Usuario.objects.create(correo="seed-admin@example.com")
        AdminPlataforma.objects.create(usuario=platform_user)
        call_command("cargar_plantillas")
        workspace = Workspace.objects.get(slug="clearia")
        workspace.estado = Workspace.Estado.SUSPENDIDA
        workspace.save(update_fields=["estado"])
        call_command("cargar_plantillas")

        self.assertEqual(
            Plantilla.objects.filter(tipo=Plantilla.Tipo.BIBLIOTECA).count(),
            8,
        )
        self.assertEqual(
            Plantilla.objects.filter(tipo=Plantilla.Tipo.REFERENCIA).count(),
            3,
        )
        workspace.refresh_from_db()
        self.assertEqual(workspace.plan, Workspace.Plan.INTERNO)
        self.assertEqual(workspace.estado, Workspace.Estado.ACTIVA)
        admin_membership = Membresia.objects.para(workspace).get(
            usuario=platform_user
        )
        self.assertEqual(admin_membership.rol, Membresia.Rol.PROPIETARIO)
        self.assertTrue(admin_membership.ver_leads)
        self.assertTrue(admin_membership.gestionar_leads)
        self.assertTrue(admin_membership.editar_cuestionarios)
        self.assertTrue(admin_membership.publicar_cuestionarios)
        questionnaire = Cuestionario.objects.para(workspace).get(
            estado=Cuestionario.Estado.PUBLICADO
        )
        self.assertEqual(questionnaire.version_actual, 1)
        version = VersionCuestionario.objects.para(workspace).get(
            cuestionario=questionnaire,
            numero=questionnaire.version_actual,
        )
        self.assertTrue(version.publicada)
        self.assertEqual(
            VersionCuestionario.objects.para(workspace)
            .filter(cuestionario=questionnaire)
            .count(),
            1,
        )

    def test_seeded_public_pages_and_all_template_demos_render(self):
        call_command("cargar_plantillas")

        landing = self.client.get(reverse("inicio"))
        self.assertEqual(landing.status_code, 200)
        self.assertContains(
            landing,
            "Diagnósticos y recursos para impulsar el crecimiento de tu negocio.",
        )
        self.assertContains(landing, "Entorno de demostración: los pagos son de prueba")
        self.assertContains(landing, "Volver arriba")
        library = self.client.get(reverse("biblioteca"))
        self.assertEqual(library.status_code, 200)
        self.assertContains(library, "Biblioteca de templates")
        for template in Plantilla.objects.filter(tipo=Plantilla.Tipo.BIBLIOTECA):
            with self.subTest(template=template.slug):
                detail = self.client.get(
                    reverse("biblioteca_detalle", args=[template.slug])
                )
                demo = self.client.get(
                    reverse("demostrar_plantilla", args=[template.slug])
                )
                self.assertEqual(detail.status_code, 200)
                self.assertNotContains(detail, "Volver a la biblioteca")
                self.assertContains(detail, "Demostración: no se guardan datos.")
                self.assertEqual(demo.status_code, 200)
                self.assertContains(demo, "questionnaire-demo")
                self.assertContains(demo, "Demostración: no se guardan datos.")
                self.assertContains(demo, "Aviso de privacidad")
                self.assertContains(demo, "Términos de uso")
                self.assertContains(demo, "Volver arriba")
        for case in Plantilla.objects.filter(tipo=Plantilla.Tipo.REFERENCIA):
            with self.subTest(case=case.slug):
                detail = self.client.get(
                    reverse("biblioteca_detalle", args=[case.slug])
                )
                opened_case = self.client.get(
                    reverse("demostrar_plantilla", args=[case.slug])
                )
                self.assertEqual(detail.status_code, 200)
                self.assertEqual(opened_case.status_code, 200)
        initial = self.client.get(reverse("diagnostico_inicial"))
        self.assertEqual(initial.status_code, 200)
        self.assertNotContains(initial, "Volver a la biblioteca")
        self.assertContains(initial, "Cuestionario")
        self.assertContains(
            initial,
            "Te haremos unas preguntas para entender mejor tu situación actual.",
        )
        self.assertContains(initial, "Iniciar diagnóstico")
        self.assertNotContains(initial, "Qué vas a hacer")
        self.assertNotContains(initial, "7 preguntas")
        self.assertContains(initial, "Datos de contacto")
        self.assertLess(
            initial.content.find(b"Datos de contacto"),
            initial.content.find("¿Qué tipo de negocio".encode("utf-8")),
        )
        self.assertEqual(Contacto.objects.sin_alcance().count(), 0)


class CopyTemplateTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create(correo="copy@example.com")
        self.workspace = Workspace.objects.create(
            slug="copy-company",
            nombre="Empresa de copia",
        )
        self.membership = Membresia.objects.para(self.workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.USUARIO,
            editar_cuestionarios=True,
        )
        self.configuration = questionnaire_config()
        self.template = Plantilla.objects.create(
            slug="copy-source",
            nombre="Plantilla fuente",
            formato="Cuestionario",
            caso_uso="Prueba",
            nicho="General",
            descripcion="Plantilla para copiar.",
            configuracion=self.configuration,
        )
        session = self.client.session
        session["usuario_uid"] = str(self.user.uid)
        session.save()

    def test_member_with_edit_permission_copies_configuration_as_draft(self):
        library = self.client.get(reverse("biblioteca"))
        self.assertContains(library, "Copiar a mi empresa")
        self.assertContains(library, "Ver mis cuestionarios")
        self.assertContains(
            library,
            reverse("mis_cuestionarios", args=[self.workspace.uid]),
        )
        response = self.client.post(
            reverse("copiar_plantilla", args=[self.template.slug]),
            {"workspace_uid": str(self.workspace.uid)},
        )

        self.assertRedirects(
            response,
            reverse("mis_cuestionarios", args=[self.workspace.uid]),
        )
        copy_questionnaire = Cuestionario.objects.para(self.workspace).get()
        self.assertEqual(copy_questionnaire.estado, Cuestionario.Estado.BORRADOR)
        self.assertEqual(copy_questionnaire.creado_por, self.user)
        self.assertEqual(copy_questionnaire.configuracion["cliente"], self.workspace.nombre)
        self.assertNotEqual(
            copy_questionnaire.configuracion["id"],
            self.configuration["id"],
        )
        version = VersionCuestionario.objects.para(self.workspace).get(
            cuestionario=copy_questionnaire
        )
        self.assertFalse(version.publicada)
        self.assertEqual(self.template.configuracion, self.configuration)

    def test_membership_without_edit_permission_cannot_copy(self):
        self.membership.editar_cuestionarios = False
        self.membership.save(update_fields=["editar_cuestionarios"])

        response = self.client.post(
            reverse("copiar_plantilla", args=[self.template.slug]),
            {"workspace_uid": str(self.workspace.uid)},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(Cuestionario.objects.para(self.workspace).count(), 0)


class QuestionnaireDeletionTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create(correo="delete@example.com")
        self.workspace = Workspace.objects.create(
            slug="delete-company",
            nombre="Empresa para eliminar",
        )
        self.membership = Membresia.objects.para(self.workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.USUARIO,
            editar_cuestionarios=True,
        )
        self.questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Cuestionario de prueba",
            configuracion=questionnaire_config(),
        )
        self.version = VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=self.questionnaire,
            numero=1,
            configuracion=questionnaire_config(),
            publicada=False,
        )
        session = self.client.session
        session["usuario_uid"] = str(self.user.uid)
        session.save()

    def _delete(self):
        return self.client.post(
            reverse(
                "eliminar_cuestionario",
                args=[self.workspace.uid, self.questionnaire.uid],
            )
        )

    def test_deleting_draft_removes_its_versions(self):
        response = self._delete()

        self.assertRedirects(
            response,
            reverse("mis_cuestionarios", args=[self.workspace.uid]),
        )
        self.assertFalse(
            Cuestionario.objects.para(self.workspace).filter(
                pk=self.questionnaire.pk
            ).exists()
        )
        self.assertFalse(
            VersionCuestionario.objects.para(self.workspace).filter(
                pk=self.version.pk
            ).exists()
        )

    def test_published_questionnaire_must_be_unpublished_first(self):
        self.questionnaire.estado = Cuestionario.Estado.PUBLICADO
        self.questionnaire.save(update_fields=["estado"])

        response = self._delete()

        self.assertEqual(response.status_code, 404)
        self.assertTrue(
            Cuestionario.objects.para(self.workspace).filter(
                pk=self.questionnaire.pk
            ).exists()
        )
        self.assertTrue(
            VersionCuestionario.objects.para(self.workspace).filter(
                pk=self.version.pk
            ).exists()
        )

    def test_questionnaire_with_diagnosis_is_preserved(self):
        contact = Contacto.objects.para(self.workspace).create(
            nombre="Prospecto",
            correo="prospecto@example.com",
            telefono="5551234567",
            consentimiento_version="test-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        Diagnostico.objects.para(self.workspace).create(
            contacto=contact,
            cuestionario=self.questionnaire,
            version=1,
            respuestas={},
            puntaje_total=0,
            puntaje_maximo=0,
            porcentaje=0,
            resultado={},
        )

        response = self._delete()

        self.assertEqual(response.status_code, 400)
        self.assertContains(
            response,
            "Se conserva para mantener el historial de contactos.",
            status_code=400,
        )
        self.assertTrue(
            Cuestionario.objects.para(self.workspace).filter(
                pk=self.questionnaire.pk
            ).exists()
        )
        listing = self.client.get(
            reverse("mis_cuestionarios", args=[self.workspace.uid])
        )
        self.assertContains(
            listing,
            "No se puede eliminar: conserva diagnósticos asociados.",
        )
        self.assertNotContains(listing, "Confirmar eliminación")

    def test_member_without_edit_permission_cannot_delete(self):
        self.membership.editar_cuestionarios = False
        self.membership.save(update_fields=["editar_cuestionarios"])

        response = self._delete()

        self.assertEqual(response.status_code, 404)
        self.assertTrue(
            Cuestionario.objects.para(self.workspace).filter(
                pk=self.questionnaire.pk
            ).exists()
        )

    def test_cannot_delete_questionnaire_from_another_workspace(self):
        other_workspace = Workspace.objects.create(
            slug="other-delete-company",
            nombre="Otra empresa",
        )
        other_questionnaire = Cuestionario.objects.para(
            other_workspace
        ).create(
            nombre="Cuestionario ajeno",
            configuracion=questionnaire_config(),
        )

        response = self.client.post(
            reverse(
                "eliminar_cuestionario",
                args=[self.workspace.uid, other_questionnaire.uid],
            )
        )

        self.assertEqual(response.status_code, 404)
        self.assertTrue(
            Cuestionario.objects.para(other_workspace)
            .filter(pk=other_questionnaire.pk)
            .exists()
        )

    def test_delete_requires_post(self):
        response = self.client.get(
            reverse(
                "eliminar_cuestionario",
                args=[self.workspace.uid, self.questionnaire.uid],
            )
        )

        self.assertEqual(response.status_code, 405)

    def test_questionnaire_list_offers_delete_for_an_eligible_draft(self):
        response = self.client.get(
            reverse("mis_cuestionarios", args=[self.workspace.uid])
        )

        self.assertContains(response, "Eliminar")
        self.assertContains(response, "Confirmar eliminación")
