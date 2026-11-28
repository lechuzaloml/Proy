import copy
import json
import math
import uuid

from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.contrib import messages
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST

from contacts.models import Contacto, Diagnostico
from contacts.services import permitir_envio
from core.workspace_access import obtener_workspace_y_membresia, usuario_requerido
from funnels.constants import TEXTO_AVISO_PRIVACIDAD, VERSION_AVISO_PRIVACIDAD
from funnels.forms import (
    EditorCuestionarioForm,
    PublicSubmissionForm,
)
from funnels.models import Cuestionario, Plantilla, Popup, VersionCuestionario
from funnels.motor import (
    ErrorRespuestas,
    calcular_perfil_secciones,
    calcular_resultado,
    validar_cuestionario,
    validar_respuestas,
)
from funnels.services import (
    ErrorPublicacion,
    LimitePublicacionAlcanzado,
    despublicar_cuestionario as despublicar_cuestionario_servicio,
    publicar_cuestionario as publicar_cuestionario_servicio,
)
from subscriptions.planes import (
    ETIQUETA_PRECIO_PRUEBA,
    VALORES_PROVISIONALES,
    limite_borradores_por_empresa,
    limite_cuestionarios_publicados,
)
from subscriptions.recomendaciones import RECOMENDACIONES, planes_recomendados
from workspaces.constants import CLEARIA_WORKSPACE_SLUG
from workspaces.models import Membresia, Workspace
from workspaces.permisos import tiene_permiso


MAX_RESPUESTA_ABIERTA = 10000


@never_cache
def inicio(request):
    popups = list(
        Popup.objects.sin_alcance()
        .filter(
            estado=Popup.Estado.PUBLICADO,
            vence_en__gt=timezone.now(),
            workspace__estado=Workspace.Estado.ACTIVA,
            cuestionario__estado=Cuestionario.Estado.PUBLICADO,
        )
        .select_related("workspace")
        .order_by("fecha_evento", "actualizado")[:9]
    )
    return render(
        request,
        "funnels/landing.html",
        {"event_popups": popups, "footer_compact": False},
    )


def biblioteca(request):
    copiable = []
    user = request.usuario
    if user is not None:
        memberships = (
            Membresia.objects.sin_alcance()
            .select_related("workspace")
            .filter(usuario=user, estado=Membresia.Estado.ACTIVO)
            .order_by("workspace__nombre")
        )
        copiable = [
            membership.workspace
            for membership in memberships
            if tiene_permiso(membership, "editar_cuestionarios")
            and membership.workspace.estado == Workspace.Estado.ACTIVA
        ]
    return render(
        request,
        "funnels/biblioteca.html",
        {
            "plantillas": Plantilla.objects.filter(
                tipo=Plantilla.Tipo.BIBLIOTECA
            ),
            "casos_referencia": Plantilla.objects.filter(
                tipo=Plantilla.Tipo.REFERENCIA
            ),
            "workspaces_copiables": copiable,
            "footer_compact": False,
        },
    )


def biblioteca_detalle(request, slug):
    plantilla = get_object_or_404(Plantilla, slug=slug)
    return render(
        request,
        "funnels/biblioteca_detalle.html",
        {
            "plantilla": plantilla,
            "es_referencia": plantilla.tipo == Plantilla.Tipo.REFERENCIA,
            "footer_compact": False,
        },
    )


@usuario_requerido
@require_POST
def copiar_plantilla(request, slug):
    plantilla = get_object_or_404(
        Plantilla, slug=slug, tipo=Plantilla.Tipo.BIBLIOTECA
    )
    try:
        workspace_uid = uuid.UUID(request.POST.get("workspace_uid", ""))
    except (TypeError, ValueError):
        raise Http404
    workspace = get_object_or_404(
        Workspace, uid=workspace_uid, estado=Workspace.Estado.ACTIVA
    )
    membership = (
        Membresia.objects.para(workspace)
        .filter(usuario=request.usuario, estado=Membresia.Estado.ACTIVO)
        .first()
    )
    if not tiene_permiso(membership, "editar_cuestionarios"):
        raise Http404

    configuration = copy.deepcopy(plantilla.configuracion)
    if not isinstance(configuration, dict):
        raise Http404
    configuration["id"] = str(uuid.uuid4())
    configuration["cliente"] = workspace.nombre
    configuration["estado"] = Cuestionario.Estado.BORRADOR
    errors = validar_cuestionario(configuration)
    if errors:
        raise Http404
    with transaction.atomic():
        questionnaire = Cuestionario.objects.para(workspace).create(
            nombre=plantilla.nombre,
            configuracion=configuration,
            version_actual=1,
            creado_por=request.usuario,
        )
        VersionCuestionario.objects.para(workspace).create(
            cuestionario=questionnaire,
            numero=1,
            configuracion=configuration,
            publicada=False,
        )
    messages.success(request, "Plantilla copiada como borrador.")
    return redirect("mis_cuestionarios", workspace_uid=workspace.uid)


