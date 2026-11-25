from datetime import timedelta

from django.contrib.sessions.models import Session
from django.test import TestCase, override_settings
from django.utils import timezone

from contacts.models import LimiteEnviosIP
from users.models import IntentoAcceso


@override_settings(CRON_SECRET="cron-test-secret")
class MaintenanceCronTests(TestCase):
    def setUp(self):
        old_date = timezone.now() - timedelta(days=2)
        Session.objects.create(
            session_key="expired-session-key",
            session_data="",
            expire_date=old_date,
        )
        self.expired_login_attempt = IntentoAcceso.objects.create(
            ip_hash="expired-login-hash",
            inicio_ventana=old_date,
            cantidad=1,
        )
        self.expired_limit = LimiteEnviosIP.objects.create(
            ip_hash="expired-limit-hash",
            inicio_ventana=old_date,
            cantidad=1,
        )

    def test_cron_requires_secret_and_only_accepts_get(self):
        url = "/cron/limpiar-temporales/"
        self.assertEqual(self.client.get(url).status_code, 403)
        self.assertEqual(
            self.client.post(url, HTTP_AUTHORIZATION="Bearer cron-test-secret").status_code,
            405,
        )

    def test_cron_deletes_expired_sessions_and_rate_limit_records(self):
        response = self.client.get(
            "/cron/limpiar-temporales/",
            HTTP_AUTHORIZATION="Bearer cron-test-secret",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"sesiones": 1, "intentos_acceso": 1, "limites_envio": 1},
        )
        self.assertFalse(Session.objects.filter(session_key="expired-session-key").exists())
        self.assertFalse(IntentoAcceso.objects.filter(pk=self.expired_login_attempt.pk).exists())
        self.assertFalse(LimiteEnviosIP.objects.filter(pk=self.expired_limit.pk).exists())
