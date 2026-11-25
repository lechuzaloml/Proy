from django.urls import path

from contacts import views as contact_views
from core import views as core_views
from funnels import event_views
from funnels import views as funnel_views
from users import views as user_views
from workspaces import views as workspace_views
from subscriptions import views as subscription_views


urlpatterns = [
    path("", funnel_views.inicio, name="inicio"),
    path(
        "cron/limpiar-temporales/",
        core_views.limpiar_temporales_cron,
        name="limpiar_temporales_cron",
    ),
    path("diagnostico/", funnel_views.diagnostico_inicial, name="diagnostico_inicial"),
    path("planes/", subscription_views.planes, name="planes"),
    path("suscripcion/", subscription_views.suscripcion, name="suscripcion"),
    path(
        "registro-evento/",
        event_views.registro_evento_general,
        name="registro_evento_general",
    ),
    path("e/<slug:slug>/", event_views.registro_evento, name="registro_evento"),
    path(
        "e/<slug:slug>/registro/",
        event_views.registrar_evento,
        name="registrar_evento",
    ),
    path(
        "e/<slug:slug>/cuestionario/",
        event_views.cuestionario_evento,
        name="cuestionario_evento",
    ),
    path(
        "e/<slug:slug>/confirmacion/<uuid:uid>/",
        event_views.confirmacion_evento,
        name="confirmacion_evento",
    ),
    path(
        "suscripcion/estado-preparacion/",
        subscription_views.estado_preparacion,
        name="estado_preparacion_suscripcion",
    ),
    path(
        "suscripcion/webhook/",
        subscription_views.webhook_stripe,
        name="webhook_stripe",
    ),
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
        "w/<uuid:workspace_uid>/mi-evento/",
        event_views.mi_evento,
        name="mi_evento",
    ),
    path(
        "w/<uuid:workspace_uid>/cuestionarios/<uuid:uid>/editar/",
        funnel_views.editar_cuestionario,
        name="editar_cuestionario",
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
        "w/<uuid:workspace_uid>/suscripcion/portal/",
        subscription_views.portal_suscripcion,
        name="portal_suscripcion",
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
        "plataforma/eventos/<uuid:popup_uid>/",
        event_views.moderar_evento,
        name="moderar_evento",
    ),
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
    path(
        "plataforma/<uuid:workspace_uid>/eliminar/",
        workspace_views.eliminar_workspace_view,
        name="eliminar_workspace",
    ),
]
