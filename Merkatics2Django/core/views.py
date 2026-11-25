import secrets

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET

from core.maintenance import limpiar_datos_temporales


@require_GET
def limpiar_temporales_cron(request):
    configured_secret = settings.CRON_SECRET
    authorization = request.headers.get("Authorization", "")
    supplied_secret = authorization.removeprefix("Bearer ").strip()
    if not configured_secret or not secrets.compare_digest(
        supplied_secret, configured_secret
    ):
        return HttpResponse("No autorizado.", status=403)
    return JsonResponse(limpiar_datos_temporales())
