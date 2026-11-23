from django.urls import path

from contacts import views as contact_views
from funnels import views as funnel_views
from users import views as user_views
from workspaces import views as workspace_views


urlpatterns = [
    path("", funnel_views.inicio, name="inicio"),
    path("diagnostico/", funnel_views.diagnostico_inicial, name="diagnostico_inicial"),
    path("biblioteca/", funnel_views.biblioteca, name="biblioteca"),
    path(
        "biblioteca/<slug:slug>/",
        funnel_views.biblioteca_detalle,
        name="biblioteca_detalle",
    ),
    path(
        "biblioteca/<slug:slug>/probar/",
        funnel_views.demostrar_plantilla,
        name="demostrar_plantilla",
    ),
    path(
        "biblioteca/<slug:slug>/copiar/",
        funnel_views.copiar_plantilla,
        name="copiar_plantilla",
    ),
    path(
        "c/<slug:slug>/<uuid:uid>/",
        funnel_views.cuestionario_publico,
        name="cuestionario_publico",
    ),
    path(
        "w/<uuid:workspace_uid>/cuestionarios/",
        funnel_views.mis_cuestionarios,
        name="mis_cuestionarios",
    ),
    path(
        "w/<uuid:workspace_uid>/cuestionarios/<uuid:uid>/publicar/",
        funnel_views.publicar_cuestionario,
        name="publicar_cuestionario",
    ),
    path(
        "w/<uuid:workspace_uid>/cuestionarios/<uuid:uid>/despublicar/",
        funnel_views.despublicar_cuestionario,
        name="despublicar_cuestionario",
    ),
    path(
        "w/<uuid:workspace_uid>/cuestionarios/<uuid:uid>/eliminar/",
        funnel_views.eliminar_cuestionario,
        name="eliminar_cuestionario",
    ),
    path(
        "w/<uuid:workspace_uid>/contactos/",
        contact_views.contactos,
        name="contactos",
    ),
    path(
        "w/<uuid:workspace_uid>/contact/<uuid:uid>/",
        contact_views.contacto_detalle,
        name="contacto_detalle",
    ),
    path("acceso/", user_views.acceso, name="acceso"),
    path("salir/", user_views.cerrar_sesion, name="cerrar_sesion"),
    path("workspaces/", workspace_views.selector_workspace, name="selector_workspace"),
    path(
        "w/<uuid:workspace_uid>/",
        workspace_views.resumen_workspace,
        name="resumen_workspace",
    ),
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
