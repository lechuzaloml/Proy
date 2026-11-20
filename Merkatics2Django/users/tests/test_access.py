from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from users.google_identity import GoogleCredentialError, verify_google_credential
from users.models import AdminPlataforma, IntentoAcceso, Usuario
from workspaces.models import Membresia, Workspace


@override_settings(GOOGLE_CLIENT_ID="clear-ia-test-client")
class GoogleIdentityTests(TestCase):
    @patch("users.google_identity.id_token.verify_oauth2_token")
    def test_valid_credential_uses_configured_audience(self, verify):
        verify.return_value = {
            "aud": settings.GOOGLE_CLIENT_ID,
            "email": "person@example.com",
            "email_verified": True,
            "exp": 4_000_000_000,
        }

        claims = verify_google_credential("signed-credential")

        self.assertEqual(claims["email"], "person@example.com")
        verify.assert_called_once()
        self.assertEqual(verify.call_args.kwargs["audience"], settings.GOOGLE_CLIENT_ID)

    @patch("users.google_identity.id_token.verify_oauth2_token")
    def test_wrong_audience_is_rejected(self, verify):
        verify.return_value = {
            "aud": "another-client",
            "email": "person@example.com",
            "email_verified": True,
        }
        with self.assertRaises(GoogleCredentialError):
            verify_google_credential("credential")

    @patch("users.google_identity.id_token.verify_oauth2_token")
    def test_unverified_email_is_rejected(self, verify):
        verify.return_value = {
            "aud": settings.GOOGLE_CLIENT_ID,
            "email": "person@example.com",
            "email_verified": False,
        }
        with self.assertRaises(GoogleCredentialError):
            verify_google_credential("credential")

    @patch("users.google_identity.id_token.verify_oauth2_token")
    def test_expired_credential_is_rejected_by_google_auth(self, verify):
        verify.side_effect = ValueError("expired")
        with self.assertRaises(GoogleCredentialError):
            verify_google_credential("expired-credential")


@override_settings(GOOGLE_CLIENT_ID="clear-ia-test-client")
class LoginViewTests(TestCase):
    claims = {
        "aud": "clear-ia-test-client",
        "email": "USER@Example.com",
        "email_verified": True,
        "name": "Example User",
        "picture": "https://example.com/avatar.png",
        "exp": 4_000_000_000,
    }

    @patch("users.views.verify_google_credential")
    def test_login_rotates_session_and_stores_only_user_uid(self, verify):
        verify.return_value = self.claims
        session = self.client.session
        session["temporary"] = "value"
        session.save()
        old_key = session.session_key

        response = self.client.post(
            "/acceso/",
            {"credential": "valid", "next": "/workspaces/"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertNotEqual(self.client.session.session_key, old_key)
        self.assertEqual(list(self.client.session.keys()), ["usuario_uid"])
        user = Usuario.objects.get()
        self.assertEqual(user.correo, "user@example.com")
        self.assertEqual(self.client.session["usuario_uid"], str(user.uid))
        self.assertEqual(
            self.client.session.get_expiry_age(), settings.SESSION_COOKIE_AGE
        )
        self.assertIsNotNone(user.ultimo_acceso)

    @patch("users.views.verify_google_credential")
    def test_external_redirect_is_rejected(self, verify):
        verify.return_value = self.claims
        response = self.client.post(
            "/acceso/",
            {"credential": "valid", "next": "https://attacker.example/"},
        )
        self.assertRedirects(response, "/workspaces/", fetch_redirect_response=False)

    @patch("users.views.verify_google_credential")
    def test_login_links_preexisting_memberships_by_normalized_email(self, verify):
        verify.return_value = self.claims
        workspace = Workspace.objects.create(slug="first-workspace", nombre="First")
        membership = Membresia.objects.para(workspace).create(
            correo="user@example.com", rol=Membresia.Rol.USUARIO
        )

        self.client.post("/acceso/", {"credential": "valid"})

        membership.refresh_from_db()
        self.assertEqual(membership.usuario.correo, "user@example.com")

    @patch("users.views.verify_google_credential")
    def test_invalid_audience_is_rejected_by_view(self, verify):
        verify.return_value = {
            **self.claims,
            "aud": "wrong-client",
        }
        response = self.client.post("/acceso/", {"credential": "invalid"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Usuario.objects.exists())

    @patch("users.views.verify_google_credential")
    def test_unverified_email_is_rejected_by_view(self, verify):
        verify.side_effect = GoogleCredentialError("El correo no está verificado.")
        response = self.client.post("/acceso/", {"credential": "invalid"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Usuario.objects.exists())

    @patch("users.views.verify_google_credential")
    def test_eleventh_attempt_from_same_ip_is_blocked(self, verify):
        verify.side_effect = GoogleCredentialError("Credencial inválida.")
        responses = [
            self.client.post("/acceso/", {"credential": "invalid"})
            for _ in range(10)
        ]
        blocked = self.client.post("/acceso/", {"credential": "invalid"})

        self.assertTrue(all(response.status_code == 400 for response in responses))
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(IntentoAcceso.objects.get().cantidad, 10)

    def test_attempt_limit_resets_after_fifteen_minutes(self):
        from users.views import _allow_login_attempt

        start = timezone.now()
        with patch("users.views.timezone.now", return_value=start):
            self.assertTrue(_allow_login_attempt("192.0.2.10"))
            for _ in range(9):
                self.assertTrue(_allow_login_attempt("192.0.2.10"))
            self.assertFalse(_allow_login_attempt("192.0.2.10"))
        with patch(
            "users.views.timezone.now",
            return_value=start + timedelta(minutes=15),
        ):
            self.assertTrue(_allow_login_attempt("192.0.2.10"))
        self.assertEqual(IntentoAcceso.objects.get().cantidad, 1)

    def test_logout_requires_post_and_clears_session(self):
        user = Usuario.objects.create(correo="person@example.com")
        session = self.client.session
        session["usuario_uid"] = str(user.uid)
        session.save()

        get_response = self.client.get("/salir/")
        post_response = self.client.post("/salir/")

        self.assertEqual(get_response.status_code, 405)
        self.assertEqual(post_response.status_code, 302)
        self.assertNotIn("usuario_uid", self.client.session)

    def test_csrf_is_required_for_login_and_logout(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post("/acceso/", {"credential": "anything"})
        self.assertEqual(response.status_code, 403)

        user = Usuario.objects.create(correo="person@example.com")
        session = client.session
        session["usuario_uid"] = str(user.uid)
        session.save()
        response = client.post("/salir/")
        self.assertEqual(response.status_code, 403)


class PlatformAdminCommandTests(TestCase):
    def test_platform_admin_is_created_by_management_command(self):
        from django.core.management import call_command

        call_command("crear_admin_plataforma", " ROOT@Example.com ")

        self.assertTrue(
            AdminPlataforma.objects.filter(usuario__correo="root@example.com").exists()
        )
