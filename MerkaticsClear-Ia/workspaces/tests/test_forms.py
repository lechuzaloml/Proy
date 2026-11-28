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
        for slug in ("admin", "aa", "bad_slug", "company-"):
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

    def test_long_google_logo_url_is_accepted(self):
        logo_url = "https://lh3.googleusercontent.com/a/" + "x" * 300 + "=s96-c"
        form = CrearWorkspaceForm(
            {**self.valid_data(), "logo_url": logo_url}
        )

        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["logo_url"], logo_url)

    def test_slug_is_lowercased_before_validation(self):
        form = CrearWorkspaceForm(
            {**self.valid_data(), "slug": "ClearIa-mexico"}
        )

        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["slug"], "clearia-mexico")

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
