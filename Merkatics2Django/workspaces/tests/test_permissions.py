from types import SimpleNamespace

from django.test import SimpleTestCase

from workspaces.permisos import (
    PERMISOS,
    puede_agregar_miembro,
    puede_cambiar_estado_miembro,
    puede_editar_miembro,
    puede_quitar_miembro,
    tiene_permiso,
)


def membership(role, uid, state="activo", **permissions):
    values = {permission: False for permission in PERMISOS}
    values.update(permissions)
    return SimpleNamespace(rol=role, uid=uid, estado=state, **values)


class PermissionMatrixTests(SimpleTestCase):
    def test_owner_and_admin_have_all_permissions_independent_of_flags(self):
        for role in ("propietario", "admin"):
            actor = membership(role, role)
            for permission in PERMISOS:
                self.assertTrue(tiene_permiso(actor, permission), (role, permission))

    def test_user_permissions_are_individual(self):
        actor = membership("usuario", "user", ver_leads=True, publicar_cuestionarios=True)
        expected = {
            "ver_leads": True,
            "gestionar_leads": False,
            "editar_cuestionarios": False,
            "publicar_cuestionarios": True,
        }
        self.assertEqual(
            {permission: tiene_permiso(actor, permission) for permission in PERMISOS},
            expected,
        )

    def test_inactive_members_have_no_permissions_or_management_rights(self):
        inactive = membership("propietario", "owner", state="inactivo")
        target = membership("usuario", "user")
        self.assertFalse(tiene_permiso(inactive, "ver_leads"))
        self.assertFalse(puede_agregar_miembro(inactive, "usuario"))
        self.assertFalse(puede_editar_miembro(inactive, target))

    def test_complete_role_and_target_management_matrix(self):
        roles = ("propietario", "admin", "usuario")
        expected = {
            "propietario": {
                "propietario": False,
                "admin": True,
                "usuario": True,
            },
            "admin": {
                "propietario": False,
                "admin": False,
                "usuario": True,
            },
            "usuario": {
                "propietario": False,
                "admin": False,
                "usuario": False,
            },
        }
        for actor_role in roles:
            actor = membership(actor_role, f"actor-{actor_role}")
            for target_role in roles:
                target = membership(target_role, f"target-{target_role}")
                allowed = expected[actor_role][target_role]
                self.assertEqual(
                    puede_editar_miembro(actor, target),
                    allowed,
                    (actor_role, target_role),
                )
                self.assertEqual(
                    puede_quitar_miembro(actor, target),
                    allowed,
                    (actor_role, target_role),
                )
                self.assertEqual(
                    puede_cambiar_estado_miembro(actor, target),
                    allowed,
                    (actor_role, target_role),
                )

    def test_no_company_role_can_create_or_promote_an_owner(self):
        for actor_role in ("propietario", "admin", "usuario"):
            actor = membership(actor_role, actor_role)
            self.assertFalse(puede_agregar_miembro(actor, "propietario"))
            target = membership("usuario", f"target-{actor_role}")
            self.assertFalse(
                puede_editar_miembro(actor, target, rol_nuevo="propietario")
            )

    def test_platform_can_manage_every_role_and_permission(self):
        for role in ("propietario", "admin", "usuario"):
            target = membership(role, role)
            self.assertTrue(puede_editar_miembro(None, target, plataforma=True))
            self.assertTrue(
                puede_editar_miembro(
                    None, target, rol_nuevo="propietario", plataforma=True
                )
            )
        self.assertTrue(tiene_permiso(None, "ver_leads", plataforma=True))

    def test_unknown_permission_is_an_explicit_error(self):
        with self.assertRaises(ValueError):
            tiene_permiso(membership("usuario", "user"), "unknown")
