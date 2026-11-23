from django.core.exceptions import ValidationError
from django.test import TestCase

from funnels.models import Cuestionario, VersionCuestionario
from funnels.tests.support import questionnaire_config
from workspaces.models import Workspace


class QuestionnaireVersionImmutabilityTests(TestCase):
    def setUp(self):
        self.workspace = Workspace.objects.create(
            slug="immutable-company",
            nombre="Empresa inmutable",
        )
        self.questionnaire = Cuestionario.objects.para(self.workspace).create(
            nombre="Diagnóstico",
            configuracion=questionnaire_config(),
        )
        self.version = VersionCuestionario.objects.para(self.workspace).create(
            cuestionario=self.questionnaire,
            numero=1,
            configuracion=questionnaire_config(),
            publicada=False,
        )

    def test_instance_and_queryset_updates_and_deletes_are_rejected(self):
        self.version.configuracion["cliente"] = "Cambio"
        with self.assertRaises(ValidationError):
            self.version.save()
        with self.assertRaises(ValidationError):
            VersionCuestionario.objects.para(self.workspace).filter(
                pk=self.version.pk
            ).update(publicada=True)
        with self.assertRaises(ValidationError):
            VersionCuestionario.objects.para(self.workspace).filter(
                pk=self.version.pk
            ).delete()
