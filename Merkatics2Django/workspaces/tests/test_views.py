from django.test import TestCase
from django.urls import reverse

from users.models import AdminPlataforma, Usuario
from workspaces.models import Membresia, Workspace


class WorkspaceScopeViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user_a = Usuario.objects.create(correo="a@example.com")
        cls.user_b = Usuario.objects.create(correo="b@example.com")
        cls.workspace_a = Workspace.objects.create(slug="company-alpha", nombre="Alpha")
        cls.workspace_b = Workspace.objects.create(slug="company-bravo", nombre="Bravo")
        Membresia.objects.para(cls.workspace_a).create(
            correo=cls.user_a.correo,
            usuario=cls.user_a,
            rol=Membresia.Rol.USUARIO,
        )
        Membresia.objects.para(cls.workspace_a).create(
            correo="hidden-a@example.com",
            rol=Membresia.Rol.USUARIO,
        )
        Membresia.objects.para(cls.workspace_b).create(
            correo=cls.user_b.correo,
            usuario=cls.user_b,
            rol=Membresia.Rol.PROPIETARIO,
        )
        Membresia.objects.para(cls.workspace_b).create(
            correo="hidden-b@example.com",
            rol=Membresia.Rol.USUARIO,
        )

    def setUp(self):
        session = self.client.session
        session["usuario_uid"] = str(self.user_a.uid)
        session.save()

    def test_foreign_workspace_members_page_returns_404(self):
        response = self.client.get(
            reverse("miembros", args=[self.workspace_b.uid])
        )
        self.assertEqual(response.status_code, 404)

    def test_workspace_page_only_contains_its_scoped_members(self):
        response = self.client.get(
            reverse("miembros", args=[self.workspace_a.uid])
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "hidden-a@example.com")
        self.assertNotContains(response, "hidden-b@example.com")
        self.assertNotContains(response, "b@example.com")
        self.assertNotContains(response, "Agregar miembro")

    def test_suspended_workspace_members_keep_panel_access(self):
        self.workspace_a.estado = Workspace.Estado.SUSPENDIDA
        self.workspace_a.save(update_fields=["estado"])

        response = self.client.get(
            reverse("miembros", args=[self.workspace_a.uid])
        )

        self.assertEqual(response.status_code, 200)

    def test_inactive_members_cannot_access_workspace(self):
        membership = Membresia.objects.para(self.workspace_a).get(usuario=self.user_a)
        membership.estado = Membresia.Estado.INACTIVO
        membership.save(update_fields=["estado", "actualizado"])

        response = self.client.get(
            reverse("miembros", args=[self.workspace_a.uid])
        )

        self.assertEqual(response.status_code, 404)

    def test_selector_shows_no_access_when_user_has_no_active_memberships(self):
        user = Usuario.objects.create(correo="no-access@example.com")
        Membresia.objects.para(self.workspace_a).create(
            correo=user.correo,
            usuario=user,
            rol=Membresia.Rol.USUARIO,
            estado=Membresia.Estado.INACTIVO,
        )
        session = self.client.session
        session["usuario_uid"] = str(user.uid)
        session.save()

        response = self.client.get(reverse("selector_workspace"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Esta cuenta no tiene acceso")
        self.assertNotContains(response, "Alpha")


class PlatformViewsTests(TestCase):
    def login(self, user):
        session = self.client.session
        session["usuario_uid"] = str(user.uid)
        session.save()

    def test_non_platform_user_cannot_create_platform_admin_or_open_console(self):
        user = Usuario.objects.create(correo="member@example.com")
        self.login(user)

        response = self.client.get(reverse("consola_plataforma"))
        create_response = self.client.post(
            reverse("crear_workspace"),
            {
                "slug": "web-created",
                "nombre": "Web created",
                "propietario_correo": "owner@example.com",
                "plan": "inicial",
                "color_primario": "#E2554F",
                "logo_url": "",
            },
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(create_response.status_code, 404)
        self.assertFalse(AdminPlataforma.objects.exists())
        self.assertFalse(Workspace.objects.exists())

    def test_platform_creation_creates_workspace_and_first_owner_together(self):
        platform_user = Usuario.objects.create(correo="platform@example.com")
        AdminPlataforma.objects.create(usuario=platform_user)
        self.login(platform_user)

        response = self.client.post(
            reverse("crear_workspace"),
            {
                "slug": "new-company",
                "nombre": "New Company",
                "propietario_correo": "first-owner@example.com",
                "plan": "pro",
                "color_primario": "#123ABC",
                "logo_url": "https://example.com/logo.png",
            },
        )

        self.assertEqual(response.status_code, 302)
        workspace = Workspace.objects.get(slug="new-company")
        owner = Membresia.objects.para(workspace).get()
        self.assertEqual(owner.correo, "first-owner@example.com")
        self.assertEqual(owner.rol, Membresia.Rol.PROPIETARIO)
        self.assertTrue(owner.ver_leads)
        self.assertTrue(owner.publicar_cuestionarios)

        console = self.client.get(reverse("consola_plataforma"))
        self.assertEqual(console.status_code, 200)
        self.assertContains(console, "New Company")

    def test_platform_can_assign_owner_when_workspace_has_none(self):
        platform_user = Usuario.objects.create(correo="platform@example.com")
        AdminPlataforma.objects.create(usuario=platform_user)
        workspace = Workspace.objects.create(slug="ownerless", nombre="Ownerless")
        self.login(platform_user)

        response = self.client.post(
            reverse("asignar_propietario", args=[workspace.uid]),
            {"correo": "new-owner@example.com", "rol": "propietario"},
        )

        self.assertEqual(response.status_code, 302)
        owner = Membresia.objects.para(workspace).get()
        self.assertEqual(owner.rol, Membresia.Rol.PROPIETARIO)
        self.assertEqual(owner.correo, "new-owner@example.com")

    def test_platform_can_edit_brand_and_change_company_state(self):
        platform_user = Usuario.objects.create(correo="platform@example.com")
        AdminPlataforma.objects.create(usuario=platform_user)
        workspace = Workspace.objects.create(slug="managed-company", nombre="Before")
        self.login(platform_user)

        edit_response = self.client.post(
            reverse("editar_workspace", args=[workspace.uid]),
            {
                "nombre": "After",
                "plan": "avanzado",
                "color_primario": "#123ABC",
                "logo_url": "https://example.com/brand.png",
            },
        )
        suspend_response = self.client.post(
            reverse("editar_workspace", args=[workspace.uid]),
            {"accion": "suspender"},
        )
        reactivate_response = self.client.post(
            reverse("editar_workspace", args=[workspace.uid]),
            {"accion": "reactivar"},
        )

        self.assertEqual(edit_response.status_code, 302)
        self.assertEqual(suspend_response.status_code, 302)
        self.assertEqual(reactivate_response.status_code, 302)
        workspace.refresh_from_db()
        self.assertEqual(workspace.nombre, "After")
        self.assertEqual(workspace.plan, Workspace.Plan.AVANZADO)
        self.assertEqual(workspace.color_primario, "#123ABC")
        self.assertEqual(workspace.estado, Workspace.Estado.ACTIVA)


class MemberManagementViewsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = Usuario.objects.create(correo="owner@example.com")
        cls.admin = Usuario.objects.create(correo="admin@example.com")
        cls.member = Usuario.objects.create(correo="member@example.com")
        cls.workspace = Workspace.objects.create(slug="member-management", nombre="Team")
        cls.owner_membership = Membresia.objects.para(cls.workspace).create(
            correo=cls.owner.correo,
            usuario=cls.owner,
            rol=Membresia.Rol.PROPIETARIO,
        )
        cls.admin_membership = Membresia.objects.para(cls.workspace).create(
            correo=cls.admin.correo,
            usuario=cls.admin,
            rol=Membresia.Rol.ADMIN,
        )
        cls.member_membership = Membresia.objects.para(cls.workspace).create(
            correo=cls.member.correo,
            usuario=cls.member,
            rol=Membresia.Rol.USUARIO,
        )

    def login(self, user):
        session = self.client.session
        session["usuario_uid"] = str(user.uid)
        session.save()

    def test_owner_can_edit_user_role_and_permissions(self):
        self.login(self.owner)

        response = self.client.post(
            reverse(
                "miembro_detalle",
                args=[self.workspace.uid, self.member_membership.uid],
            ),
            {
                "accion": "guardar",
                "rol": "admin",
                "ver_leads": "on",
                "gestionar_leads": "on",
                "editar_cuestionarios": "",
                "publicar_cuestionarios": "",
            },
        )

        self.assertEqual(response.status_code, 302)
        self.member_membership.refresh_from_db()
        self.assertEqual(self.member_membership.rol, Membresia.Rol.ADMIN)
        self.assertTrue(self.member_membership.ver_leads)
        self.assertTrue(self.member_membership.gestionar_leads)
        self.assertFalse(self.member_membership.editar_cuestionarios)

    def test_company_cannot_create_a_second_owner_or_manage_current_owner(self):
        self.login(self.owner)
        members_url = reverse("miembros", args=[self.workspace.uid])
        self.assertEqual(
            self.client.post(
                members_url,
                {"correo": "new-owner@example.com", "rol": "propietario"},
            ).status_code,
            400,
        )
        owner_url = reverse(
            "miembro_detalle",
            args=[self.workspace.uid, self.owner_membership.uid],
        )
        self.assertEqual(self.client.get(owner_url).status_code, 404)
        self.assertEqual(
            Membresia.objects.para(self.workspace).filter(
                rol=Membresia.Rol.PROPIETARIO
            ).count(),
            1,
        )

    def test_admin_can_manage_users_but_not_another_admin(self):
        self.login(self.admin)
        admin_url = reverse(
            "miembro_detalle",
            args=[self.workspace.uid, self.admin_membership.uid],
        )
        member_url = reverse(
            "miembro_detalle",
            args=[self.workspace.uid, self.member_membership.uid],
        )

        self.assertEqual(self.client.get(admin_url).status_code, 404)
        self.assertEqual(self.client.get(member_url).status_code, 200)
