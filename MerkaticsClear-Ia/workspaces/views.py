import math
from datetime import timedelta
from functools import wraps
from urllib.parse import quote

from django.contrib import messages
from django.core.paginator import Paginator
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import Http404, HttpResponseNotAllowed
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

from contacts.models import Contacto, Diagnostico, Seguimiento
from contacts.presentation import etiqueta_origen
from funnels.models import Cuestionario, Popup, VersionCuestionario
from subscriptions.models import SuscripcionWorkspace
from users.models import AdminPlataforma, Usuario
from workspaces.forms import (
    AltaMembresiaForm,
    CrearWorkspaceForm,
    EditarWorkspaceForm,
    EdicionMembresiaForm,
)
from workspaces.constants import CLEARIA_WORKSPACE_SLUG, PROTECTED_WORKSPACE_SLUGS
from workspaces.models import Membresia, Workspace
from workspaces.services import WorkspaceDeletionError, eliminar_workspace
from workspaces.permisos import (
    puede_agregar_miembro,
    puede_cambiar_estado_miembro,
    puede_editar_miembro,
    puede_quitar_miembro,
)
from workspaces.permisos import tiene_permiso


PERMISOS_FORM = (
    "ver_leads",
    "gestionar_leads",
    "editar_cuestionarios",
    "publicar_cuestionarios",
)


