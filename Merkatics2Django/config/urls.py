from django.urls import path

from users import views as user_views
from workspaces import views as workspace_views


urlpatterns = [
    path("acceso/", user_views.acceso, name="acceso"),
    path("salir/", user_views.cerrar_sesion, name="cerrar_sesion"),
    path("workspaces/", workspace_views.selector_workspace, name="selector_workspace"),
    path(
        "w/<uuid:workspace_uid>/miembros/",
        workspace_views.miembros,
        name="miembros",
    ),
    path(
        "w/<uuid:workspace_uid>/miembros/<uuid:uid>/",
        workspace_views.miembro_detalle,
        name="miembro_detalle",
    ),
    path("plataforma/", workspace_views.consola_plataforma, name="consola_plataforma"),
    path(
        "plataforma/nueva/",
        workspace_views.crear_workspace,
        name="crear_workspace",
    ),
    path(
        "plataforma/<uuid:workspace_uid>/",
        workspace_views.editar_workspace,
        name="editar_workspace",
    ),
    path(
        "plataforma/<uuid:workspace_uid>/propietario/",
        workspace_views.asignar_propietario,
        name="asignar_propietario",
    ),
]