def _configuracion_vacia_desde_cero():
    return {
        "id": str(uuid.uuid4()),
        "cliente": "",
        "estado": Cuestionario.Estado.BORRADOR,
        "usa_scoring": False,
        "posicion_contacto": "final",
        "secciones": [],
        "bienvenida": {
            "habilitada": True,
            "titulo": "",
            "descripcion": "",
            "imagen": "",
            "tiempoEstimado": "",
            "textoBoton": "",
        },
        "preguntas": [],
        "resultado": {"tipo": "fijo", "contenido": ""},
    }


def _contexto_editor_cuestionario(
    workspace,
    membership,
    questionnaire,
    configuration,
    form,
    *,
    is_new=False,
    editor_errors=None,
):
    return {
        "workspace": workspace,
        "membresia": membership,
        "nav_active": "cuestionarios",
        "puede_ver_resumen": True,
        "cuestionario": questionnaire,
        "configuration_json": json.dumps(configuration, ensure_ascii=False),
        "editor_errors": editor_errors or [],
        "form": form,
        "publicado": False,
        "is_new": is_new,
        "footer_compact": False,
    }


@usuario_requerido
def crear_cuestionario(request, workspace_uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    if not tiene_permiso(membership, "editar_cuestionarios"):
        raise Http404

    limit = limite_borradores_por_empresa(workspace.plan)
    draft_count = Cuestionario.objects.para(workspace).filter(
        estado=Cuestionario.Estado.BORRADOR
    ).count()
    limit_reached = limit is not None and draft_count >= limit
    if limit_reached and (
        request.method != "POST" or request.POST.get("intent") == "preview"
    ):
        error = (
            f"Alcanzaste el límite provisional de {limit} borradores por empresa."
        )
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"errors": [error]}, status=400)
        messages.error(request, error)
        return redirect("mis_cuestionarios", workspace_uid=workspace.uid)

    configuration = _configuracion_vacia_desde_cero()
    if request.method == "POST":
        form = EditorCuestionarioForm(request.POST)
        if form.is_valid():
            configuration = form.cleaned_data["configuracion"]
            configuration["cliente"] = form.cleaned_data["nombre"]
            configuration["estado"] = Cuestionario.Estado.BORRADOR
            errors = validar_cuestionario(configuration)
            if not configuration.get("preguntas"):
                errors.append(
                    "Agrega al menos una pregunta para guardar el borrador."
                )
            if errors:
                context = _contexto_editor_cuestionario(
                    workspace,
                    membership,
                    None,
                    configuration,
                    form,
                    is_new=True,
                    editor_errors=errors,
                )
                if request.headers.get("X-Requested-With") == "XMLHttpRequest":
                    return JsonResponse({"errors": errors}, status=400)
                return render(
                    request,
                    "funnels/editor_cuestionario.html",
                    context,
                    status=400,
                )

            if request.POST.get("intent") == "preview":
                preview_form = PublicSubmissionForm(
                    initial={
                        "attempt_id": uuid.uuid4(),
                        "respuestas": "{}",
                    },
                    require_consent=False,
                )
                context = _build_flow_context(
                    configuration,
                    form.cleaned_data["nombre"],
                    workspace.nombre,
                    configuration.get("posicion_contacto", "final"),
                    True,
                    preview_form,
                    {},
                )
                context["initial_diagnostic"] = False
                return render(
                    request,
                    "funnels/cuestionario_publico.html",
                    context,
                )

            created = False
            with transaction.atomic():
                Workspace.objects.select_for_update().get(pk=workspace.pk)
                questionnaire = (
                    Cuestionario.objects.para(workspace)
                    .select_for_update()
                    .filter(
                        configuracion__id=configuration["id"],
                        creado_por=request.usuario,
                    )
                    .first()
                )
                if questionnaire is not None:
                    if questionnaire.estado != Cuestionario.Estado.BORRADOR:
                        error = (
                            "Esta operación ya está asociada a un cuestionario "
                            "que no puede reutilizarse como borrador."
                        )
                        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
                            return JsonResponse({"errors": [error]}, status=409)
                        messages.error(request, error)
                        return redirect(
                            "mis_cuestionarios", workspace_uid=workspace.uid
                        )
                    questionnaire.nombre = form.cleaned_data["nombre"]
                    questionnaire.configuracion = configuration
                    questionnaire.save(
                        update_fields=["nombre", "configuracion", "actualizado"]
                    )
                else:
                    current_count = Cuestionario.objects.para(workspace).filter(
                        estado=Cuestionario.Estado.BORRADOR
                    ).count()
                    if limit is not None and current_count >= limit:
                        error = f"Alcanzaste el límite provisional de {limit} borradores por empresa."
                        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
                            return JsonResponse({"errors": [error]}, status=400)
                        messages.error(request, error)
                        return redirect(
                            "mis_cuestionarios", workspace_uid=workspace.uid
                        )
                    questionnaire = Cuestionario.objects.para(workspace).create(
                        nombre=form.cleaned_data["nombre"],
                        configuracion=configuration,
                        version_actual=1,
                        creado_por=request.usuario,
                    )
                    VersionCuestionario.objects.para(workspace).create(
                        cuestionario=questionnaire,
                        numero=1,
                        configuracion=configuration,
                        publicada=False,
                    )
                    created = True
            edit_url = reverse(
                "editar_cuestionario",
                kwargs={"workspace_uid": workspace.uid, "uid": questionnaire.uid},
            )
            if request.headers.get("X-Requested-With") == "XMLHttpRequest":
                return JsonResponse(
                    {"redirect": edit_url},
                    status=201 if created else 200,
                )
            messages.success(
                request,
                "Cuestionario creado como borrador."
                if created
                else "Borrador actualizado correctamente.",
            )
            return redirect(edit_url)
        posted_configuration = form.cleaned_data.get("configuracion")
        if isinstance(posted_configuration, dict):
            configuration = posted_configuration
            configuration["cliente"] = (
                form.cleaned_data.get("nombre")
                or configuration.get("cliente", "")
            )
            configuration["estado"] = Cuestionario.Estado.BORRADOR
        errors = [
            str(error)
            for field_errors in form.errors.values()
            for error in field_errors
        ]
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"errors": errors}, status=400)
        return render(
            request,
            "funnels/editor_cuestionario.html",
            _contexto_editor_cuestionario(
                workspace,
                membership,
                None,
                configuration,
                form,
                is_new=True,
                editor_errors=errors,
            ),
            status=400,
        )

    form = EditorCuestionarioForm(initial={"nombre": ""})
    return render(
        request,
        "funnels/editor_cuestionario.html",
        _contexto_editor_cuestionario(
            workspace,
            membership,
            None,
            configuration,
            form,
            is_new=True,
        ),
    )