def usuario_requerido(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if request.usuario is None:
            login_url = reverse("acceso")
            return redirect(f"{login_url}?next={quote(request.get_full_path())}")
        return view(request, *args, **kwargs)

    return wrapped


def plataforma_requerida(view):
    @wraps(view)
    @usuario_requerido
    def wrapped(request, *args, **kwargs):
        if not AdminPlataforma.objects.filter(usuario=request.usuario).exists():
            raise Http404
        return view(request, *args, **kwargs)

    return wrapped


def _workspace_y_membresia(request, workspace_uid):
    workspace = get_object_or_404(Workspace, uid=workspace_uid)
    membresia = get_object_or_404(
        Membresia.objects.para(workspace),
        usuario=request.usuario,
        estado=Membresia.Estado.ACTIVO,
    )
    return workspace, membresia


@usuario_requerido
@never_cache
def selector_workspace(request):
    membresias = (
        Membresia.objects.sin_alcance()
        .filter(usuario=request.usuario, estado=Membresia.Estado.ACTIVO)
        .select_related("workspace")
        .order_by("workspace__nombre")
    )
    return render(
        request,
        "workspaces/selector.html",
        {
            "membresias": membresias,
            "es_plataforma": AdminPlataforma.objects.filter(
                usuario=request.usuario
            ).exists(),
            "nav_active": "espacios",
        },
    )


@usuario_requerido
@never_cache
def resumen_workspace(request, workspace_uid):
    workspace, membership = _workspace_y_membresia(request, workspace_uid)
    can_view_contacts = tiene_permiso(membership, "ver_leads")
    can_edit_questionnaires = tiene_permiso(
        membership, "editar_cuestionarios"
    )
    can_publish_questionnaires = tiene_permiso(
        membership, "publicar_cuestionarios"
    )
    can_manage_members = membership.rol in {
        Membresia.Rol.PROPIETARIO,
        Membresia.Rol.ADMIN,
    }
    can_view_questionnaires = (
        can_edit_questionnaires or can_publish_questionnaires
    )
    can_view_summary = (
        can_view_contacts
        or can_view_questionnaires
        or can_manage_members
    )

    context = {
        "workspace": workspace,
        "membresia": membership,
        "nav_active": "resumen",
        "puede_ver_resumen": can_view_summary,
        "puede_ver_leads": can_view_contacts,
        "puede_ver_cuestionarios": can_view_questionnaires,
        "puede_editar_cuestionarios": can_edit_questionnaires,
        "puede_administrar_miembros": can_manage_members,
        "sin_permisos": not can_view_summary,
        "puede_administrar_suscripcion": (
            can_manage_members and workspace.plan != Workspace.Plan.INTERNO
        ),
        "puede_gestionar_suscripcion": (
            membership.rol == Membresia.Rol.PROPIETARIO
            and workspace.plan != Workspace.Plan.INTERNO
        ),
    }
    if can_manage_members:
        context["popup_evento"] = Popup.objects.para(workspace).first()
    if context["puede_administrar_suscripcion"]:
        subscription = (
            SuscripcionWorkspace.objects.para(workspace)
            .filter(workspace=workspace)
            .first()
        )
        context["suscripcion"] = subscription
        if subscription and subscription.estado == SuscripcionWorkspace.Estado.PRUEBA:
            remaining = subscription.prueba_hasta - timezone.now()
            context["dias_prueba_restantes"] = max(
                0, math.ceil(remaining.total_seconds() / 86_400)
            )
    if can_view_summary:
        published = list(
            Cuestionario.objects.para(workspace)
            .filter(estado=Cuestionario.Estado.PUBLICADO)
            .order_by("nombre")
        ) if can_view_questionnaires else []
        context.update(
            {
                "publicados": [
                    {
                        "cuestionario": questionnaire,
                        "public_url": request.build_absolute_uri(
                            reverse(
                                "cuestionario_publico",
                                args=[workspace.slug, questionnaire.uid],
                            )
                        ),
                    }
                    for questionnaire in published
                ],
                "cuestionarios_publicados": len(published),
                "miembros_activos": (
                    Membresia.objects.para(workspace)
                    .filter(estado=Membresia.Estado.ACTIVO)
                    .count()
                    if can_manage_members
                    else None
                ),
            }
        )
        if can_view_contacts:
            since = timezone.now() - timedelta(days=7)
            contacts = Contacto.objects.para(workspace)
            recent_contacts = list(
                contacts.filter(creado__gte=since).order_by("-creado")[:5]
            )
            diagnoses = {
                diagnosis.contacto_id: diagnosis
                for diagnosis in Diagnostico.objects.para(workspace)
                .filter(contacto__in=recent_contacts)
                .select_related("cuestionario")
            }
            context.update(
                {
                    "contactos_nuevos": contacts.filter(
                        estado=Contacto.Estado.NUEVO, creado__gte=since
                    ).count(),
                    "total_contactos": contacts.count(),
                    "contactos_recientes": [
                        {
                            "contact": contact,
                            "diagnosis": diagnoses.get(contact.pk),
                            "origen_label": etiqueta_origen(contact.origen),
                        }
                        for contact in recent_contacts
                    ],
                }
            )
        else:
            context.update(
                {
                    "contactos_nuevos": None,
                    "total_contactos": None,
                    "contactos_recientes": [],
                }
            )
    return render(request, "workspaces/resumen.html", context)


@usuario_requerido
def miembros(request, workspace_uid):
    workspace, actor = _workspace_y_membresia(request, workspace_uid)
    if actor.rol not in {
        Membresia.Rol.PROPIETARIO,
        Membresia.Rol.ADMIN,
    }:
        raise Http404
    allowed_roles = []
    if actor.rol == Membresia.Rol.PROPIETARIO:
        allowed_roles.append((Membresia.Rol.ADMIN, "Admin"))
    allowed_roles.append((Membresia.Rol.USUARIO, "Usuario"))
    if request.method == "POST":
        if not any(
            puede_agregar_miembro(actor, role)
            for role, _label in allowed_roles
        ):
            raise Http404
        form = AltaMembresiaForm(request.POST, roles=allowed_roles)
        if form.is_valid():
            correo = form.cleaned_data["correo"]
            user = Usuario.objects.filter(correo=correo).first()
            try:
                Membresia.objects.para(workspace).create(
                    correo=correo,
                    usuario=user,
                    rol=form.cleaned_data["rol"],
                )
            except IntegrityError:
                if not Membresia.objects.para(workspace).filter(correo=correo).exists():
                    raise
                form.add_error("correo", "Ya existe una membresía para este correo.")
            else:
                messages.success(request, "Miembro agregado al espacio.")
                return redirect("miembros", workspace_uid=workspace.uid)
    elif request.method == "GET":
        form = AltaMembresiaForm(roles=allowed_roles)
    else:
        return HttpResponseNotAllowed(["GET", "POST"])

    members = Membresia.objects.para(workspace).order_by("correo")
    membership_rows = [
        {
            "membresia": member,
            "puede_gestionar": puede_editar_miembro(actor, member),
        }
        for member in members
    ]
    return render(
        request,
        "workspaces/miembros.html",
        {
            "workspace": workspace,
            "membresia": actor,
            "actor": actor,
            "nav_active": "miembros",
            "puede_ver_resumen": True,
            "puede_ver_leads": tiene_permiso(actor, "ver_leads"),
            "puede_ver_cuestionarios": (
                tiene_permiso(actor, "editar_cuestionarios")
                or tiene_permiso(actor, "publicar_cuestionarios")
            ),
            "puede_editar_cuestionarios": tiene_permiso(
                actor, "editar_cuestionarios"
            ),
            "puede_administrar_miembros": True,
            "membresias": membership_rows,
            "form": form,
            "puede_agregar": puede_agregar_miembro(
                actor,
                Membresia.Rol.ADMIN
                if actor.rol == Membresia.Rol.PROPIETARIO
                else Membresia.Rol.USUARIO,
            ),
        },
        status=400 if request.method == "POST" and not form.is_valid() else 200,
    )


@usuario_requerido
def miembro_detalle(request, workspace_uid, uid):
    workspace, actor = _workspace_y_membresia(request, workspace_uid)
    objetivo = get_object_or_404(Membresia.objects.para(workspace), uid=uid)
    if not puede_editar_miembro(actor, objetivo):
        raise Http404

    roles = [(Membresia.Rol.USUARIO, "Usuario")]
    if actor.rol == Membresia.Rol.PROPIETARIO:
        roles.insert(0, (Membresia.Rol.ADMIN, "Admin"))

    if request.method == "POST":
        action = request.POST.get("accion")
        if action in {"activar", "desactivar"}:
            if not puede_cambiar_estado_miembro(actor, objetivo):
                raise Http404
            objetivo.estado = (
                Membresia.Estado.ACTIVO
                if action == "activar"
                else Membresia.Estado.INACTIVO
            )
            objetivo.save(update_fields=["estado", "actualizado"])
            messages.success(
                request,
                "Membresía reactivada."
                if action == "activar"
                else "Membresía desactivada.",
            )
            return redirect("miembros", workspace_uid=workspace.uid)
        if action == "quitar":
            if not puede_quitar_miembro(actor, objetivo):
                raise Http404
            objetivo.delete()
            messages.success(request, "Membresía quitada del espacio.")
            return redirect("miembros", workspace_uid=workspace.uid)
        if action == "guardar":
            form = EdicionMembresiaForm(request.POST, roles=roles)
            if form.is_valid():
                rol = form.cleaned_data["rol"]
                if not puede_editar_miembro(actor, objetivo, rol_nuevo=rol):
                    raise Http404
                objetivo.rol = rol
                for permission in PERMISOS_FORM:
                    setattr(objetivo, permission, form.cleaned_data[permission])
                objetivo.save(update_fields=["rol", *PERMISOS_FORM, "actualizado"])
                messages.success(request, "Permisos y rol actualizados.")
                return redirect("miembros", workspace_uid=workspace.uid)
        else:
            raise Http404
    elif request.method == "GET":
        form = EdicionMembresiaForm(
            initial={
                "rol": objetivo.rol,
                **{permission: getattr(objetivo, permission) for permission in PERMISOS_FORM},
            },
            roles=roles,
        )
    else:
        return HttpResponseNotAllowed(["GET", "POST"])

    return render(
        request,
        "workspaces/miembro_detalle.html",
        {
            "workspace": workspace,
            "membresia": actor,
            "objetivo": objetivo,
            "form": form,
            "nav_active": "miembros",
            "puede_ver_resumen": True,
            "puede_ver_leads": tiene_permiso(actor, "ver_leads"),
            "puede_ver_cuestionarios": (
                tiene_permiso(actor, "editar_cuestionarios")
                or tiene_permiso(actor, "publicar_cuestionarios")
            ),
            "puede_editar_cuestionarios": tiene_permiso(
                actor, "editar_cuestionarios"
            ),
            "puede_administrar_miembros": True,
        },
        status=400 if request.method == "POST" and not form.is_valid() else 200,
    )


def _contexto_consola_plataforma(
    request,
    *,
    rechazo_popup_uid=None,
    rechazo_form=None,
):
    workspaces = []
    for workspace in Workspace.objects.order_by("nombre"):
        owner = (
            Membresia.objects.para(workspace)
            .filter(
                rol=Membresia.Rol.PROPIETARIO,
                estado=Membresia.Estado.ACTIVO,
                usuario__activo=True,
            )
            .select_related("usuario")
            .first()
        )
        contacts = Contacto.objects.para(workspace)
        questionnaires = Cuestionario.objects.para(workspace)
        deletion_allowed = (
            workspace.slug not in PROTECTED_WORKSPACE_SLUGS
            and (
                workspace.estado == Workspace.Estado.SUSPENDIDA
                or owner is None
            )
        )
        workspaces.append(
            {
                "workspace": workspace,
                "owner_email": owner.correo if owner else "",
                "owner_active": owner is not None,
                "published_count": questionnaires
                .filter(estado=Cuestionario.Estado.PUBLICADO)
                .count(),
                "contact_count": contacts.count(),
                "inactive": workspace.estado == Workspace.Estado.SUSPENDIDA,
                "protected": workspace.slug in PROTECTED_WORKSPACE_SLUGS,
                "suspension_allowed": (
                    workspace.slug not in PROTECTED_WORKSPACE_SLUGS
                ),
                "deletion_allowed": deletion_allowed,
                "deletion_counts": {
                    "contactos": contacts.count(),
                    "diagnosticos": Diagnostico.objects.para(workspace).count(),
                    "seguimientos": Seguimiento.objects.para(workspace).count(),
                    "cuestionarios": questionnaires.count(),
                    "versiones": VersionCuestionario.objects.para(workspace).count(),
                    "miembros": Membresia.objects.para(workspace).count(),
                    "suscripciones": SuscripcionWorkspace.objects.para(workspace).count(),
                    "popups": Popup.objects.para(workspace).count(),
                },
            }
        )
    platform_events = (
        Popup.objects.sin_alcance()
        .filter(
            estado__in=[Popup.Estado.PENDIENTE, Popup.Estado.PUBLICADO]
        )
        .select_related("workspace", "cuestionario")
        .order_by("fecha_evento", "actualizado")
    )
    now = timezone.now()
    platform_event_rows = [
        {
            "popup": popup,
            "vencido": popup.vence_en is None or popup.vence_en <= now,
        }
        for popup in platform_events
    ]
    clearia = Workspace.objects.filter(slug=CLEARIA_WORKSPACE_SLUG).first()
    clearia_membership = (
        Membresia.objects.para(clearia)
        .filter(usuario=request.usuario, estado=Membresia.Estado.ACTIVO)
        .first()
        if clearia
        else None
    )
    return {
        "workspaces": workspaces,
        "eventos_revision": [
            row for row in platform_event_rows
            if row["popup"].estado == Popup.Estado.PENDIENTE
        ],
        "eventos_publicados": [
            row for row in platform_event_rows
            if row["popup"].estado == Popup.Estado.PUBLICADO
        ],
        "clearia_contactos_url": (
            reverse("contactos", args=[clearia.uid])
            if clearia_membership
            else ""
        ),
        "nav_active": "plataforma",
        "rechazo_popup_uid": rechazo_popup_uid,
        "rechazo_form": rechazo_form,
    }


@plataforma_requerida
def consola_plataforma(request):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])
    return render(
        request,
        "workspaces/plataforma.html",
        _contexto_consola_plataforma(request),
    )


