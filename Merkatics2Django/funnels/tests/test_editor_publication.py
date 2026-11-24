import copy
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest import skipUnless

from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase
from django.urls import reverse

from funnels.models import Cuestionario, Plantilla, VersionCuestionario
from funnels.services import ErrorPublicacion, publicar_cuestionario
from funnels.tests.support import questionnaire_config
from subscriptions.planes import limite_cuestionarios_publicados
from users.models import Usuario
from workspaces.models import Membresia, Workspace


class QuestionnaireEditorTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create(correo="editor@example.com")
        self.workspace = Workspace.objects.create(
            slug="editor-company",
            nombre="Empresa editora",
        )
        self.membership = Membresia.objects.para(self.workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.USUARIO,
            editar_cuestionarios=True,
        )
        self.configuration = questionnaire_config()
        self.questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Cuestionario original",
            configuracion=copy.deepcopy(self.configuration),
            creado_por=self.user,
        )
        VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=self.questionnaire,
            numero=1,
            configuracion=copy.deepcopy(self.configuration),
            publicada=False,
        )
        session = self.client.session
        session["usuario_uid"] = str(self.user.uid)
        session.save()

    def editor_url(self, workspace=None, questionnaire=None):
        return reverse(
            "editar_cuestionario",
            args=[
                (workspace or self.workspace).uid,
                (questionnaire or self.questionnaire).uid,
            ],
        )

    def editor_post(self, configuration=None, **values):
        return self.client.post(
            self.editor_url(),
            {
                "nombre": values.pop("nombre", "Cuestionario editado"),
                "configuracion": json.dumps(
                    configuration or copy.deepcopy(self.configuration),
                    ensure_ascii=False,
                ),
                "intent": values.pop("intent", "save"),
                **values,
            },
        )

    def test_editor_uses_the_ported_screen_and_saves_valid_draft_without_a_version(self):
        response = self.client.get(self.editor_url())

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Personaliza tu cuestionario")
        self.assertContains(response, 'id="editor-fields"')
        self.assertContains(response, 'id="editor-preview"')
        self.assertContains(response, "editor.js")
        self.assertContains(response, "funnels/index.css")

        configuration = copy.deepcopy(self.configuration)
        configuration["preguntas"][0]["texto"] = "¿Cómo llegan tus prospectos?"
        response = self.editor_post(configuration)

        self.assertRedirects(
            response,
            reverse("mis_cuestionarios", args=[self.workspace.uid]),
        )
        self.questionnaire.refresh_from_db()
        self.assertEqual(self.questionnaire.nombre, "Cuestionario editado")
        self.assertEqual(
            self.questionnaire.configuracion["preguntas"][0]["texto"],
            "¿Cómo llegan tus prospectos?",
        )
        self.assertEqual(
            self.questionnaire.configuracion["estado"],
            Cuestionario.Estado.BORRADOR,
        )
        self.assertEqual(
            VersionCuestionario.objects.para(self.workspace)
            .filter(cuestionario=self.questionnaire)
            .count(),
            1,
        )

    def test_editor_rejects_invalid_configuration_without_saving_it(self):
        configuration = copy.deepcopy(self.configuration)
        configuration["preguntas"][0]["opciones"] = []

        response = self.editor_post(configuration)

        self.assertEqual(response.status_code, 400)
        self.assertContains(response, "Corrige el cuestionario antes de guardarlo", status_code=400)
        self.assertContains(response, "requiere opciones no vacías", status_code=400)
        self.questionnaire.refresh_from_db()
        self.assertEqual(
            self.questionnaire.configuracion,
            self.configuration,
        )

    def test_admin_sees_existing_questionnaires_after_reopening_workspace(self):
        Cuestionario.objects.para(self.workspace).create(
            nombre="Segundo cuestionario del propietario",
            configuracion=copy.deepcopy(self.configuration),
            creado_por=self.user,
        )
        admin = Usuario.objects.create(correo="company-admin@example.com")
        Membresia.objects.para(self.workspace).create(
            correo=admin.correo,
            usuario=admin,
            rol=Membresia.Rol.ADMIN,
        )
        session = self.client.session
        session["usuario_uid"] = str(admin.uid)
        session.save()

        self.client.get(reverse("inicio"))
        selector = self.client.get(reverse("selector_workspace"))
        self.assertIn("no-store", selector["Cache-Control"])
        summary = self.client.get(
            reverse("resumen_workspace", args=[self.workspace.uid])
        )
        self.assertIn("no-store", summary["Cache-Control"])
        self.assertContains(
            summary,
            reverse("mis_cuestionarios", args=[self.workspace.uid]),
        )
        listing = self.client.get(
            reverse("mis_cuestionarios", args=[self.workspace.uid])
        )

        self.assertEqual(summary.status_code, 200)
        self.assertContains(listing, "Cuestionario original")
        self.assertContains(listing, "Segundo cuestionario del propietario")
        self.assertIn("no-store", listing["Cache-Control"])

    def test_preview_does_not_save_or_create_a_contact(self):
        configuration = copy.deepcopy(self.configuration)
        configuration["preguntas"][0]["texto"] = "Pregunta de vista previa"

        response = self.editor_post(configuration, intent="preview")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Demostración: no se guardan datos.")
        self.assertContains(response, "Pregunta de vista previa")
        self.questionnaire.refresh_from_db()
        self.assertEqual(
            self.questionnaire.configuracion,
            self.configuration,
        )

    def test_author_permission_is_required_and_administrators_can_edit_any_draft(self):
        other_user = Usuario.objects.create(correo="other-editor@example.com")
        Membresia.objects.para(self.workspace).create(
            correo=other_user.correo,
            usuario=other_user,
            rol=Membresia.Rol.USUARIO,
            editar_cuestionarios=True,
        )
        session = self.client.session
        session["usuario_uid"] = str(other_user.uid)
        session.save()

        self.assertEqual(self.client.get(self.editor_url()).status_code, 404)

        admin = Usuario.objects.create(correo="admin-editor@example.com")
        Membresia.objects.para(self.workspace).create(
            correo=admin.correo,
            usuario=admin,
            rol=Membresia.Rol.ADMIN,
        )
        session["usuario_uid"] = str(admin.uid)
        session.save()
        self.assertEqual(self.client.get(self.editor_url()).status_code, 200)

        owner = Usuario.objects.create(correo="owner-editor@example.com")
        Membresia.objects.para(self.workspace).create(
            correo=owner.correo,
            usuario=owner,
            rol=Membresia.Rol.PROPIETARIO,
        )
        session["usuario_uid"] = str(owner.uid)
        session.save()
        self.assertEqual(self.client.get(self.editor_url()).status_code, 200)

        membership = Membresia.objects.para(self.workspace).get(
            usuario=self.user
        )
        membership.editar_cuestionarios = False
        membership.save(update_fields=["editar_cuestionarios"])
        session["usuario_uid"] = str(self.user.uid)
        session.save()
        self.assertEqual(self.client.get(self.editor_url()).status_code, 404)

    def test_workspace_a_user_receives_404_for_questionnaire_in_workspace_b(self):
        other_workspace = Workspace.objects.create(
            slug="other-editor-company",
            nombre="Otra empresa",
        )
        other_questionnaire = Cuestionario.objects.para(other_workspace).create(
            nombre="Cuestionario ajeno",
            configuracion=copy.deepcopy(self.configuration),
        )

        response = self.client.get(
            self.editor_url(other_workspace, other_questionnaire)
        )

        self.assertEqual(response.status_code, 404)

    def test_published_questionnaire_shows_despublica_primero_instead_of_editor(self):
        self.questionnaire.estado = Cuestionario.Estado.PUBLICADO
        self.questionnaire.save(update_fields=["estado"])

        response = self.client.get(self.editor_url())

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Despublica primero")
        self.assertContains(response, "Un cuestionario publicado no se puede editar ni eliminar.")
        self.assertNotContains(response, 'id="questionnaire-editor-form"')


class QuestionnairePublicationLimitTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create(correo="publisher@example.com")
        self.workspace = Workspace.objects.create(
            slug="publisher-company",
            nombre="Empresa publicadora",
        )
        Membresia.objects.para(self.workspace).create(
            correo=self.user.correo,
            usuario=self.user,
            rol=Membresia.Rol.PROPIETARIO,
        )
        session = self.client.session
        session["usuario_uid"] = str(self.user.uid)
        session.save()

    def create_questionnaire(self, name, state=Cuestionario.Estado.BORRADOR):
        configuration = questionnaire_config()
        configuration["id"] = f"config-{name}"
        configuration["cliente"] = self.workspace.nombre
        configuration["estado"] = state
        questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre=name,
            estado=state,
            configuracion=configuration,
            creado_por=self.user,
        )
        VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=questionnaire,
            numero=1,
            configuracion=copy.deepcopy(configuration),
            publicada=state == Cuestionario.Estado.PUBLICADO,
        )
        return questionnaire

    def action_url(self, action, questionnaire):
        return reverse(
            action,
            args=[self.workspace.uid, questionnaire.uid],
        )

    def test_plan_limits_and_unknown_plan_fallback(self):
        self.assertEqual(limite_cuestionarios_publicados("inicial"), 3)
        self.assertEqual(limite_cuestionarios_publicados("pro"), 10)
        self.assertEqual(limite_cuestionarios_publicados("avanzado"), 25)
        self.assertIsNone(limite_cuestionarios_publicados("interno"))
        self.assertEqual(limite_cuestionarios_publicados("desconocido"), 3)

        for plan, limit in (("pro", 10), ("avanzado", 25)):
            with self.subTest(plan=plan):
                workspace = Workspace.objects.create(
                    slug=f"plan-{plan}",
                    nombre=f"Plan {plan}",
                    plan=plan,
                )
                for index in range(limit):
                    configuration = questionnaire_config()
                    configuration["id"] = f"{plan}-published-{index}"
                    configuration["estado"] = Cuestionario.Estado.PUBLICADO
                    questionnaire = Cuestionario.objects.para(workspace).create(
                        nombre=f"Publicado {index}",
                        estado=Cuestionario.Estado.PUBLICADO,
                        configuracion=configuration,
                    )
                    VersionCuestionario.objects.para(workspace).create(
                        cuestionario=questionnaire,
                        numero=1,
                        configuracion=configuration,
                        publicada=True,
                    )
                draft_configuration = questionnaire_config()
                draft_configuration["id"] = f"{plan}-draft"
                draft = Cuestionario.objects.para(workspace).create(
                    nombre="Borrador",
                    configuracion=draft_configuration,
                )
                with self.assertRaisesMessage(
                    ErrorPublicacion,
                    "Alcanzaste el límite de tu plan",
                ):
                    publicar_cuestionario(workspace, draft.uid)

        self.workspace.plan = "desconocido"
        self.workspace.save(update_fields=["plan"])
        for index in range(3):
            self.create_questionnaire(
                f"Desconocido publicado {index}",
                Cuestionario.Estado.PUBLICADO,
            )
        unknown_plan_draft = self.create_questionnaire("Desconocido borrador")
        with self.assertRaises(ErrorPublicacion):
            publicar_cuestionario(self.workspace, unknown_plan_draft.uid)

    def test_internal_plan_has_no_publication_limit(self):
        workspace = Workspace.objects.create(
            slug="unlimited-company",
            nombre="Empresa interna",
            plan=Workspace.Plan.INTERNO,
        )
        for index in range(26):
            configuration = questionnaire_config()
            configuration["id"] = f"internal-published-{index}"
            configuration["estado"] = Cuestionario.Estado.PUBLICADO
            questionnaire = Cuestionario.objects.para(workspace).create(
                nombre=f"Publicado {index}",
                estado=Cuestionario.Estado.PUBLICADO,
                configuracion=configuration,
            )
            VersionCuestionario.objects.para(workspace).create(
                cuestionario=questionnaire,
                numero=1,
                configuracion=configuration,
                publicada=True,
            )
        draft = Cuestionario.objects.para(workspace).create(
            nombre="Borrador interno",
            configuracion=questionnaire_config(),
        )

        published = publicar_cuestionario(workspace, draft.uid)

        self.assertEqual(published.estado, Cuestionario.Estado.PUBLICADO)

    def test_copy_edit_publish_and_fourth_initial_publication_is_rejected(self):
        template_configuration = questionnaire_config()
        template_configuration["id"] = "template-copy-source"
        Plantilla.objects.create(
            slug="limit-workflow-template",
            nombre="Plantilla del flujo",
            configuracion=template_configuration,
        )
        copy_response = self.client.post(
            reverse("copiar_plantilla", args=["limit-workflow-template"]),
            {"workspace_uid": str(self.workspace.uid)},
        )
        self.assertEqual(copy_response.status_code, 302)
        questionnaire = Cuestionario.objects.para(self.workspace).get()

        edited = copy.deepcopy(questionnaire.configuracion)
        edited["preguntas"][0]["texto"] = "Pregunta editada desde el editor"
        edit_response = self.client.post(
            reverse(
                "editar_cuestionario",
                args=[self.workspace.uid, questionnaire.uid],
            ),
            {
                "nombre": "Copia editada",
                "configuracion": json.dumps(edited, ensure_ascii=False),
                "intent": "save",
            },
        )
        self.assertEqual(edit_response.status_code, 302)
        publish_response = self.client.post(
            self.action_url("publicar_cuestionario", questionnaire)
        )
        self.assertEqual(publish_response.status_code, 302)

        for index in range(2):
            draft = self.create_questionnaire(f"Borrador {index}")
            self.assertEqual(
                self.client.post(
                    self.action_url("publicar_cuestionario", draft)
                ).status_code,
                302,
            )
        next_draft = self.create_questionnaire("Cuarto cuestionario")
        listing = self.client.get(
            reverse("mis_cuestionarios", args=[self.workspace.uid])
        )
        self.assertContains(listing, "Cuestionarios publicados: 3 de 3")
        self.assertContains(
            listing,
            "Alcanzaste el límite de tu plan: despublica uno o cambia de plan",
        )
        self.assertContains(
            listing,
            '<button class="private-button" type="submit" disabled>Publicar</button>',
            html=True,
        )

        rejected = self.client.post(
            self.action_url("publicar_cuestionario", next_draft)
        )

        self.assertEqual(rejected.status_code, 400)
        self.assertContains(
            rejected,
            "Alcanzaste el límite de tu plan: despublica uno o cambia de plan",
            status_code=400,
        )
        next_draft.refresh_from_db()
        self.assertEqual(next_draft.estado, Cuestionario.Estado.BORRADOR)
        self.assertEqual(
            VersionCuestionario.objects.para(self.workspace)
            .filter(cuestionario=next_draft)
            .count(),
            1,
        )

    def test_publication_quota_is_shared_between_workspace_members(self):
        other_user = Usuario.objects.create(correo="member-publisher@example.com")
        Membresia.objects.para(self.workspace).create(
            correo=other_user.correo,
            usuario=other_user,
            rol=Membresia.Rol.USUARIO,
            publicar_cuestionarios=True,
        )
        for index in range(2):
            self.create_questionnaire(
                f"Published {index}",
                Cuestionario.Estado.PUBLICADO,
            )
        member_draft = self.create_questionnaire("Member draft")
        session = self.client.session
        session["usuario_uid"] = str(other_user.uid)
        session.save()
        member_response = self.client.post(
            self.action_url("publicar_cuestionario", member_draft)
        )
        self.assertEqual(member_response.status_code, 302)

        owner_draft = self.create_questionnaire("Owner draft")
        session["usuario_uid"] = str(self.user.uid)
        session.save()
        owner_response = self.client.post(
            self.action_url("publicar_cuestionario", owner_draft)
        )
        self.assertEqual(owner_response.status_code, 400)
        self.assertEqual(
            Cuestionario.objects.para(self.workspace)
            .filter(estado=Cuestionario.Estado.PUBLICADO)
            .count(),
            3,
        )

    def test_publishing_requires_permission_but_administrators_have_it(self):
        draft = self.create_questionnaire("Permission draft")
        unauthorized = Usuario.objects.create(correo="no-publish@example.com")
        Membresia.objects.para(self.workspace).create(
            correo=unauthorized.correo,
            usuario=unauthorized,
            rol=Membresia.Rol.USUARIO,
        )
        session = self.client.session
        session["usuario_uid"] = str(unauthorized.uid)
        session.save()

        denied = self.client.post(
            self.action_url("publicar_cuestionario", draft)
        )

        self.assertEqual(denied.status_code, 404)
        draft.refresh_from_db()
        self.assertEqual(draft.estado, Cuestionario.Estado.BORRADOR)

        publisher = Usuario.objects.create(correo="may-publish@example.com")
        Membresia.objects.para(self.workspace).create(
            correo=publisher.correo,
            usuario=publisher,
            rol=Membresia.Rol.ADMIN,
        )
        session["usuario_uid"] = str(publisher.uid)
        session.save()
        allowed = self.client.post(
            self.action_url("publicar_cuestionario", draft)
        )

        self.assertEqual(allowed.status_code, 302)
        draft.refresh_from_db()
        self.assertEqual(draft.estado, Cuestionario.Estado.PUBLICADO)

    def test_despublication_releases_a_slot(self):
        published = [
            self.create_questionnaire(
                f"Published {index}",
                Cuestionario.Estado.PUBLICADO,
            )
            for index in range(3)
        ]
        draft = self.create_questionnaire("Draft")

        released = self.client.post(
            self.action_url("despublicar_cuestionario", published[0])
        )
        self.assertEqual(released.status_code, 302)
        published[0].refresh_from_db()
        self.assertEqual(published[0].estado, Cuestionario.Estado.BORRADOR)
        self.assertTrue(
            VersionCuestionario.objects.para(self.workspace).filter(
                cuestionario=published[0],
                numero=1,
                publicada=True,
            ).exists()
        )

        republished = self.client.post(
            self.action_url("publicar_cuestionario", draft)
        )
        self.assertEqual(republished.status_code, 302)
        self.assertEqual(
            Cuestionario.objects.para(self.workspace)
            .filter(estado=Cuestionario.Estado.PUBLICADO)
            .count(),
            3,
        )

    def test_two_competing_publications_at_the_limit_allow_only_one_success(self):
        for index in range(2):
            self.create_questionnaire(
                f"Published {index}",
                Cuestionario.Estado.PUBLICADO,
            )
        first = self.create_questionnaire("First contender")
        second = self.create_questionnaire("Second contender")

        first_response = self.client.post(
            self.action_url("publicar_cuestionario", first)
        )
        second_response = self.client.post(
            self.action_url("publicar_cuestionario", second)
        )

        self.assertEqual(first_response.status_code, 302)
        self.assertEqual(second_response.status_code, 400)
        self.assertEqual(
            Cuestionario.objects.para(self.workspace)
            .filter(estado=Cuestionario.Estado.PUBLICADO)
            .count(),
            3,
        )

    def test_suspended_workspace_cannot_publish(self):
        self.workspace.estado = Workspace.Estado.SUSPENDIDA
        self.workspace.save(update_fields=["estado"])
        draft = self.create_questionnaire("Suspended draft")

        listing = self.client.get(
            reverse("mis_cuestionarios", args=[self.workspace.uid])
        )
        self.assertContains(
            listing,
            "La empresa está suspendida y no puede publicar cuestionarios.",
        )
        response = self.client.post(
            self.action_url("publicar_cuestionario", draft)
        )

        self.assertEqual(response.status_code, 400)
        self.assertContains(
            response,
            "La empresa está suspendida y no puede publicar cuestionarios.",
            status_code=400,
        )
        self.assertFalse(
            VersionCuestionario.objects.para(self.workspace).filter(
                cuestionario=draft,
                publicada=True,
            ).exists()
        )


