import uuid

from django.test import Client, TestCase
from django.urls import reverse

from contacts.models import Contacto, Diagnostico, LimiteEnviosIP
from funnels.models import Cuestionario, Plantilla, VersionCuestionario
from funnels.tests.support import (
    posted_answers,
    questionnaire_config,
    valid_contact_post,
)
from workspaces.models import Membresia, Workspace


class PublicQuestionnaireFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.workspace = Workspace.objects.create(
            slug="public-company",
            nombre="Empresa pública",
        )
        cls.configuration = questionnaire_config()
        cls.questionnaire = Cuestionario.objects.para(cls.workspace).create(
            nombre="Diagnóstico comercial",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion=cls.configuration,
            version_actual=1,
        )
        VersionCuestionario.objects.para(cls.workspace).create(
            cuestionario=cls.questionnaire,
            numero=1,
            configuracion=cls.configuration,
            publicada=True,
        )

    def public_url(self):
        return reverse(
            "cuestionario_publico",
            args=[self.workspace.slug, self.questionnaire.uid],
        )

    def test_public_page_contains_intro_and_all_questions_in_markup(self):
        response = self.client.get(self.public_url())
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Antes de empezar")
        self.assertContains(response, "¿Cómo captas prospectos?")
        self.assertContains(response, "¿Das seguimiento?")
        self.assertContains(response, "questionnaire.js")
        self.assertNotContains(response, "name=\"puntaje\"")

    def test_public_intro_uses_questionnaire_name_when_welcome_title_is_missing(self):
        configuration = questionnaire_config()
        configuration["cliente"] = self.workspace.nombre
        configuration.pop("bienvenida")
        questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Diagnóstico de empresa",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion=configuration,
            version_actual=1,
        )
        VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=questionnaire,
            numero=1,
            configuracion=configuration,
            publicada=True,
        )
        url = reverse(
            "cuestionario_publico",
            args=[self.workspace.slug, questionnaire.uid],
        )

        response = self.client.get(url)

        self.assertContains(response, "<h2>Diagnóstico de empresa</h2>")
        self.assertNotContains(response, "<h2>Empresa pública</h2>")

    def test_submission_saves_contact_and_server_calculation_without_score_or_segment(self):
        attempt = uuid.uuid4()
        payload = valid_contact_post(
            attempt,
            puntaje_total="99999",
            segmento="segmento-forjado",
        )
        response = self.client.post(self.public_url(), payload)

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Tu resultado está listo.")
        self.assertNotContains(response, "segmento-privado")
        self.assertNotContains(response, "segmento-forjado")
        self.assertNotContains(response, "puntaje_total")
        contact = Contacto.objects.para(self.workspace).get(attempt_id=attempt)
        diagnosis = Diagnostico.objects.para(self.workspace).get(contacto=contact)
        self.assertEqual(contact.correo, "prueba@example.com")
        self.assertEqual(diagnosis.puntaje_total, 2)
        self.assertEqual(diagnosis.puntaje_maximo, 4)
        self.assertEqual(diagnosis.segmento, "segmento-privado")
        self.assertEqual(diagnosis.respuestas["0"]["valor_legible"], "Tenemos un proceso")
        self.assertEqual(contact.consentimiento_version, "provisional-v1")
        self.assertContains(response, "result-profile-chart")

    def test_missing_consent_cannot_create_contact_or_diagnosis(self):
        payload = valid_contact_post(uuid.uuid4(), consentimiento="")
        response = self.client.post(self.public_url(), payload)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Contacto.objects.para(self.workspace).count(), 0)
        self.assertEqual(Diagnostico.objects.para(self.workspace).count(), 0)


    def test_open_response_without_template_limit_has_safe_server_cap(self):
        configuration = questionnaire_config()
        configuration["id"] = "open-response-limit"
        question = configuration["preguntas"][0]
        question["tipo"] = "abierta"
        question.pop("opciones")
        questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Respuesta abierta",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion=configuration,
            version_actual=1,
        )
        VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=questionnaire,
            numero=1,
            configuracion=configuration,
            publicada=True,
        )
        answers = posted_answers()
        answers["0"] = {"tipo": "abierta", "valor": "x" * 10001}
        url = reverse(
            "cuestionario_publico",
            args=[self.workspace.slug, questionnaire.uid],
        )

        response = self.client.post(url, valid_contact_post(uuid.uuid4(), answers))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Contacto.objects.para(self.workspace).count(), 0)

    def test_reposting_same_attempt_is_idempotent(self):
        attempt = uuid.uuid4()
        payload = valid_contact_post(attempt)

        first = self.client.post(self.public_url(), payload)
        second = self.client.post(self.public_url(), payload)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            Contacto.objects.para(self.workspace).filter(attempt_id=attempt).count(),
            1,
        )
        self.assertEqual(Diagnostico.objects.para(self.workspace).count(), 1)

    def test_suspended_workspace_public_questionnaire_is_not_found(self):
        self.workspace.estado = Workspace.Estado.SUSPENDIDA
        self.workspace.save(update_fields=["estado"])

        response = self.client.get(self.public_url())

        self.assertEqual(response.status_code, 404)

    def test_public_post_requires_csrf(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post(
            self.public_url(),
            valid_contact_post(uuid.uuid4()),
        )
        self.assertEqual(response.status_code, 403)


class InitialDiagnosticRecommendationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.workspace = Workspace.objects.create(
            slug="clearia",
            nombre="Clear-IA",
            plan=Workspace.Plan.INTERNO,
        )
        configuration = questionnaire_config(position="inicio")
        configuration["reglas_scoring"][0]["segmento"] = "proceso_por_construir"
        configuration["resultado"]["resultados"][0].update(
            {
                "segmento": "proceso_por_construir",
                "contenido": "Explicación base del diagnóstico.",
            }
        )
        cls.questionnaire = Cuestionario.objects.para(cls.workspace).create(
            nombre="Diagnóstico inicial",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion=configuration,
            version_actual=1,
        )
        VersionCuestionario.objects.para(cls.workspace).create(
            cuestionario=cls.questionnaire,
            numero=1,
            configuracion=configuration,
            publicada=True,
        )
        Plantilla.objects.create(
            slug="demo-onboarding-para-agencia",
            nombre="Onboarding para agencia",
            descripcion="Plantilla recomendada.",
            configuracion=configuration,
            tipo=Plantilla.Tipo.BIBLIOTECA,
        )

    def test_diagnostic_result_shows_recommendation_without_score_or_segment(self):
        attempt = uuid.uuid4()
        response = self.client.post(
            reverse("diagnostico_inicial"),
            valid_contact_post(attempt),
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Template recomendado")
        self.assertContains(response, "Onboarding para agencia")
        self.assertContains(response, "Por qué encaja")
        self.assertContains(response, "Explicación base del diagnóstico.")
        self.assertContains(response, "Impacto comercial estimado")
        self.assertContains(response, "Prospectos al mes")
        self.assertContains(response, "calculadora-impacto.js")
        self.assertNotContains(response, "proceso_por_construir")
        self.assertNotContains(response, "puntaje_total")
        self.assertNotContains(response, "Puntaje:")

    def test_repeated_diagnostic_attempt_keeps_recommendation_screen(self):
        attempt = uuid.uuid4()
        payload = valid_contact_post(attempt)
        self.client.post(reverse("diagnostico_inicial"), payload)
        response = self.client.post(reverse("diagnostico_inicial"), payload)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Template recomendado")
        self.assertContains(response, "Onboarding para agencia")
        self.assertNotContains(response, "proceso_por_construir")


class DemoQuestionnaireTests(TestCase):
    def setUp(self):
        self.configuration = questionnaire_config()
        Plantilla.objects.create(
            slug="demo-template",
            nombre="Template demostrativo",
            formato="Cuestionario",
            caso_uso="Prueba",
            nicho="General",
            descripcion="Plantilla para pruebas.",
            configuracion=self.configuration,
        )
        self.url = reverse("demostrar_plantilla", args=["demo-template"])

    def test_demo_keeps_client_fallback_when_welcome_title_is_missing(self):
        self.configuration.pop("bienvenida")
        plantilla = Plantilla.objects.get(slug="demo-template")
        plantilla.configuracion = self.configuration
        plantilla.save(update_fields=["configuracion"])

        response = self.client.get(self.url)

        self.assertContains(response, "<h2>Empresa de prueba</h2>")

    def test_demo_can_be_submitted_without_consent_or_database_writes(self):
        attempt = uuid.uuid4()
        response = self.client.post(
            self.url,
            valid_contact_post(attempt, consentimiento=""),
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Demostración: no se guardan datos.")
        self.assertContains(response, "Tu resultado está listo.")
        self.assertEqual(Contacto.objects.sin_alcance().count(), 0)
        self.assertEqual(Diagnostico.objects.sin_alcance().count(), 0)
        self.assertEqual(LimiteEnviosIP.objects.count(), 0)


class PublicSubmissionRateLimitTests(TestCase):
    def setUp(self):
        self.workspace = Workspace.objects.create(
            slug="rate-limited",
            nombre="Empresa con límite",
        )
        configuration = questionnaire_config()
        self.questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Diagnóstico",
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
        self.url = reverse(
            "cuestionario_publico",
            args=[self.workspace.slug, self.questionnaire.uid],
        )

    def test_database_rate_limit_returns_429_after_ten_submissions(self):
        for _ in range(10):
            response = self.client.post(
                self.url,
                valid_contact_post(uuid.uuid4()),
            )
            self.assertEqual(response.status_code, 200)

        limited = self.client.post(self.url, valid_contact_post(uuid.uuid4()))

        self.assertEqual(limited.status_code, 429)
        self.assertEqual(Contacto.objects.para(self.workspace).count(), 10)
        self.assertEqual(LimiteEnviosIP.objects.count(), 1)
