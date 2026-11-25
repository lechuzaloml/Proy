import json
from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.test import Client, TestCase
from django.db import DatabaseError
from django.urls import reverse
from django.utils import timezone

from contacts.models import Contacto, Diagnostico
from funnels.event_services import ErrorPopup
from funnels.models import Cuestionario, Popup, VersionCuestionario
from funnels.tests.support import questionnaire_config, posted_answers
from users.models import AdminPlataforma, Usuario
from workspaces.models import Membresia, Workspace


class EventViewsTests(TestCase):
    def setUp(self):
        self.owner = Usuario.objects.create(correo="event-owner@example.com")
        self.admin = Usuario.objects.create(correo="event-admin@example.com")
        self.member = Usuario.objects.create(correo="event-member@example.com")
        self.workspace = Workspace.objects.create(
            slug="event-company",
            nombre="Empresa de evento",
        )
        self.owner_membership = Membresia.objects.para(self.workspace).create(
            correo=self.owner.correo,
            usuario=self.owner,
            rol=Membresia.Rol.PROPIETARIO,
        )
        Membresia.objects.para(self.workspace).create(
            correo=self.admin.correo,
            usuario=self.admin,
            rol=Membresia.Rol.ADMIN,
        )
        Membresia.objects.para(self.workspace).create(
            correo=self.member.correo,
            usuario=self.member,
            rol=Membresia.Rol.USUARIO,
        )
        configuration = questionnaire_config()
        self.questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Diagnóstico publicado",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion=configuration,
        )
        VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=self.questionnaire,
            numero=1,
            configuracion=configuration,
            publicada=True,
        )
        self.popup = self.create_popup()

    def login(self, user):
        session = self.client.session
        session["usuario_uid"] = str(user.uid)
        session.save()

    def create_popup(self, **overrides):
        event_date = timezone.now() + timedelta(days=3)
        event_date = event_date.replace(second=0, microsecond=0)
        expiry_day = timezone.localtime(event_date).date() + timedelta(days=1)
        expiry = timezone.make_aware(
            datetime.combine(expiry_day, time.max),
            timezone.get_current_timezone(),
        )
        values = {
            "workspace": self.workspace,
            "titulo": "Masterclass de crecimiento",
            "insignia": "Masterclass",
            "resumen": "Aprende a organizar el seguimiento de tus prospectos.",
            "fecha_evento": event_date,
            "vence_en": expiry,
            "horarios": ["9:30 a. m.", "3:30 p. m."],
            "anfitrion_nombre": "Carlos Torres",
            "puntos": [{"titulo": "Captación", "texto": "Atrae oportunidades."}],
            "cuestionario": self.questionnaire,
            "estado": Popup.Estado.PUBLICADO,
        }
        values.update(overrides)
        return Popup.objects.para(values["workspace"]).create(**values)

    def valid_event_form(self, **overrides):
        event_date = timezone.now() + timedelta(days=4)
        values = {
            "titulo": "Evento actualizado",
            "insignia": "Sesión en vivo",
            "resumen": "Aprende a ordenar tu proceso comercial.",
            "imagen_url": "",
            "fecha_evento": timezone.localtime(event_date).strftime("%Y-%m-%dT%H:%M"),
            "horarios_texto": "10:00 a. m.\n4:00 p. m.",
            "anfitrion_nombre": "Ana Torres",
            "anfitrion_foto_url": "",
            "puntos_texto": "Captación|Cómo atraer prospectos",
            "cuestionario": str(self.questionnaire.pk),
            "accion": "revision",
        }
        values.update(overrides)
        return values

    def test_owner_and_admin_can_manage_only_their_workspace_event(self):
        self.login(self.owner)
        response = self.client.get(
            reverse("mi_evento", args=[self.workspace.uid])
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response, reverse("contactos", args=[self.workspace.uid])
        )
        self.assertContains(
            response, reverse("mis_cuestionarios", args=[self.workspace.uid])
        )
        self.assertContains(response, reverse("biblioteca"))
        self.login(self.admin)
        response = self.client.get(
            reverse("mi_evento", args=[self.workspace.uid])
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response, reverse("contactos", args=[self.workspace.uid])
        )
        self.assertContains(
            response, reverse("mis_cuestionarios", args=[self.workspace.uid])
        )
        self.assertContains(response, reverse("biblioteca"))
        self.login(self.member)
        self.assertEqual(
            self.client.get(reverse("mi_evento", args=[self.workspace.uid])).status_code,
            404,
        )

        other_workspace = Workspace.objects.create(
            slug="other-event-company",
            nombre="Otra empresa",
        )
        self.login(self.admin)
        self.assertEqual(
            self.client.get(reverse("mi_evento", args=[other_workspace.uid])).status_code,
            404,
        )

    def test_event_requires_review_and_edits_of_published_event_return_to_pending(self):
        self.login(self.owner)
        response = self.client.post(
            reverse("mi_evento", args=[self.workspace.uid]),
            self.valid_event_form(),
            follow=True,
        )
        self.assertEqual(
            response.redirect_chain,
            [(reverse("mi_evento", args=[self.workspace.uid]), 302)],
        )
        self.assertContains(response, "El evento se envió correctamente a revisión.")
        popup = Popup.objects.para(self.workspace).get()
        self.assertEqual(popup.estado, Popup.Estado.PENDIENTE)
        self.assertEqual(len(popup.horarios), 2)
        self.assertEqual(
            timezone.localtime(popup.vence_en).date(),
            timezone.localtime(popup.fecha_evento).date() + timedelta(days=1),
        )

        admin_platform = Usuario.objects.create(correo="platform-events@example.com")
        AdminPlataforma.objects.create(usuario=admin_platform)
        self.login(admin_platform)
        self.client.post(
            reverse("moderar_evento", args=[popup.uid]),
            {"accion": "aprobar"},
        )
        popup.refresh_from_db()
        self.assertEqual(popup.estado, Popup.Estado.PUBLICADO)

        self.login(self.owner)
        self.client.post(
            reverse("mi_evento", args=[self.workspace.uid]),
            self.valid_event_form(accion="borrador", titulo="Cambio publicado"),
        )
        popup.refresh_from_db()
        self.assertEqual(popup.estado, Popup.Estado.PENDIENTE)
        self.assertEqual(popup.titulo, "Cambio publicado")

    def test_saved_draft_remains_visible_and_reopenable_after_navigation(self):
        self.popup.delete()
        self.login(self.owner)

        response = self.client.post(
            reverse("mi_evento", args=[self.workspace.uid]),
            self.valid_event_form(
                accion="borrador",
                titulo="Borrador que debe conservarse",
            ),
        )

        self.assertRedirects(
            response,
            reverse("mi_evento", args=[self.workspace.uid]),
        )
        draft = Popup.objects.para(self.workspace).get()
        self.assertEqual(draft.estado, Popup.Estado.BORRADOR)
        self.assertEqual(draft.titulo, "Borrador que debe conservarse")

        self.client.get(reverse("inicio"))
        summary = self.client.get(
            reverse("resumen_workspace", args=[self.workspace.uid])
        )
        self.assertContains(summary, "Mi evento · Borrador")
        self.assertContains(
            summary,
            reverse("mi_evento", args=[self.workspace.uid]),
        )

        reopened = self.client.get(
            reverse("mi_evento", args=[self.workspace.uid])
        )
        self.assertEqual(
            reopened.context["popup"].estado,
            Popup.Estado.BORRADOR,
        )
        self.assertEqual(
            reopened.context["popup"].titulo,
            "Borrador que debe conservarse",
        )

    def test_draft_accepts_empty_optional_event_fields(self):
        self.popup.delete()
        self.login(self.owner)

        response = self.client.post(
            reverse("mi_evento", args=[self.workspace.uid]),
            self.valid_event_form(
                accion="borrador",
                imagen_url="",
                horarios_texto="",
                anfitrion_foto_url="",
                puntos_texto="",
            ),
        )

        self.assertRedirects(
            response,
            reverse("mi_evento", args=[self.workspace.uid]),
        )
        draft = Popup.objects.para(self.workspace).get()
        self.assertEqual(draft.horarios, [])
        self.assertEqual(draft.puntos, [])
        self.assertEqual(draft.imagen_url, "")
        self.assertEqual(draft.anfitrion_foto_url, "")

    def test_review_validation_attaches_errors_to_the_fields_that_need_values(self):
        self.popup.delete()
        self.login(self.owner)

        response = self.client.post(
            reverse("mi_evento", args=[self.workspace.uid]),
            self.valid_event_form(
                accion="revision",
                titulo="",
                resumen="",
                fecha_evento="",
                horarios_texto="",
                anfitrion_nombre="",
                cuestionario="",
            ),
        )

        self.assertEqual(response.status_code, 400)
        errors = response.context["form"].errors
        self.assertIn("titulo", errors)
        self.assertIn("resumen", errors)
        self.assertIn("fecha_evento", errors)
        self.assertIn("horarios_texto", errors)
        self.assertIn("anfitrion_nombre", errors)
        self.assertIn("cuestionario", errors)
        self.assertIn(
            "Agrega al menos un horario e indica su zona horaria.",
            errors["horarios_texto"],
        )
        self.assertNotIn("puntos_texto", errors)
        self.assertFalse(errors.get("__all__"))
        self.assertContains(
            response,
            "No se pudo enviar a revisión",
            status_code=400,
        )
        self.assertContains(
            response,
            "Horarios y zona horaria (uno por línea, máximo cuatro)",
            status_code=400,
        )
        self.assertContains(
            response,
            "Agrega al menos un horario e indica su zona horaria.",
            status_code=400,
        )
        self.assertContains(
            response,
            "La hora no se convierte automáticamente para cada país.",
            status_code=400,
        )

    def test_invalid_or_expired_event_cannot_be_submitted_or_approved(self):
        self.login(self.owner)
        past = timezone.localtime(timezone.now() - timedelta(days=1))
        invalid = self.client.post(
            reverse("mi_evento", args=[self.workspace.uid]),
            self.valid_event_form(
                fecha_evento=past.strftime("%Y-%m-%dT%H:%M"),
            ),
        )
        self.assertEqual(invalid.status_code, 400)
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.PUBLICADO)

        self.popup.estado = Popup.Estado.PENDIENTE
        self.popup.vence_en = timezone.now() - timedelta(seconds=1)
        self.popup.save()
        admin_platform = Usuario.objects.create(correo="platform-expire@example.com")
        AdminPlataforma.objects.create(usuario=admin_platform)
        self.login(admin_platform)
        response = self.client.post(
            reverse("moderar_evento", args=[self.popup.uid]),
            {"accion": "aprobar"},
        )
        self.assertEqual(response.status_code, 302)
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.PENDIENTE)

    def test_public_page_is_unavailable_for_expired_or_inactive_events(self):
        response = self.client.get(reverse("registro_evento", args=[self.workspace.slug]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Regístrate para continuar")
        self.assertContains(
            response,
            '<p class="registro-evento__summary">Aprende a organizar el seguimiento de tus prospectos.</p>',
        )
        self.assertContains(response, "Continuar al cuestionario")
        self.assertContains(response, "Leer aviso de privacidad")
        self.assertContains(response, "Información del evento publicada por la empresa.")
        self.assertNotContains(response, "Prefijo telefónico")

        self.popup.vence_en = timezone.now() - timedelta(seconds=1)
        self.popup.save()
        response = self.client.get(reverse("registro_evento", args=[self.workspace.slug]))
        self.assertEqual(response.status_code, 404)
        self.assertContains(response, "Evento no disponible", status_code=404)

    def test_landing_shows_only_published_workspace_events_in_carousel(self):
        other_workspace = Workspace.objects.create(
            slug="second-event-company",
            nombre="Segunda empresa de evento",
        )
        configuration = questionnaire_config()
        other_questionnaire = Cuestionario.objects.para(other_workspace).create(
            nombre="Diagnóstico de segunda empresa",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion=configuration,
        )
        VersionCuestionario.objects.para(other_workspace).create(
            cuestionario=other_questionnaire,
            numero=1,
            configuracion=configuration,
            publicada=True,
        )
        event_date = timezone.now() + timedelta(days=5)
        expiry_day = timezone.localtime(event_date).date() + timedelta(days=1)
        other_popup = Popup.objects.para(other_workspace).create(
            titulo="Evento de la segunda empresa",
            insignia="Evento propio",
            resumen="Contenido privado de la segunda empresa.",
            fecha_evento=event_date,
            vence_en=timezone.make_aware(
                datetime.combine(expiry_day, time.max),
                timezone.get_current_timezone(),
            ),
            horarios=["11:00 a. m."],
            anfitrion_nombre="Anfitrión de la segunda empresa",
            puntos=[],
            cuestionario=other_questionnaire,
            estado=Popup.Estado.PUBLICADO,
        )

        landing = self.client.get(reverse("inicio"))

        self.assertNotContains(landing, 'data-popup-key="general"')
        self.assertNotContains(landing, reverse("registro_evento_general"))
        self.assertContains(
            landing,
            f'data-popup-return-key="workspace:{self.workspace.slug}" '
            f'href="{reverse("registro_evento", args=[self.workspace.slug])}"',
        )
        self.assertContains(
            landing,
            f'data-popup-return-key="workspace:{other_workspace.slug}" '
            f'href="{reverse("registro_evento", args=[other_workspace.slug])}"',
        )
        other_event_page = self.client.get(
            reverse("registro_evento", args=[other_workspace.slug])
        )
        self.assertContains(other_event_page, "Evento de la segunda empresa")
        self.assertContains(other_event_page, "Segunda empresa de evento")
        self.assertNotContains(other_event_page, self.popup.titulo)
        self.assertEqual(other_popup.workspace_id, other_workspace.pk)

        refreshed_landing = self.client.get(reverse("inicio"))
        self.assertContains(refreshed_landing, "Evento de la segunda empresa")
        self.assertContains(refreshed_landing, self.popup.titulo)

    def test_landing_has_no_popup_when_there_are_no_published_company_events(self):
        self.popup.delete()

        landing = self.client.get(reverse("inicio"))

        self.assertNotContains(landing, "Masterclass en vivo con")
        self.assertNotContains(landing, "data-popup-carousel")
        self.assertNotContains(landing, reverse("registro_evento", args=[self.workspace.slug]))

    def test_general_event_route_is_a_demo_and_never_creates_a_reservation(self):
        url = reverse("registro_evento_general")
        page = self.client.get(url)

        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "Masterclass Clear-IA")
        self.assertContains(page, "Página de demostración")
        self.assertNotIn("popup", page.context)

        response = self.client.post(
            url,
            {
                "nombre": "Prueba",
                "apellido": "Demo",
                "correo": "demo@example.com",
                "lada": "+52",
                "telefono": "5551234567",
                "horario": "9:30 a. m. (hora de Ciudad de México)",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "No se creó ni confirmó ninguna reserva.")
        self.assertNotContains(response, "tu lugar está confirmado")
        self.assertNotContains(response, "demo@example.com")
        self.assertEqual(Contacto.objects.sin_alcance().count(), 0)
        self.assertEqual(Diagnostico.objects.sin_alcance().count(), 0)

    def test_registration_saves_contact_and_diagnosis_in_event_workspace(self):
        url = reverse("registro_evento", args=[self.workspace.slug])
        registration = self.client.post(
            reverse("registrar_evento", args=[self.workspace.slug]),
            {
                "nombre": "María",
                "apellido": "López",
                "correo": "MARIA@example.com",
                "telefono": "+52 55 1234 5678",
                "horario": "9:30 a. m.",
                "consentimiento": "on",
            },
        )
        questionnaire_url = reverse("cuestionario_evento", args=[self.workspace.slug])
        self.assertEqual(registration.status_code, 303)
        self.assertEqual(registration["Location"], questionnaire_url)
        registration_data = self.client.session[f"registro_evento_{self.popup.uid}"]

        questionnaire_page = self.client.get(questionnaire_url)
        self.assertEqual(questionnaire_page.status_code, 200)
        self.assertContains(questionnaire_page, "Cuestionario del evento")
        self.assertNotContains(questionnaire_page, "Reserva tu lugar")
        self.assertContains(questionnaire_page, "Pregunta 1 de 2")
        self.assertContains(questionnaire_page, "Finalizar")

        invalid_answers = self.client.post(
            questionnaire_url,
            {"respuestas": "{}"},
        )
        self.assertEqual(invalid_answers.status_code, 400)
        self.assertContains(invalid_answers, "No se pudo enviar el cuestionario", status_code=400)
        self.assertEqual(Contacto.objects.para(self.workspace).count(), 0)

        response = self.client.post(
            questionnaire_url,
            {
                "respuestas": json.dumps(posted_answers()),
            },
        )
        confirmation_url = response["Location"]
        self.assertEqual(response.status_code, 303)
        self.assertEqual(
            confirmation_url,
            reverse("confirmacion_evento", args=[self.workspace.slug, Contacto.objects.para(self.workspace).get().uid]),
        )

        contact = Contacto.objects.para(self.workspace).get()
        diagnosis = Diagnostico.objects.para(self.workspace).get(contacto=contact)
        self.assertEqual(contact.origen, "evento")
        self.assertEqual(contact.correo, "maria@example.com")
        self.assertEqual(contact.telefono, "+52 55 1234 5678")
        self.assertEqual(
            contact.consentimiento_fecha,
            datetime.fromisoformat(registration_data["consentimiento_fecha"]),
        )
        self.assertEqual(diagnosis.respuestas["horario_evento"], "9:30 a. m.")
        self.assertEqual(Diagnostico.objects.para(self.workspace).count(), 1)

        self.popup.imagen_url = "https://cdn.example.test/event.jpg"
        self.popup.anfitrion_foto_url = "https://cdn.example.test/host.jpg"
        self.popup.save(update_fields=["imagen_url", "anfitrion_foto_url"])
        confirmation = self.client.get(confirmation_url)
        self.assertEqual(confirmation.status_code, 200)
        self.assertContains(confirmation, "María, tu lugar está")
        self.assertContains(confirmation, "9:30 a. m.")
        self.assertContains(confirmation, "Tu perfil por sección")
        self.assertContains(confirmation, 'src="https://cdn.example.test/event.jpg"')
        self.assertContains(confirmation, 'data-fallback-src="https://cdn.example.test/host.jpg"')
        self.assertContains(confirmation, 'href="#registro-evento-resultado"')
        self.assertContains(
            confirmation,
            '<span class="registro-evento__footer-brand">Empresa de evento</span>',
        )
        self.assertEqual(confirmation.content.decode().count("Volver al inicio"), 1)
        self.assertNotContains(confirmation, "segmento-privado")
        self.assertNotContains(confirmation, "puntaje_total")

        self.popup.imagen_url = ""
        self.popup.anfitrion_foto_url = ""
        self.popup.save(update_fields=["imagen_url", "anfitrion_foto_url"])
        confirmation_without_image = self.client.get(confirmation_url)
        self.assertContains(
            confirmation_without_image,
            'aria-label="Imagen del evento no disponible"',
        )
        self.assertNotContains(
            confirmation_without_image,
            "data-event-confirmation-image",
        )
        for dimension, percentage in diagnosis.puntaje_por_dimension.items():
            self.assertContains(
                confirmation_without_image,
                f'aria-label="{dimension}: {percentage}%"',
            )
        self.assertEqual(self.client.get(confirmation_url).status_code, 200)
        self.assertEqual(Contacto.objects.para(self.workspace).count(), 1)
        self.assertEqual(Diagnostico.objects.para(self.workspace).count(), 1)
        self.assertEqual(
            self.client.get(questionnaire_url)["Location"],
            url,
        )
        self.assertEqual(Client().get(confirmation_url).status_code, 404)

    def test_event_registration_requires_consent_and_no_session_redirects_to_event(self):
        registration_url = reverse("registro_evento", args=[self.workspace.slug])
        questionnaire_url = reverse("cuestionario_evento", args=[self.workspace.slug])
        response = self.client.get(questionnaire_url)
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response["Location"], registration_url)

        response = self.client.post(
            reverse("registrar_evento", args=[self.workspace.slug]),
            {
                "nombre": "María",
                "apellido": "López",
                "correo": "maria@example.com",
                "telefono": "5551234567",
                "horario": "9:30 a. m.",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertContains(response, "Este campo es obligatorio.", status_code=400)
        self.assertEqual(Contacto.objects.para(self.workspace).count(), 0)

        response = self.client.post(
            reverse("registrar_evento", args=[self.workspace.slug]),
            {
                "nombre": "N" * 80,
                "apellido": "A" * 41,
                "correo": "maria@example.com",
                "telefono": "5551234567",
                "horario": "9:30 a. m.",
                "consentimiento": "on",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertContains(
            response,
            "El nombre y apellido en conjunto admiten hasta 120 caracteres.",
            status_code=400,
        )
        self.assertEqual(Contacto.objects.para(self.workspace).count(), 0)

    def test_event_confirmation_is_scoped_to_its_workspace(self):
        other_workspace = Workspace.objects.create(
            slug="other-event-public",
            nombre="Otra empresa",
        )
        other_questionnaire = Cuestionario.objects.para(other_workspace).create(
            nombre="Otro diagnóstico",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion=questionnaire_config(),
        )
        VersionCuestionario.objects.para(other_workspace).create(
            cuestionario=other_questionnaire,
            numero=1,
            configuracion=other_questionnaire.configuracion,
            publicada=True,
        )
        other_popup = self.create_popup(
            workspace=other_workspace,
            cuestionario=other_questionnaire,
        )

        self.client.post(
            reverse("registrar_evento", args=[self.workspace.slug]),
            {
                "nombre": "María",
                "apellido": "López",
                "correo": "maria@example.com",
                "telefono": "5551234567",
                "horario": "9:30 a. m.",
                "consentimiento": "on",
            },
        )
        self.client.post(
            reverse("cuestionario_evento", args=[self.workspace.slug]),
            {"respuestas": json.dumps(posted_answers())},
        )
        contact = Contacto.objects.para(self.workspace).get()
        foreign_confirmation = reverse(
            "confirmacion_evento",
            args=[other_workspace.slug, contact.uid],
        )
        self.assertEqual(self.client.get(foreign_confirmation).status_code, 404)
        self.assertEqual(other_popup.workspace, other_workspace)

    def test_platform_review_and_company_suspension_reset_event_to_draft(self):
        admin = Usuario.objects.create(correo="platform-reset@example.com")
        AdminPlataforma.objects.create(usuario=admin)
        self.popup.estado = Popup.Estado.PENDIENTE
        self.popup.save()
        self.login(admin)
        response = self.client.get(reverse("consola_plataforma"))
        self.assertContains(response, "Eventos pendientes de revisión")
        self.assertContains(response, "Masterclass de crecimiento")

        response = self.client.post(
            reverse("editar_workspace", args=[self.workspace.uid]),
            {"accion": "suspender"},
        )
        self.assertEqual(response.status_code, 302)
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.BORRADOR)
        self.client.post(
            reverse("editar_workspace", args=[self.workspace.uid]),
            {"accion": "reactivar"},
        )
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.BORRADOR)

    def test_platform_event_rejection_requires_reason_and_preserves_invalid_text(self):
        platform_admin = Usuario.objects.create(
            correo="platform-rejection-validation@example.com"
        )
        AdminPlataforma.objects.create(usuario=platform_admin)
        self.popup.estado = Popup.Estado.PENDIENTE
        self.popup.save()
        self.login(platform_admin)
        platform_url = reverse("consola_plataforma")
        moderation_url = reverse("moderar_evento", args=[self.popup.uid])

        review_page = self.client.get(platform_url)
        self.assertEqual(review_page.status_code, 200)
        self.assertContains(review_page, "Eventos pendientes de revisión")
        self.assertContains(review_page, "Motivo del rechazo")
        self.assertContains(review_page, "Confirmar rechazo")
        self.assertContains(review_page, "Cancelar")

        empty_reason = self.client.post(
            moderation_url,
            {"accion": "rechazar", "motivo": ""},
        )
        self.assertEqual(empty_reason.status_code, 400)
        self.assertContains(
            empty_reason,
            "Este campo es obligatorio.",
            status_code=400,
        )
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.PENDIENTE)
        self.assertEqual(self.popup.motivo_rechazo, "")

        whitespace_reason = "  \n\t  "
        whitespace_response = self.client.post(
            moderation_url,
            {"accion": "rechazar", "motivo": whitespace_reason},
        )
        self.assertEqual(whitespace_response.status_code, 400)
        self.assertContains(
            whitespace_response,
            "Escribe el motivo del rechazo.",
            status_code=400,
        )
        self.assertContains(
            whitespace_response,
            'name="motivo"',
            status_code=400,
        )
        self.assertIn(
            whitespace_reason,
            whitespace_response.content.decode(),
        )
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.PENDIENTE)
        self.assertEqual(self.popup.motivo_rechazo, "")

        preserved_reason = "La imagen necesita una corrección."
        with patch(
            "funnels.event_views.moderar_popup",
            side_effect=ErrorPopup("La solicitud ya no se puede revisar."),
        ):
            save_error = self.client.post(
                moderation_url,
                {"accion": "rechazar", "motivo": preserved_reason},
            )
        self.assertEqual(save_error.status_code, 400)
        self.assertIn(preserved_reason, save_error.content.decode())

        with patch(
            "funnels.event_views.moderar_popup",
            side_effect=DatabaseError("Simulated database error"),
        ), patch("funnels.event_views.logger.exception") as log_exception:
            database_error = self.client.post(
                moderation_url,
                {"accion": "rechazar", "motivo": preserved_reason},
            )
        self.assertEqual(database_error.status_code, 500)
        self.assertIn(preserved_reason, database_error.content.decode())
        log_exception.assert_called_once()

    def test_rejection_is_persisted_and_only_visible_to_owning_company_admins(self):
        platform_admin = Usuario.objects.create(
            correo="platform-rejection@example.com"
        )
        AdminPlataforma.objects.create(usuario=platform_admin)
        self.popup.estado = Popup.Estado.PENDIENTE
        self.popup.save()
        self.login(platform_admin)
        reason = (
            "La descripción debe ser más clara.\n"
            "Por favor, actualiza la imagen y vuelve a enviar la solicitud."
        )
        moderation_url = reverse("moderar_evento", args=[self.popup.uid])

        rejected = self.client.post(
            moderation_url,
            {"accion": "rechazar", "motivo": reason},
        )
        self.assertRedirects(
            rejected,
            reverse("consola_plataforma"),
            fetch_redirect_response=False,
        )
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.RECHAZADO)
        self.assertEqual(self.popup.motivo_rechazo, reason)
        self.assertEqual(self.popup.rechazado_por, platform_admin)
        self.assertIsNotNone(self.popup.rechazado_en)

        company_url = reverse("mi_evento", args=[self.workspace.uid])
        self.login(self.admin)
        company_panel = self.client.get(company_url)
        self.assertEqual(company_panel.status_code, 200)
        self.assertContains(company_panel, "Estado:</strong> Rechazado")
        self.assertContains(company_panel, "Motivo del rechazo")
        self.assertContains(company_panel, reason)
        self.assertContains(self.client.get(company_url), reason)

        other_workspace = Workspace.objects.create(
            slug="other-rejection-company",
            nombre="Otra empresa",
        )
        self.assertEqual(
            self.client.get(
                reverse("mi_evento", args=[other_workspace.uid])
            ).status_code,
            404,
        )
        self.assertEqual(
            Client().get(company_url).status_code,
            302,
        )

        public_event = self.client.get(
            reverse("registro_evento", args=[self.workspace.slug])
        )
        self.assertEqual(public_event.status_code, 404)
        self.assertNotContains(public_event, reason, status_code=404)
        self.assertNotContains(self.client.get(reverse("inicio")), reason)

        rejected_at = self.popup.rechazado_en
        self.login(platform_admin)
        duplicate = self.client.post(
            moderation_url,
            {"accion": "rechazar", "motivo": "Otro motivo"},
        )
        self.assertEqual(duplicate.status_code, 400)
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.RECHAZADO)
        self.assertEqual(self.popup.motivo_rechazo, reason)
        self.assertEqual(self.popup.rechazado_en, rejected_at)

    def test_company_admin_cannot_open_platform_review_or_reject_popup(self):
        self.popup.estado = Popup.Estado.PENDIENTE
        self.popup.save()
        self.login(self.admin)

        self.assertEqual(
            self.client.get(reverse("consola_plataforma")).status_code,
            404,
        )
        response = self.client.post(
            reverse("moderar_evento", args=[self.popup.uid]),
            {"accion": "rechazar", "motivo": "No autorizado"},
        )
        self.assertEqual(response.status_code, 404)
        self.popup.refresh_from_db()
        self.assertEqual(self.popup.estado, Popup.Estado.PENDIENTE)
        self.assertEqual(self.popup.motivo_rechazo, "")
