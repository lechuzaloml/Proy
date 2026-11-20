from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2 import id_token

from django.conf import settings


class GoogleCredentialError(ValueError):
    pass


def verify_google_credential(credential):
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleCredentialError("Google Identity no está configurado.")
    if not credential:
        raise GoogleCredentialError("Falta la credencial de Google.")
    try:
        claims = id_token.verify_oauth2_token(
            credential,
            Request(),
            audience=settings.GOOGLE_CLIENT_ID,
        )
    except (GoogleAuthError, ValueError) as exc:
        raise GoogleCredentialError("La credencial de Google no es válida.") from exc

    if claims.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise GoogleCredentialError("La audiencia de Google no es válida.")
    if claims.get("email_verified") is not True:
        raise GoogleCredentialError("El correo de Google no está verificado.")
    email = claims.get("email")
    if not isinstance(email, str) or not email.strip():
        raise GoogleCredentialError("Google no proporcionó un correo válido.")
    return claims