@plataforma_requerida
@never_cache
@require_GET
def plataforma_workspace_usuarios(request, workspace_uid):
    workspace = get_object_or_404(Workspace, uid=workspace_uid)
    membresias = (
        Membresia.objects.para(workspace)
        .select_related("usuario")
        .order_by("rol", "correo")
    )
    return render(
        request,
        "workspaces/plataforma_usuarios.html",
        {
            "workspace": workspace,
            "membresias": membresias,
            "nav_active": "plataforma",
            "footer_compact": False,
        },
    )


@plataforma_requerida
@never_cache
@require_GET
def plataforma_workspace_prospectos(request, workspace_uid):
    workspace = get_object_or_404(Workspace, uid=workspace_uid)
    query = request.GET.get("q", "").strip()[:200]
    contacts = Contacto.objects.para(workspace)
    if query:
        contacts = contacts.filter(
            Q(nombre__icontains=query) | Q(correo__icontains=query)
        )

    page_obj = Paginator(contacts.order_by("-creado"), 50).get_page(
        request.GET.get("page")
    )
    page_contacts = list(page_obj.object_list)
    diagnosis_by_contact = {
        diagnosis.contacto_id: diagnosis
        for diagnosis in (
            Diagnostico.objects.para(workspace)
            .filter(contacto_id__in=[contact.pk for contact in page_contacts])
            .select_related("cuestionario")
        )
    }
    rows = [
        {
            "contact": contact,
            "diagnosis": diagnosis_by_contact.get(contact.pk),
            "origen_label": etiqueta_origen(contact.origen),
        }
        for contact in page_contacts
    ]
    return render(
        request,
        "workspaces/plataforma_prospectos.html",
        {
            "workspace": workspace,
            "rows": rows,
            "page_obj": page_obj,
            "query": query,
            "nav_active": "plataforma",
            "footer_compact": False,
        },
    )


