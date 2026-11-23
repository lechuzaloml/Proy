import uuid

from django.db import transaction
from django.db.models import Q
from django.contrib import messages
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from contacts.models import Contacto, Diagnostico, Seguimiento
from contacts.presentation import ORIGIN_FILTERS, etiqueta_origen, filtrar_por_origen
from core.workspace_access import obtener_workspace_y_membresia, usuario_requerido
from funnels.models import Cuestionario
from workspaces.models import Membresia
from workspaces.permisos import tiene_permiso


@usuario_requerido
def contactos(request, workspace_uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    if not tiene_permiso(membership, "ver_leads"):
        raise Http404
    filters = {
        "q": request.GET.get("q", "").strip()[:200],
        "segmento": request.GET.get("segmento", "").strip()[:100],
        "estado": request.GET.get("estado", "").strip(),
        "cuestionario": request.GET.get("cuestionario", "").strip(),
        "origen": request.GET.get("origen", "todos").strip(),
        "orden": request.GET.get("orden", "fecha").strip(),
    }
    contacts = Contacto.objects.para(workspace).all()
    contacts = filtrar_por_origen(contacts, filters["origen"])
    if filters["q"]:
        contacts = contacts.filter(
            Q(nombre__icontains=filters["q"])
            | Q(correo__icontains=filters["q"])
        )
    if filters["estado"] in Contacto.Estado.values:
        contacts = contacts.filter(estado=filters["estado"])

    diagnoses = Diagnostico.objects.para(workspace).select_related("cuestionario")
    if filters["segmento"]:
        diagnoses = diagnoses.filter(segmento=filters["segmento"])
    if filters["cuestionario"]:
        try:
            questionnaire_uid = uuid.UUID(filters["cuestionario"])
        except (TypeError, ValueError):
            contacts = contacts.none()
            diagnosis_by_contact = {}
        else:
            questionnaire = (
                Cuestionario.objects.para(workspace)
                .filter(uid=questionnaire_uid)
                .first()
            )
            if questionnaire is None:
                contacts = contacts.none()
            else:
                diagnoses = diagnoses.filter(cuestionario=questionnaire)
                contact_ids = diagnoses.values_list("contacto_id", flat=True)
                contacts = contacts.filter(pk__in=contact_ids)
            diagnosis_by_contact = {
                diagnosis.contacto_id: diagnosis
                for diagnosis in Diagnostico.objects.para(workspace)
                .filter(contacto__in=contacts)
                .select_related("cuestionario")
            }
    elif filters["segmento"]:
        contact_ids = diagnoses.values_list("contacto_id", flat=True)
        contacts = contacts.filter(pk__in=contact_ids)
        diagnosis_by_contact = {
            diagnosis.contacto_id: diagnosis
            for diagnosis in Diagnostico.objects.para(workspace)
            .filter(contacto__in=contacts)
            .select_related("cuestionario")
        }
    else:
        diagnosis_by_contact = {
            diagnosis.contacto_id: diagnosis
            for diagnosis in Diagnostico.objects.para(workspace)
            .filter(contacto__in=contacts)
            .select_related("cuestionario")
        }

    rows = [
        {
            "contact": contact,
            "diagnosis": diagnosis_by_contact.get(contact.pk),
            "origen_label": etiqueta_origen(contact.origen),
        }
        for contact in contacts.select_related("asignado_a")
    ]
    if filters["orden"] == "porcentaje":
        rows.sort(
            key=lambda row: (
                row["diagnosis"].porcentaje if row["diagnosis"] else -1
            ),
            reverse=True,
        )
    else:
        rows.sort(key=lambda row: row["contact"].creado, reverse=True)

    return render(
        request,
        "contacts/lista_contactos.html",
        {
            "workspace": workspace,
            "membresia": membership,
            "nav_active": "contactos",
            "puede_ver_resumen": True,
            "puede_ver_leads": True,
            "puede_ver_cuestionarios": (
                tiene_permiso(membership, "editar_cuestionarios")
                or tiene_permiso(membership, "publicar_cuestionarios")
            ),
            "puede_administrar_miembros": membership.rol
            in {Membresia.Rol.PROPIETARIO, Membresia.Rol.ADMIN},
            "puede_editar_cuestionarios": tiene_permiso(
                membership, "editar_cuestionarios"
            ),
            "rows": rows,
            "filters": filters,
            "states": Contacto.Estado.choices,
            "origin_filters": ORIGIN_FILTERS,
            "questionnaires": Cuestionario.objects.para(workspace).all(),
            "puede_editar_cuestionarios": (
                tiene_permiso(membership, "editar_cuestionarios")
                or tiene_permiso(membership, "publicar_cuestionarios")
            ),
            "footer_compact": False,
        },
    )


@usuario_requerido
@require_http_methods(["GET", "POST"])
def contacto_detalle(request, workspace_uid, uid):
    workspace, membership = obtener_workspace_y_membresia(
        request, workspace_uid
    )
    if not tiene_permiso(membership, "ver_leads"):
        raise Http404
    contact = get_object_or_404(Contacto.objects.para(workspace), uid=uid)
    diagnosis = (
        Diagnostico.objects.para(workspace)
        .filter(contacto=contact)
        .select_related("cuestionario")
        .first()
    )
    can_manage = tiene_permiso(membership, "gestionar_leads")
    can_delete = membership.rol in {
        Membresia.Rol.ADMIN,
        Membresia.Rol.PROPIETARIO,
    }
    errors = []

    if request.method == "POST":
        if not can_manage and not (request.POST.get("accion") == "eliminar" and can_delete):
            raise Http404
        action = request.POST.get("accion")
        if action == "estado":
            state = request.POST.get("estado", "")
            if state not in Contacto.Estado.values:
                errors.append("Selecciona un estado válido.")
            else:
                contact.estado = state
                now = timezone.now()
                contact.ultima_actividad = now
                updated_fields = ["estado", "ultima_actividad", "actualizado"]
                if (
                    state == Contacto.Estado.CONTACTADO
                    and contact.contactado_en is None
                ):
                    contact.contactado_en = now
                    updated_fields.append("contactado_en")
                contact.save(update_fields=updated_fields)
        elif action == "asignacion":
            raw_uid = request.POST.get("membresia_uid", "").strip()
            assignee = None
            if raw_uid:
                try:
                    member_uid = uuid.UUID(raw_uid)
                except ValueError:
                    errors.append("Selecciona una membresía válida.")
                else:
                    member = (
                        Membresia.objects.para(workspace)
                        .filter(
                            uid=member_uid,
                            estado=Membresia.Estado.ACTIVO,
                        )
                        .select_related("usuario")
                        .first()
                    )
                    if member is None or member.usuario is None:
                        errors.append("La membresía seleccionada no está disponible.")
                    else:
                        assignee = member.usuario
            if not errors:
                contact.asignado_a = assignee
                contact.ultima_actividad = timezone.now()
                contact.save(
                    update_fields=["asignado_a", "ultima_actividad", "actualizado"]
                )
        elif action == "seguimiento":
            kind = request.POST.get("tipo", "")
            notes = request.POST.get("notas", "").strip()
            outcome = request.POST.get("resultado", "").strip()
            next_action = request.POST.get("proxima_accion", "").strip()
            if kind not in Seguimiento.Tipo.values:
                errors.append("Selecciona un tipo de seguimiento válido.")
            if not notes or len(notes) > 2000:
                errors.append("Las notas son obligatorias y no deben superar 2000 caracteres.")
            if len(outcome) > 200 or len(next_action) > 200:
                errors.append("Resultado y próxima acción admiten hasta 200 caracteres.")
            if not errors:
                with transaction.atomic():
                    Seguimiento.objects.para(workspace).create(
                        contacto=contact,
                        tipo=kind,
                        notas=notes,
                        resultado=outcome,
                        proxima_accion=next_action,
                        creado_por=request.usuario,
                    )
                    contact.ultima_actividad = timezone.now()
                    contact.save(update_fields=["ultima_actividad", "actualizado"])
        elif action == "eliminar":
            if not can_delete:
                raise Http404
            Contacto.objects.para(workspace).filter(pk=contact.pk).delete()
            messages.success(request, "Contacto eliminado del espacio.")
            return redirect("contactos", workspace_uid=workspace.uid)
        else:
            errors.append("La acción solicitada no es válida.")
        if not errors:
            if action == "estado":
                messages.success(request, "Estado del contacto actualizado.")
            elif action == "asignacion":
                messages.success(request, "Asignación del contacto actualizada.")
            elif action == "seguimiento":
                messages.success(request, "Seguimiento agregado.")
            return redirect(
                "contacto_detalle",
                workspace_uid=workspace.uid,
                uid=contact.uid,
            )

    response_rows = (
        list(diagnosis.respuestas.values())
        if diagnosis and isinstance(diagnosis.respuestas, dict)
        else []
    )
    followups = Seguimiento.objects.para(workspace).filter(contacto=contact)
    members = (
        Membresia.objects.para(workspace)
        .filter(
            estado=Membresia.Estado.ACTIVO,
            usuario__isnull=False,
        )
        .select_related("usuario")
        .order_by("correo")
    )
    return render(
        request,
        "contacts/detalle_contacto.html",
        {
            "workspace": workspace,
            "membresia": membership,
            "nav_active": "contactos",
            "puede_ver_resumen": True,
            "puede_ver_leads": True,
            "puede_ver_cuestionarios": (
                tiene_permiso(membership, "editar_cuestionarios")
                or tiene_permiso(membership, "publicar_cuestionarios")
            ),
            "puede_editar_cuestionarios": tiene_permiso(
                membership, "editar_cuestionarios"
            ),
            "puede_administrar_miembros": membership.rol
            in {Membresia.Rol.PROPIETARIO, Membresia.Rol.ADMIN},
            "contact": contact,
            "diagnosis": diagnosis,
            "origen_label": etiqueta_origen(contact.origen),
            "response_rows": response_rows,
            "followups": followups,
            "members": members,
            "states": Contacto.Estado.choices,
            "followup_types": Seguimiento.Tipo.choices,
            "puede_gestionar": can_manage,
            "puede_eliminar": can_delete,
            "errors": errors,
            "footer_compact": False,
        },
        status=400 if errors else 200,
    )
