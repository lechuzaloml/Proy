from django.core.exceptions import ImproperlyConfigured


def validar_clave_sandbox(secret_key):
    if not isinstance(secret_key, str) or not secret_key.startswith("sk_test_"):
        raise ImproperlyConfigured(
            "STRIPE_SECRET_KEY debe ser una clave de Stripe Sandbox que comience con sk_test_."
        )
    return secret_key