@plataforma_requerida
def crear_workspace(request):
    if request.method == "POST":
        form = CrearWorkspaceForm(request.POST)
        if form.is_valid():
            data = form.cleaned_data
            user = Usuario.objects.filter(correo=data["propietario_correo"]).first()
            try:
                with transaction.atomic():
                    workspace = Workspace.objects.create(
                        slug=data["slug"],
                        nombre=data["nombre"],
                        plan=data["plan"],
                        color_primario=data["color_primario"],
                        logo_url=data["logo_url"],
                    )
                    Membresia.objects.para(workspace).create(
                        correo=data["propietario_correo"],
                        usuario=user,
                        rol=Membresia.Rol.PROPIETARIO,
                        ver_leads=True,
                        gestionar_leads=True,
                        editar_cuestionarios=True,
                        publicar_cuestionarios=True,
                    )
            except IntegrityError:
                form.add_error("slug", "Ya existe una empresa con ese slug.")
            else:
                messages.success(request, "Empresa creada correctamente.")
                return redirect("consola_plataforma")
    elif request.method == "GET":
        form = CrearWorkspaceForm(initial={"color_primario": "#E2554F"})
    else:
        return HttpResponseNotAllowed(["GET", "POST"])
    return render(
        request,
        "workspaces/crear_workspace.html",
        {"form": form, "nav_active": "crear_empresa"},
        status=400 if request.method == "POST" and not form.is_valid() else 200,
    )


