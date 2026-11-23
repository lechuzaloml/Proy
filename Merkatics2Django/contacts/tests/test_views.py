from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from contacts.models import Contacto, Diagnostico, Seguimiento
from funnels.models import Cuestionario, VersionCuestionario
from funnels.tests.support import questionnaire_config
from users.models import AdminPlataforma, Usuario
from workspaces.models import Membresia, Workspace


class ContactWorkspaceAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = Usuario.objects.create(correo="member@example.com")
        cls.workspace_a = Workspace.objects.create(slug="company-a", nombre="Empresa A")
        cls.workspace_b = Workspace.objects.create(slug="company-b", nombre="Empresa B")
        cls.membership = Membresia.objects.para(cls.workspace_a).create(
            correo=cls.user.correo,
            usuario=cls.user,
            rol=Membresia.Rol.USUARIO,
        )
        cls.contact_b = Contacto.objects.para(cls.workspace_b).create(
            nombre="Contacto de B",
            correo="contact-b@example.com",
            telefono="5551234567",
            consentimiento_version="provisional-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )

    def setUp(self):
        session = self.client.session
        session["usuario_uid"] = str(self.user.uid)
        session.save()

    def test_workspace_a_user_cannot_open_contacts_for_workspace_b(self):
        self.membership.ver_leads = True
        self.membership.save(update_fields=["ver_leads"])

        response = self.client.get(
            reverse("contactos", args=[self.workspace_b.uid])
        )

        self.assertEqual(response.status_code, 404)

    def test_platform_admin_without_membership_cannot_bypass_workspace_scope(self):
        AdminPlataforma.objects.create(usuario=self.user)

        response = self.client.get(
            reverse("contactos", args=[self.workspace_b.uid])
        )

        self.assertEqual(response.status_code, 404)


class ContactPermissionTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create(correo="lead-user@example.com")
        self.assignee = Usuario.objects.create(correo="assignee@example.com")
        self.workspace = Workspace.objects.create(
            slug="lead-company",
            nombre="Empresa de leads",
        )
        self.membership = Membresia.objects.para(self.workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.USUARIO,
            ver_leads=True,
        )
        self.assignee_membership = Membresia.objects.para(self.workspace).create(
            correo=self.assignee.correo,
            usuario=self.assignee,
            rol=Membresia.Rol.USUARIO,
        )
        configuration = questionnaire_config()
        self.questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Cuestionario de prueba",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion=configuration,
            version_actual=1,
        )
        VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=self.questionnaire,
            numero=1,
            configuracion=configuration,
            publicada=True,
        )
        self.contact = Contacto.objects.para(self.workspace).create(
            nombre="Prospecto",
            correo="prospecto@example.com",
            telefono="5551234567",
            consentimiento_version="provisional-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        self.diagnosis = Diagnostico.objects.para(self.workspace).create(
            contacto=self.contact,
            cuestionario=self.questionnaire,
            version=1,
            respuestas={
                "0": {
                    "pregunta": "¿Cómo captas prospectos?",
                    "tipo": "opcion_multiple",
                    "seccion": "Captación",
                    "valor": 1,
                    "valor_legible": "Tenemos un proceso",
                }
            },
            puntaje_total=2,
            puntaje_maximo=4,
            porcentaje=50,
            segmento="segmento-privado",
            puntaje_por_dimension={"Captación": 100},
            resultado={"contenido": "Resultado privado"},
        )
        session = self.client.session
        session["usuario_uid"] = str(self.user.uid)
        session.save()
        self.detail_url = reverse(
            "contacto_detalle",
            args=[self.workspace.uid, self.contact.uid],
        )

    def test_view_permission_allows_read_but_not_management(self):
        response = self.client.get(self.detail_url)
        denied_update = self.client.post(
            self.detail_url,
            {"accion": "estado", "estado": Contacto.Estado.CONTACTADO},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Tenemos un proceso")
        self.assertEqual(denied_update.status_code, 404)
        self.contact.refresh_from_db()
        self.assertEqual(self.contact.estado, Contacto.Estado.NUEVO)

    def test_contact_list_search_filters_and_maturity_order(self):
        second_contact = Contacto.objects.para(self.workspace).create(
            nombre="Otro prospecto",
            correo="otro@example.com",
            telefono="5557654321",
            consentimiento_version="provisional-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
            estado=Contacto.Estado.INTERESADO,
        )
        Diagnostico.objects.para(self.workspace).create(
            contacto=second_contact,
            cuestionario=self.questionnaire,
            version=1,
            respuestas={},
            puntaje_total=3,
            puntaje_maximo=4,
            porcentaje=75,
            segmento="otro-segmento",
            puntaje_por_dimension={},
            resultado={"contenido": "Otro resultado"},
        )
        url = reverse("contactos", args=[self.workspace.uid])

        by_name = self.client.get(url, {"q": "Otro prospecto"})
        by_email = self.client.get(url, {"q": "prospecto@example.com"})
        by_segment = self.client.get(url, {"segmento": "segmento-privado"})
        by_state = self.client.get(url, {"estado": Contacto.Estado.INTERESADO})
        ordered = self.client.get(url, {"orden": "porcentaje"})

        self.assertContains(by_name, "Otro prospecto")
        self.assertNotContains(by_name, "Resultado privado")
        self.assertContains(by_email, "prospecto@example.com")
        self.assertContains(by_segment, "segmento-privado")
        self.assertNotContains(by_segment, "otro-segmento")
        self.assertContains(by_state, "Otro prospecto")
        self.assertNotContains(by_state, "segmento-privado")
        self.assertLess(
            ordered.content.find(b"Otro prospecto"),
            ordered.content.find(b"Prospecto"),
        )

    def test_origin_tabs_filter_clearia_and_public_questionnaire_contacts(self):
        clearia_contact = Contacto.objects.para(self.workspace).create(
            nombre="Contacto Clear-IA",
            correo="clear-ia@example.com",
            telefono="5557654321",
            consentimiento_version="provisional-v1",
            consentimiento_fecha=timezone.now(),
            origen="diagnostico-inicial",
        )
        public_contact = Contacto.objects.para(self.workspace).create(
            nombre="Contacto público",
            correo="public@example.com",
            telefono="5557654322",
            consentimiento_version="provisional-v1",
            consentimiento_fecha=timezone.now(),
            origen=f"cuestionario-{self.questionnaire.uid}",
        )
        url = reverse("contactos", args=[self.workspace.uid])

        clearia = self.client.get(url, {"origen": "clear-ia"})
        public = self.client.get(url, {"origen": "publicos"})
        events = self.client.get(url, {"origen": "eventos"})

        self.assertContains(clearia, "Contacto Clear-IA")
        self.assertNotContains(clearia, "Contacto público")
        self.assertContains(clearia, "Diagnóstico de Clear-IA")
        self.assertContains(public, "Contacto público")
        self.assertNotContains(public, "Contacto Clear-IA")
        self.assertContains(public, "Formulario público")
        self.assertNotContains(events, "Contacto público")
        self.assertContains(
            clearia,
            "Aquí se guardan las personas que respondieron los cuestionarios de tu empresa.",
        )
        self.assertEqual(clearia_contact.origen, "diagnostico-inicial")
        self.assertTrue(public_contact.origen.startswith("cuestionario-"))

    def test_contact_menu_only_shows_sections_allowed_by_membership(self):
        url = reverse("contactos", args=[self.workspace.uid])

        response = self.client.get(url)

        self.assertContains(response, reverse("resumen_workspace", args=[self.workspace.uid]))
        self.assertContains(response, reverse("contactos", args=[self.workspace.uid]))
        self.assertNotContains(
            response, reverse("mis_cuestionarios", args=[self.workspace.uid])
        )
        self.assertNotContains(response, reverse("miembros", args=[self.workspace.uid]))
        private_navigation = response.content.decode().split(
            '<nav class="private-nav private-desktop-nav"', 1
        )[1].split("</nav>", 1)[0]
        self.assertNotIn("Biblioteca", private_navigation)

    def test_manage_permission_updates_state_assignment_and_followup(self):
        self.membership.gestionar_leads = True
        self.membership.save(update_fields=["gestionar_leads"])

        state_response = self.client.post(
            self.detail_url,
            {"accion": "estado", "estado": Contacto.Estado.INTERESADO},
        )
        assignment_response = self.client.post(
            self.detail_url,
            {
                "accion": "asignacion",
                "membresia_uid": str(self.assignee_membership.uid),
            },
        )
        followup_response = self.client.post(
            self.detail_url,
            {
                "accion": "seguimiento",
                "tipo": Seguimiento.Tipo.LLAMADA,
                "notas": "Se realizó una llamada.",
                "resultado": "Pendiente",
                "proxima_accion": "Enviar información",
            },
        )

        self.assertEqual(state_response.status_code, 302)
        self.assertEqual(assignment_response.status_code, 302)
        self.assertEqual(followup_response.status_code, 302)
        self.contact.refresh_from_db()
        self.assertEqual(self.contact.estado, Contacto.Estado.INTERESADO)
        self.assertEqual(self.contact.asignado_a, self.assignee)
        self.assertEqual(Seguimiento.objects.para(self.workspace).count(), 1)

    def test_contacted_timestamp_is_set_only_the_first_time(self):
        self.membership.gestionar_leads = True
        self.membership.save(update_fields=["gestionar_leads"])
        self.client.post(
            self.detail_url,
            {"accion": "estado", "estado": Contacto.Estado.CONTACTADO},
        )
        self.contact.refresh_from_db()
        first_contacted_at = self.contact.contactado_en

        self.client.post(
            self.detail_url,
            {"accion": "estado", "estado": Contacto.Estado.INTERESADO},
        )
        self.client.post(
            self.detail_url,
            {"accion": "estado", "estado": Contacto.Estado.CONTACTADO},
        )
        self.contact.refresh_from_db()

        self.assertIsNotNone(first_contacted_at)
        self.assertEqual(self.contact.contactado_en, first_contacted_at)

    def test_regular_user_cannot_delete_contact_even_with_manage_permission(self):
        self.membership.gestionar_leads = True
        self.membership.save(update_fields=["gestionar_leads"])

        response = self.client.post(self.detail_url, {"accion": "eliminar"})

        self.assertEqual(response.status_code, 404)
        self.assertTrue(
            Contacto.objects.para(self.workspace).filter(pk=self.contact.pk).exists()
        )

    def test_owner_can_delete_contact_and_cascaded_diagnosis_and_followups(self):
        self.membership.rol = Membresia.Rol.PROPIETARIO
        self.membership.save(update_fields=["rol"])
        Seguimiento.objects.para(self.workspace).create(
            contacto=self.contact,
            tipo=Seguimiento.Tipo.NOTA,
            notas="Seguimiento de prueba",
        )

        response = self.client.post(self.detail_url, {"accion": "eliminar"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(Contacto.objects.para(self.workspace).count(), 0)
        self.assertEqual(Diagnostico.objects.para(self.workspace).count(), 0)
        self.assertEqual(Seguimiento.objects.para(self.workspace).count(), 0)


class QuestionnairePublicationPermissionTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create(correo="publisher@example.com")
        self.workspace = Workspace.objects.create(
            slug="publisher-company",
            nombre="Empresa publicadora",
        )
        self.membership = Membresia.objects.para(self.workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.USUARIO,
        )
        configuration = questionnaire_config()
        configuration["estado"] = Cuestionario.Estado.BORRADOR
        self.questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Borrador",
            estado=Cuestionario.Estado.BORRADOR,
            configuracion=configuration,
            version_actual=1,
        )
        VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=self.questionnaire,
            numero=1,
            configuracion=configuration,
            publicada=False,
        )
        session = self.client.session
        session["usuario_uid"] = str(self.user.uid)
        session.save()
        self.publish_url = reverse(
            "publicar_cuestionario",
            args=[self.workspace.uid, self.questionnaire.uid],
        )
        self.unpublish_url = reverse(
            "despublicar_cuestionario",
            args=[self.workspace.uid, self.questionnaire.uid],
        )

    def test_publish_permission_is_required_and_publishing_creates_immutable_version(self):
        denied = self.client.post(self.publish_url)
        self.assertEqual(denied.status_code, 404)

        self.membership.publicar_cuestionarios = True
        self.membership.save(update_fields=["publicar_cuestionarios"])
        response = self.client.post(self.publish_url)

        self.assertEqual(response.status_code, 302)
        self.questionnaire.refresh_from_db()
        self.assertEqual(self.questionnaire.estado, Cuestionario.Estado.PUBLICADO)
        version = VersionCuestionario.objects.para(self.workspace).get(
            cuestionario=self.questionnaire,
            numero=2,
        )
        self.assertTrue(version.publicada)
        self.assertEqual(version.configuracion["estado"], "publicado")
        repeated_publish = self.client.post(self.publish_url)
        self.assertEqual(repeated_publish.status_code, 404)
        self.assertEqual(
            VersionCuestionario.objects.para(self.workspace)
            .filter(cuestionario=self.questionnaire)
            .count(),
            2,
        )

    def test_published_questionnaire_can_be_unpublished_by_publisher(self):
        self.membership.publicar_cuestionarios = True
        self.membership.save(update_fields=["publicar_cuestionarios"])
        self.client.post(self.publish_url)

        response = self.client.post(self.unpublish_url)

        self.assertEqual(response.status_code, 302)
        self.questionnaire.refresh_from_db()
        self.assertEqual(self.questionnaire.estado, Cuestionario.Estado.BORRADOR)
        public = self.client.get(
            reverse(
                "cuestionario_publico",
                args=[self.workspace.slug, self.questionnaire.uid],
            )
        )
        self.assertEqual(public.status_code, 404)

    def test_invalid_configuration_is_not_published(self):
        self.membership.publicar_cuestionarios = True
        self.membership.save(update_fields=["publicar_cuestionarios"])
        self.questionnaire.configuracion["preguntas"][0].pop("id")
        self.questionnaire.save(update_fields=["configuracion"])

        response = self.client.post(self.publish_url)

        self.assertEqual(response.status_code, 400)
        self.assertContains(response, "preguntas[0].id", status_code=400)
        self.assertEqual(
            VersionCuestionario.objects.para(self.workspace)
            .filter(cuestionario=self.questionnaire)
            .count(),
            1,
        )
