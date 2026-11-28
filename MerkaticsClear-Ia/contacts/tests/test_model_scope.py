from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from contacts.models import Contacto, Diagnostico, Seguimiento
from funnels.models import Cuestionario
from funnels.tests.support import questionnaire_config
from workspaces.models import Workspace


class ContactForeignKeyScopeTests(TestCase):
    def setUp(self):
        self.workspace_a = Workspace.objects.create(
            slug="scope-company-a",
            nombre="Empresa A",
        )
        self.workspace_b = Workspace.objects.create(
            slug="scope-company-b",
            nombre="Empresa B",
        )
        self.contact_b = Contacto.objects.para(self.workspace_b).create(
            nombre="Prospecto B",
            correo="prospecto-b@example.com",
            telefono="5551234567",
            consentimiento_version="provisional-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        self.questionnaire_a = Cuestionario.objects.para(
            self.workspace_a
        ).create(
            nombre="Diagnóstico A",
            configuracion=questionnaire_config(),
        )

    def test_diagnosis_rejects_foreign_workspace_contact(self):
        with self.assertRaises(ValidationError):
            Diagnostico.objects.para(self.workspace_a).create(
                contacto=self.contact_b,
                cuestionario=self.questionnaire_a,
                version=1,
                respuestas={},
                puntaje_total=0,
                puntaje_maximo=0,
                porcentaje=0,
                resultado={},
            )

    def test_followup_rejects_foreign_workspace_contact(self):
        with self.assertRaises(ValidationError):
            Seguimiento.objects.para(self.workspace_a).create(
                contacto=self.contact_b,
                tipo=Seguimiento.Tipo.NOTA,
                notas="No debe cruzar de workspace.",
            )