@skipUnless(
    connection.vendor == "mysql",
    "La prueba concurrente requiere el bloqueo por fila de MySQL.",
)
class ConcurrentQuestionnairePublicationTests(TransactionTestCase):
    def setUp(self):
        self.workspace = Workspace.objects.create(
            slug="concurrent-company",
            nombre="Empresa concurrente",
        )
        for index in range(2):
            configuration = questionnaire_config()
            configuration["id"] = f"concurrent-published-{index}"
            configuration["estado"] = Cuestionario.Estado.PUBLICADO
            questionnaire = Cuestionario.objects.para(self.workspace).create(
                nombre=f"Publicado {index}",
                estado=Cuestionario.Estado.PUBLICADO,
                configuracion=configuration,
            )
            VersionCuestionario.objects.para(self.workspace).create(
                cuestionario=questionnaire,
                numero=1,
                configuracion=configuration,
                publicada=True,
            )
        self.contenders = [
            Cuestionario.objects.para(self.workspace).create(
                nombre=f"Contendiente {index}",
                configuracion=questionnaire_config(),
            )
            for index in range(2)
        ]

    def test_simultaneous_publications_do_not_exceed_workspace_limit(self):
        start = threading.Barrier(2)

        def publish(uid):
            close_old_connections()
            try:
                workspace = Workspace.objects.get(pk=self.workspace.pk)
                start.wait(timeout=10)
                try:
                    publicar_cuestionario(workspace, uid)
                    return "publicado"
                except ErrorPublicacion:
                    return "rechazado"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(
                executor.map(
                    publish,
                    [questionnaire.uid for questionnaire in self.contenders],
                )
            )

        self.assertCountEqual(results, ["publicado", "rechazado"])
        self.assertEqual(
            Cuestionario.objects.para(self.workspace)
            .filter(estado=Cuestionario.Estado.PUBLICADO)
            .count(),
            3,
        )
