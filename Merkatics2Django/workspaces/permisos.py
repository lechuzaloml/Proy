PERMISOS = (
    "ver_leads",
    "gestionar_leads",
    "editar_cuestionarios",
    "publicar_cuestionarios",
)


def _activo(membresia):
    return membresia is not None and membresia.estado == "activo"


def tiene_permiso(membresia, permiso, plataforma=False):
    if plataforma:
        return True
    if permiso not in PERMISOS:
        raise ValueError(f"Permiso desconocido: {permiso}")
    if not _activo(membresia):
        return False
    if membresia.rol in {"propietario", "admin"}:
        return True
    if membresia.rol == "usuario":
        return bool(getattr(membresia, permiso))
    return False


def puede_asignar_rol(actor, rol, plataforma=False):
    if plataforma:
        return rol in {"propietario", "admin", "usuario"}
    if not _activo(actor):
        return False
    if actor.rol == "propietario":
        return rol in {"admin", "usuario"}
    if actor.rol == "admin":
        return rol == "usuario"
    return False


def puede_gestionar_miembro(actor, objetivo, plataforma=False):
    if plataforma:
        return objetivo is not None
    if not _activo(actor) or objetivo is None:
        return False
    if actor.uid == objetivo.uid or objetivo.rol == "propietario":
        return False
    if actor.rol == "propietario":
        return objetivo.rol in {"admin", "usuario"}
    if actor.rol == "admin":
        return objetivo.rol == "usuario"
    return False


def puede_editar_miembro(actor, objetivo, rol_nuevo=None, plataforma=False):
    if not puede_gestionar_miembro(actor, objetivo, plataforma=plataforma):
        return False
    if rol_nuevo is not None and not puede_asignar_rol(
        actor, rol_nuevo, plataforma=plataforma
    ):
        return False
    return True


def puede_agregar_miembro(actor, rol, plataforma=False):
    return puede_asignar_rol(actor, rol, plataforma=plataforma)


def puede_quitar_miembro(actor, objetivo, plataforma=False):
    return puede_gestionar_miembro(actor, objetivo, plataforma=plataforma)


def puede_cambiar_estado_miembro(actor, objetivo, plataforma=False):
    return puede_gestionar_miembro(actor, objetivo, plataforma=plataforma)
