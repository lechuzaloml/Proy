from django.test import SimpleTestCase

from workspaces.forms import CrearWorkspaceForm


class WorkspaceFormValidationTests(SimpleTestCase):
    def valid_data(self):
        return {
            "slug": "valid-company",
            "nombre": "Valid Company",
            "propietario_correo": "owner@example.com",
            "plan": "inicial",
            "color_primario": "#E2554F",
            "logo_url": "",
        }

    def test_reserved_and_malformed_slugs_are_rejected(self):
        for slug in ("admin", "aa", "Invalid-Company", "bad_slug", "company-"):
            with self.subTest(slug=slug):
                form = CrearWorkspaceForm({**self.valid_data(), "slug": slug})
                self.assertFalse(form.is_valid())

    def test_valid_slug_and_https_logo_are_accepted(self):
        form = CrearWorkspaceForm(
            {
                **self.valid_data(),
                "logo_url": "https://example.com/logo.png",
            }
        )
        self.assertTrue(form.is_valid(), form.errors)

    def test_http_logo_and_invalid_color_are_rejected(self):
        form = CrearWorkspaceForm(
            {
                **self.valid_data(),
                "logo_url": "http://example.com/logo.png",
                "color_primario": "red",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("logo_url", form.errors)
        self.assertIn("color_primario", form.errors)
