from users.models import AdminPlataforma
from workspaces.models import Membresia


PRIVATE_PATH_PREFIXES = ("/workspaces/", "/plataforma/", "/w/")


def private_navigation(request):
    user = getattr(request, "usuario", None)
    if user is None or not request.path.startswith(PRIVATE_PATH_PREFIXES):
        return {}

    return {
        "es_admin_plataforma": AdminPlataforma.objects.filter(
            usuario=user
        ).exists(),
        "espacios_usuario": (
            Membresia.objects.sin_alcance()
            .filter(usuario=user, estado=Membresia.Estado.ACTIVO)
            .select_related("workspace")
            .order_by("workspace__nombre")
        ),
    }