def demostrar_plantilla(request, slug):
    plantilla = get_object_or_404(Plantilla, slug=slug)
    return _questionnaire_flow(
        request,
        plantilla.configuracion,
        title=plantilla.nombre,
        workspace=None,
        questionnaire=None,
        version=1,
        demonstration=True,
        contact_position=plantilla.configuracion.get("posicion_contacto", "final"),
        client=plantilla.nombre,
        source=f"demo-{plantilla.slug}",
    )


def diagnostico_inicial(request):
    workspace = get_object_or_404(
        Workspace, slug=CLEARIA_WORKSPACE_SLUG, estado=Workspace.Estado.ACTIVA
    )
    questionnaire = (
        Cuestionario.objects.para(workspace)
        .filter(estado=Cuestionario.Estado.PUBLICADO)
        .order_by("creado")
        .first()
    )
    if questionnaire is None:
        raise Http404
    version = _published_version(questionnaire, workspace)
    return _questionnaire_flow(
        request,
        version.configuracion,
        title=questionnaire.nombre,
        workspace=workspace,
        questionnaire=questionnaire,
        version=version.numero,
        demonstration=False,
        contact_position="inicio",
        client=workspace.nombre,
        source="diagnostico-inicial",
    )


def _render_recomendacion_diagnostico(request, result, segment):
    recommendation = RECOMENDACIONES.get(segment)
    if recommendation is None:
        raise Http404
    template = Plantilla.objects.filter(
        slug=recommendation["template_slug"],
        tipo=Plantilla.Tipo.BIBLIOTECA,
    ).first()
    if template is None:
        raise Http404
    plan = next(
        (
            candidate
            for candidate in planes_recomendados()
            if candidate["id"] == recommendation["plan_id"]
        ),
        None,
    )
    if plan is None:
        raise Http404
    return render(
        request,
        "funnels/recomendacion.html",
        {
            "plantilla": template,
            "contenido": result.get("contenido", ""),
            "plan_recomendado": plan,
            "footer_compact": False,
        },
    )


def cuestionario_publico(request, slug, uid):
    workspace = get_object_or_404(
        Workspace, slug=slug, estado=Workspace.Estado.ACTIVA
    )
    questionnaire = get_object_or_404(
        Cuestionario.objects.para(workspace),
        uid=uid,
        estado=Cuestionario.Estado.PUBLICADO,
    )
    version = _published_version(questionnaire, workspace)
    return _questionnaire_flow(
        request,
        version.configuracion,
        title=questionnaire.nombre,
        workspace=workspace,
        questionnaire=questionnaire,
        version=version.numero,
        demonstration=False,
        contact_position=version.configuracion.get("posicion_contacto", "final"),
        client=workspace.nombre,
        source=f"cuestionario-{questionnaire.uid}",
    )


def _published_version(questionnaire, workspace):
    return get_object_or_404(
        VersionCuestionario.objects.para(workspace),
        cuestionario=questionnaire,
        numero=questionnaire.version_actual,
        publicada=True,
    )