@plataforma_requerida
def editar_workspace(request, workspace_uid):
    workspace = get_object_or_404(Workspace, uid=workspace_uid)
    if request.method == "POST":
        action = request.POST.get("accion")
        if action in {"suspender", "reactivar"}:
            if (
                action == "suspender"
                and workspace.slug in PROTECTED_WORKSPACE_SLUGS
            ):
                raise Http404
            with transaction.atomic():
                workspace.estado = (
                    Workspace.Estado.SUSPENDIDA
                    if action == "suspender"
                    else Workspace.Estado.ACTIVA
                )
                workspace.save(update_fields=["estado"])
                if action == "suspender":
                    Popup.objects.para(workspace).filter(
                        estado__in=[
                            Popup.Estado.PENDIENTE,
                            Popup.Estado.PUBLICADO,
                            Popup.Estado.RECHAZADO,
                        ]
                    ).update(estado=Popup.Estado.BORRADOR)
            messages.success(
                request,
                "Empresa reactivada."
                if action == "reactivar"
                else "Empresa suspendida.",
            )
            return redirect("consola_plataforma")
        form = EditarWorkspaceForm(request.POST)
        if form.is_valid():
            for field in ("nombre", "plan", "color_primario", "logo_url"):
                setattr(workspace, field, form.cleaned_data[field])
            workspace.save(
                update_fields=["nombre", "plan", "color_primario", "logo_url"]
            )
            messages.success(request, "Datos de la empresa actualizados.")
            return redirect("consola_plataforma")
    elif request.method == "GET":
        form = EditarWorkspaceForm(
            initial={
                field: getattr(workspace, field)
                for field in ("nombre", "plan", "color_primario", "logo_url")
            }
        )
    else:
        return HttpResponseNotAllowed(["GET", "POST"])
    return render(
        request,
        "workspaces/editar_workspace.html",
        {
            "workspace": workspace,
            "workspace_protected": (
                workspace.slug in PROTECTED_WORKSPACE_SLUGS
            ),
            "form": form,
            "nav_active": "plataforma",
        },
        status=400 if request.method == "POST" and not form.is_valid() else 200,
    )


