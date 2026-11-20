from functools import wraps

from django.http import Http404
from django.shortcuts import get_object_or_404


def workspace_object_or_404(model, uid, workspace):
    return get_object_or_404(model.objects.para(workspace), uid=uid)


def workspace_access_required(view_func):
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        workspace = getattr(request, "workspace", None)
        membership = getattr(request, "workspace_membership", None)
        user = getattr(request, "usuario", None)
        if (
            workspace is None
            or membership is None
            or user is None
            or not getattr(user, "activo", False)
            or getattr(membership, "estado", None) != "activo"
            or getattr(membership, "usuario_id", None) != getattr(user, "pk", None)
            or getattr(membership, "workspace_id", None) != workspace.pk
        ):
            raise Http404
        return view_func(request, *args, **kwargs)

    return wrapped
