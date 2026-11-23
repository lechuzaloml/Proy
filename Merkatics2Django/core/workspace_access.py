from functools import wraps
from urllib.parse import quote

from django.http import Http404
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse

from workspaces.models import Membresia, Workspace


def usuario_requerido(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if request.usuario is None:
            login_url = reverse("acceso")
            return redirect(f"{login_url}?next={quote(request.get_full_path())}")
        return view(request, *args, **kwargs)

    return wrapped


def obtener_workspace_y_membresia(request, workspace_uid):
    workspace = get_object_or_404(Workspace, uid=workspace_uid)
    membership = (
        Membresia.objects.para(workspace)
        .select_related("usuario")
        .filter(usuario=request.usuario, estado=Membresia.Estado.ACTIVO)
        .first()
    )
    if membership is None:
        raise Http404
    return workspace, membership