@plataforma_requerida
@require_POST
def eliminar_workspace_view(request, workspace_uid):
    slug_confirmado = request.POST.get("confirmar_slug", "")
    liberar_prueba = request.POST.get("liberar_prueba") == "on"
    try:
        summary = eliminar_workspace(
            workspace_uid,
            slug_confirmado,
            liberar_prueba=liberar_prueba,
        )
    except WorkspaceDeletionError as error:
        messages.error(request, str(error))
    else:
        if summary["ya_eliminada"]:
            messages.success(request, "La empresa ya había sido eliminada.")
        else:
            messages.success(
                request,
                "Empresa eliminada. "
                f"Contactos: {summary['contactos']}; "
                f"diagnósticos: {summary['diagnosticos']}; "
                f"seguimientos: {summary['seguimientos']}; "
                f"cuestionarios: {summary['cuestionarios']}; "
                f"versiones: {summary['versiones']}; "
                f"miembros: {summary['miembros']}; "
                f"suscripciones: {summary['suscripciones']}; "
                f"eventos: {summary['popups']}; "
                f"pruebas liberadas: {summary['pruebas_liberadas']}.",
            )
    return redirect("consola_plataforma")


@plataforma_requerida
def asignar_propietario(request, workspace_uid):
    workspace = get_object_or_404(Workspace, uid=workspace_uid)
    owner_membership = Membresia.objects.para(workspace).filter(
        rol=Membresia.Rol.PROPIETARIO,
        estado=Membresia.Estado.ACTIVO,
        usuario__activo=True,
    ).first()
    if owner_membership:
        raise Http404
    form = AltaMembresiaForm(
        request.POST if request.method == "POST" else None,
        roles=[(Membresia.Rol.PROPIETARIO, "Propietario")],
    )
    if request.method == "POST":
        if form.is_valid():
            correo = form.cleaned_data["correo"]
            try:
                with transaction.atomic():
                    locked_workspace = Workspace.objects.select_for_update().get(
                        pk=workspace.pk
                    )
                    if Membresia.objects.para(locked_workspace).filter(
                        rol=Membresia.Rol.PROPIETARIO,
                        estado=Membresia.Estado.ACTIVO,
                        usuario__activo=True,
                    ).exists():
                        raise Http404
                    membership = Membresia.objects.para(locked_workspace).filter(
                        correo=correo
                    ).first()
                    values = {
                        "usuario": Usuario.objects.filter(correo=correo).first(),
                        "rol": Membresia.Rol.PROPIETARIO,
                        "estado": Membresia.Estado.ACTIVO,
                        "ver_leads": True,
                        "gestionar_leads": True,
                        "editar_cuestionarios": True,
                        "publicar_cuestionarios": True,
                    }
                    if membership:
                        for key, value in values.items():
                            setattr(membership, key, value)
                        membership.save()
                    else:
                        Membresia.objects.para(locked_workspace).create(
                            correo=correo, **values
                        )
            except IntegrityError:
                if not Membresia.objects.para(workspace).filter(
                    rol=Membresia.Rol.PROPIETARIO
                ).exists():
                    raise
                raise Http404
            else:
                messages.success(request, "Propietario asignado correctamente.")
                return redirect("consola_plataforma")
    elif request.method != "GET":
        return HttpResponseNotAllowed(["GET", "POST"])
    return render(
        request,
        "workspaces/asignar_propietario.html",
        {
            "workspace": workspace,
            "form": form,
            "nav_active": "plataforma",
        },
        status=400 if request.method == "POST" and not form.is_valid() else 200,
    )