@usuario_requerido
@never_cache
def mis_cuestionarios(request, workspace_uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    can_edit = tiene_permiso(membership, "editar_cuestionarios")
    can_publish = tiene_permiso(membership, "publicar_cuestionarios")
    if not can_edit and not can_publish:
        raise Http404
    rows = _questionnaire_list_rows(request, workspace, membership, can_edit)
    published_count = Cuestionario.objects.para(workspace).filter(
        estado=Cuestionario.Estado.PUBLICADO
    ).count()
    limit = limite_cuestionarios_publicados(workspace.plan)
    limit_reached = limit is not None and published_count >= limit
    draft_limit = limite_borradores_por_empresa(workspace.plan)
    draft_count = Cuestionario.objects.para(workspace).filter(
        estado=Cuestionario.Estado.BORRADOR
    ).count()
    return render(
        request,
        "funnels/mis_cuestionarios.html",
        {
            "workspace": workspace,
            "membresia": membership,
            "nav_active": "cuestionarios",
            "puede_ver_resumen": True,
            "rows": rows,
            "puede_publicar": can_publish,
            "puede_ver_leads": tiene_permiso(membership, "ver_leads"),
            "puede_ver_cuestionarios": True,
            "puede_editar_cuestionarios": can_edit,
            "cuestionarios_publicados": published_count,
            "limite_publicados": limit if limit is not None else "sin límite",
            "limite_alcanzado": limit_reached,
            "mostrar_modal_limite": False,
            "borradores": draft_count,
            "limite_borradores": draft_limit if draft_limit is not None else "sin límite",
            "limite_borradores_alcanzado": draft_limit is not None and draft_count >= draft_limit,
            "puede_publicar_ahora": (
                can_publish
                and not limit_reached
                and workspace.estado == Workspace.Estado.ACTIVA
            ),
            "empresa_suspendida": workspace.estado == Workspace.Estado.SUSPENDIDA,
            "limites_provisionales": VALORES_PROVISIONALES,
            "precio_prueba": ETIQUETA_PRECIO_PRUEBA,
            "puede_administrar_miembros": membership.rol
            in {Membresia.Rol.PROPIETARIO, Membresia.Rol.ADMIN},
            "footer_compact": False,
        },
    )


@usuario_requerido
def editar_cuestionario(request, workspace_uid, uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    if not tiene_permiso(membership, "editar_cuestionarios"):
        raise Http404
    questionnaire = get_object_or_404(
        Cuestionario.objects.para(workspace),
        uid=uid,
    )
    can_edit_any = membership.rol in {
        Membresia.Rol.PROPIETARIO,
        Membresia.Rol.ADMIN,
    }
    if not can_edit_any and questionnaire.creado_por_id != request.usuario.pk:
        raise Http404

    if questionnaire.estado == Cuestionario.Estado.PUBLICADO:
        if request.method != "GET":
            raise Http404
        return render(
            request,
            "funnels/editor_cuestionario.html",
            {
                "workspace": workspace,
                "membresia": membership,
                "nav_active": "cuestionarios",
                "puede_ver_resumen": True,
                "cuestionario": questionnaire,
                "publicado": True,
                "puede_despublicar": tiene_permiso(
                    membership, "publicar_cuestionarios"
                ),
                "creado_por": (
                    questionnaire.creado_por.nombre
                    or questionnaire.creado_por.correo
                    if questionnaire.creado_por_id
                    else ""
                ),
            },
        )
    if questionnaire.estado != Cuestionario.Estado.BORRADOR:
        raise Http404

    configuration = copy.deepcopy(questionnaire.configuracion)
    editor_errors = []
    if request.method == "POST":
        form = EditorCuestionarioForm(request.POST)
        if form.is_valid():
            edited_configuration = form.cleaned_data["configuracion"]
            original_id = (
                configuration.get("id")
                if isinstance(configuration, dict)
                else str(questionnaire.uid)
            )
            edited_configuration["id"] = original_id or str(questionnaire.uid)
            edited_configuration["cliente"] = form.cleaned_data["nombre"]
            edited_configuration["estado"] = Cuestionario.Estado.BORRADOR
            editor_errors = validar_cuestionario(edited_configuration)
            if not edited_configuration.get("preguntas"):
                editor_errors.append(
                    "Agrega al menos una pregunta para guardar el borrador."
                )
            if editor_errors:
                configuration = edited_configuration
            elif request.POST.get("intent") == "preview":
                preview_form = PublicSubmissionForm(
                    initial={
                        "attempt_id": uuid.uuid4(),
                        "respuestas": "{}",
                    },
                    require_consent=False,
                )
                context = _build_flow_context(
                    edited_configuration,
                    form.cleaned_data["nombre"],
                    workspace.nombre,
                    edited_configuration.get("posicion_contacto", "final"),
                    True,
                    preview_form,
                    {},
                )
                context["initial_diagnostic"] = False
                return render(
                    request,
                    "funnels/cuestionario_publico.html",
                    context,
                )
            else:
                questionnaire.nombre = form.cleaned_data["nombre"]
                questionnaire.configuracion = edited_configuration
                questionnaire.save(
                    update_fields=["nombre", "configuracion", "actualizado"]
                )
                messages.success(request, "Cuestionario guardado correctamente.")
                return redirect(
                    "mis_cuestionarios",
                    workspace_uid=workspace.uid,
                )
        else:
            for field_errors in form.errors.values():
                editor_errors.extend(str(error) for error in field_errors)
            posted_configuration = form.cleaned_data.get("configuracion")
            if isinstance(posted_configuration, dict):
                configuration = posted_configuration
    else:
        form = EditorCuestionarioForm(
            initial={
                "nombre": questionnaire.nombre,
                "configuracion": json.dumps(
                    configuration,
                    ensure_ascii=False,
                ),
            }
        )

    return render(
        request,
        "funnels/editor_cuestionario.html",
        {
            "workspace": workspace,
            "membresia": membership,
            "nav_active": "cuestionarios",
            "puede_ver_resumen": True,
            "cuestionario": questionnaire,
            "configuration_json": json.dumps(
                configuration,
                ensure_ascii=False,
            ),
            "editor_errors": editor_errors,
            "form": form,
            "publicado": False,
            "footer_compact": False,
        },
        status=400 if editor_errors or form.errors else 200,
    )


@usuario_requerido
@require_POST
def publicar_cuestionario(request, workspace_uid, uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    if not tiene_permiso(membership, "publicar_cuestionarios"):
        raise Http404
    questionnaire = get_object_or_404(
        Cuestionario.objects.para(workspace),
        uid=uid,
        estado=Cuestionario.Estado.BORRADOR,
    )
    try:
        publicar_cuestionario_servicio(workspace, uid)
    except ErrorPublicacion as error:
        return _render_questionnaire_list_with_errors(
            request,
            workspace,
            membership,
            [str(error)],
            mostrar_modal_limite=isinstance(
                error, LimitePublicacionAlcanzado
            ),
        )
    messages.success(request, "Cuestionario publicado.")
    return redirect("mis_cuestionarios", workspace_uid=workspace.uid)


@usuario_requerido
@require_POST
def despublicar_cuestionario(request, workspace_uid, uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    if not tiene_permiso(membership, "publicar_cuestionarios"):
        raise Http404
    get_object_or_404(
        Cuestionario.objects.para(workspace),
        uid=uid,
        estado=Cuestionario.Estado.PUBLICADO,
    )
    try:
        despublicar_cuestionario_servicio(workspace, uid)
    except ErrorPublicacion as error:
        return _render_questionnaire_list_with_errors(
            request, workspace, membership, [str(error)]
        )
    messages.success(request, "Cuestionario despublicado.")
    return redirect("mis_cuestionarios", workspace_uid=workspace.uid)


@usuario_requerido
@require_POST
def duplicar_cuestionario(request, workspace_uid, uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    if not tiene_permiso(membership, "editar_cuestionarios"):
        raise Http404
    questionnaire = get_object_or_404(
        Cuestionario.objects.para(workspace),
        uid=uid,
    )
    can_edit_any = membership.rol in {
        Membresia.Rol.PROPIETARIO,
        Membresia.Rol.ADMIN,
    }
    if not can_edit_any and questionnaire.creado_por_id != request.usuario.pk:
        raise Http404
    if questionnaire.estado == Cuestionario.Estado.PUBLICADO:
        if not tiene_permiso(membership, "publicar_cuestionarios"):
            raise Http404

    limit = limite_borradores_por_empresa(workspace.plan)
    draft_count = Cuestionario.objects.para(workspace).filter(
        estado=Cuestionario.Estado.BORRADOR
    ).count()
    if limit is not None and draft_count >= limit:
        return _render_questionnaire_list_with_errors(
            request,
            workspace,
            membership,
            [f"Alcanzaste el límite provisional de {limit} borradores por empresa."],
        )

    configuration = copy.deepcopy(questionnaire.configuracion)
    configuration["id"] = str(uuid.uuid4())
    configuration["estado"] = Cuestionario.Estado.BORRADOR
    if validar_cuestionario(configuration):
        raise Http404
    with transaction.atomic():
        duplicate = Cuestionario.objects.para(workspace).create(
            nombre=f"{questionnaire.nombre} (copia)",
            configuracion=configuration,
            version_actual=1,
            creado_por=request.usuario,
        )
        VersionCuestionario.objects.para(workspace).create(
            cuestionario=duplicate,
            numero=1,
            configuracion=configuration,
            publicada=False,
        )
    messages.success(request, "Cuestionario duplicado como borrador.")
    return redirect("editar_cuestionario", workspace_uid=workspace.uid, uid=duplicate.uid)


@usuario_requerido
@require_POST
def eliminar_cuestionario(request, workspace_uid, uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    can_edit = tiene_permiso(membership, "editar_cuestionarios")
    if not can_edit:
        raise Http404

    try:
        with transaction.atomic():
            questionnaire = get_object_or_404(
                Cuestionario.objects.para(workspace).select_for_update(),
                uid=uid,
                estado=Cuestionario.Estado.BORRADOR,
            )
            if Diagnostico.objects.para(workspace).filter(
                cuestionario=questionnaire
            ).exists():
                return _render_questionnaire_list_with_errors(
                    request,
                    workspace,
                    membership,
                    [
                        "No se puede eliminar porque tiene diagnósticos asociados. "
                        "Se conserva para mantener el historial de contactos."
                    ],
                )
            questionnaire.delete()
    except ProtectedError:
        return _render_questionnaire_list_with_errors(
            request,
            workspace,
            membership,
            [
                "No se puede eliminar porque tiene datos asociados que deben "
                "conservarse."
            ],
        )
    messages.success(request, "Cuestionario eliminado.")
    return redirect("mis_cuestionarios", workspace_uid=workspace.uid)


def _questionnaire_list_rows(request, workspace, membership, can_edit):
    questionnaires = list(Cuestionario.objects.para(workspace))
    questionnaire_ids = [questionnaire.pk for questionnaire in questionnaires]
    diagnosis_ids = set(
        Diagnostico.objects.para(workspace)
        .filter(cuestionario_id__in=questionnaire_ids)
        .values_list("cuestionario_id", flat=True)
        .distinct()
    )
    rows = []
    for questionnaire in questionnaires:
        can_edit_questionnaire = can_edit and (
            membership.rol
            in {Membresia.Rol.PROPIETARIO, Membresia.Rol.ADMIN}
            or questionnaire.creado_por_id == request.usuario.pk
        )
        has_diagnoses = questionnaire.pk in diagnosis_ids
        public_url = ""
        if questionnaire.estado == Cuestionario.Estado.PUBLICADO:
            public_url = request.build_absolute_uri(
                reverse(
                    "cuestionario_publico",
                    args=[workspace.slug, questionnaire.uid],
                )
            )
        rows.append(
            {
                "questionnaire": questionnaire,
                "public_url": public_url,
                "tiene_diagnosticos": has_diagnoses,
                "puede_editar": can_edit_questionnaire,
                "puede_eliminar": (
                    can_edit
                    and questionnaire.estado == Cuestionario.Estado.BORRADOR
                    and not has_diagnoses
                ),
            }
        )
    return rows


def _render_questionnaire_list_with_errors(
    request,
    workspace,
    membership,
    errors,
    *,
    mostrar_modal_limite=False,
):
    can_edit = tiene_permiso(membership, "editar_cuestionarios")
    can_publish = tiene_permiso(membership, "publicar_cuestionarios")
    rows = _questionnaire_list_rows(
        request, workspace, membership, can_edit
    )
    published_count = Cuestionario.objects.para(workspace).filter(
        estado=Cuestionario.Estado.PUBLICADO
    ).count()
    limit = limite_cuestionarios_publicados(workspace.plan)
    limit_reached = limit is not None and published_count >= limit
    return render(
        request,
        "funnels/mis_cuestionarios.html",
        {
            "workspace": workspace,
            "membresia": membership,
            "nav_active": "cuestionarios",
            "puede_ver_resumen": True,
            "rows": rows,
            "puede_publicar": can_publish,
            "puede_ver_leads": tiene_permiso(membership, "ver_leads"),
            "puede_ver_cuestionarios": True,
            "puede_editar_cuestionarios": can_edit,
            "cuestionarios_publicados": published_count,
            "limite_publicados": limit if limit is not None else "sin límite",
            "limite_alcanzado": limit_reached,
            "mostrar_modal_limite": mostrar_modal_limite,
            "puede_publicar_ahora": (
                can_publish
                and not limit_reached
                and workspace.estado == Workspace.Estado.ACTIVA
            ),
            "empresa_suspendida": workspace.estado == Workspace.Estado.SUSPENDIDA,
            "limites_provisionales": VALORES_PROVISIONALES,
            "precio_prueba": ETIQUETA_PRECIO_PRUEBA,
            "puede_administrar_miembros": membership.rol
            in {Membresia.Rol.PROPIETARIO, Membresia.Rol.ADMIN},
            "footer_compact": False,
            "errors": errors,
        },
        status=400,
    )


def _questionnaire_flow(
    request,
    configuration,
    *,
    title,
    workspace,
    questionnaire,
    version,
    demonstration,
    contact_position,
    client,
    source,
):
    validation_errors = validar_cuestionario(configuration)
    if validation_errors:
        raise Http404
    attempt_id = uuid.uuid4()
    form = PublicSubmissionForm(
        data=request.POST if request.method == "POST" else None,
        initial={"attempt_id": attempt_id, "respuestas": "{}"},
        require_consent=not demonstration,
    )
    context = _build_flow_context(
        configuration,
        title,
        client,
        contact_position,
        demonstration,
        form,
        {},
    )
    context["initial_diagnostic"] = source == "diagnostico-inicial"
    if context["initial_diagnostic"]:
        context["bienvenida"]["descripcion"] = (
            context["bienvenida"]["descripcion"]
            or "Te haremos unas preguntas para entender mejor tu situación actual."
        )
        if not (configuration.get("bienvenida") or {}).get("textoBoton"):
            context["bienvenida"]["texto_boton"] = "Iniciar diagnóstico"
    if request.method == "GET":
        return render(request, "funnels/cuestionario_publico.html", context)
    if not form.is_valid():
        context = _build_flow_context(
            configuration,
            title,
            client,
            contact_position,
            demonstration,
            form,
            _read_posted_answers(request)["posted_answers"],
        )
        context["error_envio"] = "Revisa los datos de contacto y las respuestas."
        return render(request, "funnels/cuestionario_publico.html", context, status=400)

    try:
        _validar_longitudes_respuestas(
            configuration, form.cleaned_data["respuestas"]
        )
        normalized = validar_respuestas(configuration, form.cleaned_data["respuestas"])
        calculation = calcular_resultado(configuration, normalized)
        profile = calcular_perfil_secciones(configuration, normalized)
    except ErrorRespuestas as error:
        context = _build_flow_context(
            configuration,
            title,
            client,
            contact_position,
            demonstration,
            form,
            _read_posted_answers(request)["posted_answers"],
        )
        context["error_envio"] = str(error)
        return render(request, "funnels/cuestionario_publico.html", context, status=400)

    result = calculation["resultado"]
    if demonstration:
        return _render_result(
            request,
            title,
            configuration,
            result,
            profile,
            demonstration=True,
        )

    attempt = form.cleaned_data["attempt_id"]
    contact = (
        Contacto.objects.para(workspace)
        .filter(attempt_id=attempt)
        .first()
    )
    if contact is not None:
        diagnosis = (
            Diagnostico.objects.para(workspace)
            .filter(contacto=contact, cuestionario=questionnaire)
            .first()
        )
        if diagnosis is not None:
            if source == "diagnostico-inicial":
                return _render_recomendacion_diagnostico(
                    request, diagnosis.resultado, diagnosis.segmento
                )
            return _render_result(
                request,
                title,
                configuration,
                diagnosis.resultado,
                calcular_perfil_secciones(configuration, diagnosis.respuestas),
                demonstration=False,
            )

    if not permitir_envio(request.META.get("REMOTE_ADDR")):
        return HttpResponse(
            "Se alcanzó el límite temporal de envíos. Intenta de nuevo más tarde.",
            status=429,
            content_type="text/plain; charset=utf-8",
        )

    now = timezone.now()
    try:
        with transaction.atomic():
            contact = Contacto.objects.para(workspace).create(
                attempt_id=attempt,
                nombre=form.cleaned_data["nombre"],
                correo=form.cleaned_data["correo"],
                telefono=form.cleaned_data["telefono"],
                consentimiento_version=VERSION_AVISO_PRIVACIDAD,
                consentimiento_fecha=now,
                origen=source[:80],
                ultima_actividad=now,
            )
            Diagnostico.objects.para(workspace).create(
                contacto=contact,
                cuestionario=questionnaire,
                version=version,
                respuestas=normalized,
                puntaje_total=calculation["puntaje_total"],
                puntaje_maximo=calculation["puntaje_maximo"],
                porcentaje=calculation["porcentaje"],
                segmento=calculation["segmento"],
                puntaje_por_dimension={
                    dimension["nombre"]: dimension["porcentaje"]
                    for dimension in profile
                },
                resultado=result,
            )
    except IntegrityError:
        contact = (
            Contacto.objects.para(workspace)
            .filter(attempt_id=attempt)
            .first()
        )
        if contact is None:
            raise
        diagnosis = (
            Diagnostico.objects.para(workspace)
            .filter(contacto=contact, cuestionario=questionnaire)
            .first()
        )
        if diagnosis is None:
            raise
        if source == "diagnostico-inicial":
            return _render_recomendacion_diagnostico(
                request, diagnosis.resultado, diagnosis.segmento
            )
        return _render_result(
            request,
            title,
            configuration,
            diagnosis.resultado,
            calcular_perfil_secciones(configuration, diagnosis.respuestas),
            demonstration=False,
        )
    if source == "diagnostico-inicial":
        return _render_recomendacion_diagnostico(request, result, calculation["segmento"])
    return _render_result(
        request,
        title,
        configuration,
        result,
        profile,
        demonstration=False,
    )


def _build_flow_context(
    configuration,
    title,
    client,
    contact_position,
    demonstration,
    form,
    posted_answers,
):
    welcome = configuration.get("bienvenida") or {}
    questions = configuration["preguntas"]
    visual_style = configuration.get("estilo_visual", "")
    rows = []
    for index, question in enumerate(questions):
        response = posted_answers.get(str(index), {}) if isinstance(posted_answers, dict) else {}
        row = {
            "index": index,
            "question": question,
            "seccion": question.get("seccion", ""),
            "options": [],
            "answer_value": "",
            "touched": False,
        }
        if question["tipo"] == "opcion_multiple":
            selected = response.get("indiceOpcion")
            row["options"] = [
                {
                    "index": option_index,
                    "text": option["texto"],
                    "selected": str(selected) == str(option_index),
                }
                for option_index, option in enumerate(question["opciones"])
            ]
        elif question["tipo"] == "escala":
            scale = question["escala"]
            minimum = scale["min"]
            maximum = scale["max"]
            scale_is_visual = (
                isinstance(minimum, int)
                and not isinstance(minimum, bool)
                and isinstance(maximum, int)
                and not isinstance(maximum, bool)
                and maximum - minimum <= 9
                and visual_style
                in {
                    "finanzas",
                    "ciberseguridad",
                    "liderazgo",
                    "madurez-digital",
                    "masterclass",
                }
            )
            row.update(
                {
                    "minimum": minimum,
                    "maximum": maximum,
                    "minimum_label": scale.get("etiqueta_min", ""),
                    "maximum_label": scale.get("etiqueta_max", ""),
                    "has_minimum_label": "etiqueta_min" in scale,
                    "has_maximum_label": "etiqueta_max" in scale,
                    "answer_value": response.get("valor", minimum),
                    "touched": "valor" in response,
                    "scale_is_visual": scale_is_visual,
                    "scale_values": (
                        range(minimum, maximum + 1) if scale_is_visual else ()
                    ),
                }
            )
        else:
            row["answer_value"] = response.get("valor", "")
            row["max_open_length"] = question.get(
                "limite_caracteres", MAX_RESPUESTA_ABIERTA
            )
        rows.append(row)

    default_title = welcome.get("titulo")
    if not default_title:
        default_title = (
            (configuration.get("cliente") or title) if demonstration else title
        )
    default_description = welcome.get("descripcion") or configuration.get(
        "descripcion", ""
    )
    return {
        "configuracion": configuration,
        "titulo": title,
        "cliente": client,
        "bienvenida": {
            "titulo": default_title,
            "descripcion": default_description,
            "texto_boton": welcome.get("textoBoton") or "Comenzar",
        },
        "question_rows": rows,
        "contact_position": contact_position,
        "usa_scoring": configuration["usa_scoring"],
        "minutos_estimados": max(1, math.ceil((len(questions) * 20) / 60)),
        "demonstration": demonstration,
        "show_intro": welcome.get("habilitada", True),
        "form": form,
        "texto_aviso_privacidad": TEXTO_AVISO_PRIVACIDAD,
        "posted_answers": posted_answers,
        "footer_compact": True,
    }


def _read_posted_answers(request):
    try:
        answers = json.loads(request.POST.get("respuestas", "{}"))
    except (TypeError, ValueError):
        answers = {}
    return {"posted_answers": answers if isinstance(answers, dict) else {}}


def _validar_longitudes_respuestas(configuration, responses):
    for index, question in enumerate(configuration["preguntas"]):
        if question["tipo"] != "abierta":
            continue
        response = responses.get(str(index), responses.get(index))
        value = response.get("valor") if isinstance(response, dict) else None
        maximum = question.get("limite_caracteres", MAX_RESPUESTA_ABIERTA)
        if isinstance(value, str) and len(value) > maximum:
            raise ErrorRespuestas(
                f"La respuesta de la pregunta {index + 1} supera el límite."
            )


def _render_result(
    request,
    title,
    configuration,
    result,
    profile,
    *,
    demonstration,
):
    dimensions = []
    center = 160
    radius = 112
    count = len(profile)
    for index, dimension in enumerate(profile):
        angle = -math.pi / 2 + (index * 2 * math.pi) / count if count else 0
        axis_x = center + math.cos(angle) * radius
        axis_y = center + math.sin(angle) * radius
        distance = dimension["porcentaje"] / 100 * radius
        dimensions.append(
            {
                **dimension,
                "axis_x": round(axis_x, 2),
                "axis_y": round(axis_y, 2),
                "point_x": round(center + math.cos(angle) * distance, 2),
                "point_y": round(center + math.sin(angle) * distance, 2),
            }
        )
    polygon = " ".join(
        f"{dimension['point_x']},{dimension['point_y']}"
        for dimension in dimensions
    ) if len(dimensions) >= 3 else ""
    return render(
        request,
        "funnels/resultado.html",
        {
            "titulo": title,
            "resultado": result,
            "perfil": dimensions,
            "polygon_points": polygon,
            "chart_rings": [28, 56, 84, 112],
            "usa_scoring": configuration["usa_scoring"],
            "demonstration": demonstration,
            "footer_compact": True,
        },
    )


