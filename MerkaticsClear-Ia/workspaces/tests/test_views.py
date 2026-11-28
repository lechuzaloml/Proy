from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from contacts.models import Contacto, Diagnostico
from funnels.models import Cuestionario
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
            rol=Membresia.Rol.PROPIETARIO,
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
        self.assertContains(
            response,
            "Diagnósticos y recursos para impulsar el crecimiento de tu negocio.",
        )
        self.assertContains(response, "hidden-a@example.com")
        self.assertNotContains(response, "hidden-b@example.com")
        self.assertNotContains(response, "b@example.com")
        self.assertContains(response, "Agregar miembro")
        owner = Membresia.objects.para(self.workspace_a).get(usuario=self.user_a)
        self.assertContains(response, "Propietario protegido")
        self.assertNotContains(
            response,
            reverse("miembro_detalle", args=[self.workspace_a.uid, owner.uid]),
        )

    def test_regular_user_cannot_open_members_page(self):
        user = Usuario.objects.create(correo="viewer@example.com")
        Membresia.objects.para(self.workspace_a).create(
            correo=user.correo,
            usuario=user,
            rol=Membresia.Rol.USUARIO,
        )
        session = self.client.session
        session["usuario_uid"] = str(user.uid)
        session.save()

        response = self.client.get(reverse("miembros", args=[self.workspace_a.uid]))

        self.assertEqual(response.status_code, 404)

        Contacto.objects.para(self.workspace_a).create(
            nombre="Contacto confidencial",
            correo="contact@example.com",
            telefono="5551234567",
            consentimiento_version="test-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        summary = self.client.get(
            reverse("resumen_workspace", args=[self.workspace_a.uid])
        )
        self.assertEqual(summary.status_code, 200)
        self.assertContains(summary, "No tienes permisos para ver los paneles")
        self.assertNotContains(summary, "Contacto confidencial")

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

        logo_url = (
            "https://lh3.googleusercontent.com/a/" + "x" * 300 + "=s96-c"
        )
        response = self.client.post(
            reverse("crear_workspace"),
            {
                "slug": "new-company",
                "nombre": "New Company",
                "propietario_correo": "first-owner@example.com",
                "plan": "pro",
                "color_primario": "#123ABC",
                "logo_url": logo_url,
            },
        )

        self.assertEqual(response.status_code, 302)
        workspace = Workspace.objects.get(slug="new-company")
        self.assertEqual(workspace.logo_url, logo_url)
        owner = Membresia.objects.para(workspace).get()
        self.assertEqual(owner.correo, "first-owner@example.com")
        self.assertEqual(owner.rol, Membresia.Rol.PROPIETARIO)
        self.assertTrue(owner.ver_leads)
        self.assertTrue(owner.publicar_cuestionarios)

        console = self.client.get(reverse("consola_plataforma"))
        self.assertEqual(console.status_code, 200)
        self.assertContains(console, "New Company")

    def test_platform_console_exposes_aggregate_counts_not_contact_records(self):
        platform_user = Usuario.objects.create(correo="platform@example.com")
        AdminPlataforma.objects.create(usuario=platform_user)
        workspace = Workspace.objects.create(slug="counted", nombre="Contada")
        Membresia.objects.para(workspace).create(
            correo="owner@example.com",
            rol=Membresia.Rol.PROPIETARIO,
        )
        Cuestionario.objects.para(workspace).create(
            nombre="Publicado",
            estado=Cuestionario.Estado.PUBLICADO,
            configuracion={},
        )
        Contacto.objects.para(workspace).create(
            nombre="Nombre privado no debe aparecer",
            correo="private@example.com",
            telefono="5551234567",
            consentimiento_version="test-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        self.login(platform_user)

        response = self.client.get(reverse("consola_plataforma"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "platform-console-page")
        self.assertContains(response, "Cuestionarios publicados")
        self.assertContains(response, "Contactos")
        self.assertContains(response, "platform-table-scroll")
        self.assertNotContains(response, "Nombre privado no debe aparecer")
        company_row = next(
            row
            for row in response.context["workspaces"]
            if row["workspace"] == workspace
        )
        self.assertEqual(company_row["published_count"], 1)
        self.assertEqual(company_row["contact_count"], 1)
        self.assertNotIn("contacts", company_row)

    def test_platform_admin_can_read_company_users_and_prospects(self):
        platform_user = Usuario.objects.create(correo="platform@example.com")
        AdminPlataforma.objects.create(usuario=platform_user)
        workspace = Workspace.objects.create(
            slug="read-company",
            nombre="Empresa consultable",
        )
        member_user = Usuario.objects.create(
            correo="member@read-company.example",
            nombre="Miembro consultable",
        )
        Membresia.objects.para(workspace).create(
            correo=member_user.correo,
            usuario=member_user,
            rol=Membresia.Rol.ADMIN,
        )
        questionnaire = Cuestionario.objects.para(workspace).create(
            nombre="Diagnóstico consultable",
            configuracion={},
        )
        contact = Contacto.objects.para(workspace).create(
            nombre="Prospecto consultable",
            correo="prospect@read-company.example",
            telefono="5559876543",
            consentimiento_version="test-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        Diagnostico.objects.para(workspace).create(
            contacto=contact,
            cuestionario=questionnaire,
            version=1,
            respuestas={},
            puntaje_total=4,
            puntaje_maximo=8,
            porcentaje=50,
            segmento="En desarrollo",
            puntaje_por_dimension={},
            resultado={},
        )
        other_workspace = Workspace.objects.create(
            slug="another-read-company",
            nombre="Otra empresa",
        )
        Membresia.objects.para(other_workspace).create(
            correo="foreign-member@example.com",
            rol=Membresia.Rol.USUARIO,
        )
        Contacto.objects.para(other_workspace).create(
            nombre="Prospecto de otra empresa",
            correo="foreign-prospect@example.com",
            telefono="5550000000",
            consentimiento_version="test-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        self.login(platform_user)

        console = self.client.get(reverse("consola_plataforma"))
        users = self.client.get(
            reverse("plataforma_workspace_usuarios", args=[workspace.uid])
        )
        prospects = self.client.get(
            reverse("plataforma_workspace_prospectos", args=[workspace.uid])
        )

        self.assertEqual(users.status_code, 200)
        self.assertContains(console, reverse(
            "plataforma_workspace_usuarios", args=[workspace.uid]
        ))
        self.assertContains(console, reverse(
            "plataforma_workspace_prospectos", args=[workspace.uid]
        ))
        self.assertContains(users, "Miembro consultable")
        self.assertContains(users, member_user.correo)
        self.assertNotContains(users, "foreign-member@example.com")
        self.assertContains(prospects, "Prospecto consultable")
        self.assertContains(prospects, contact.correo)
        self.assertContains(prospects, contact.telefono)
        self.assertContains(prospects, "Diagnóstico consultable")
        self.assertContains(prospects, "En desarrollo")
        self.assertContains(prospects, "50%")
        self.assertNotContains(prospects, "Prospecto de otra empresa")

        for role in (Membresia.Rol.ADMIN, Membresia.Rol.PROPIETARIO):
            with self.subTest(role=role):
                company_admin = Usuario.objects.create(
                    correo=f"{role}@another-company.example"
                )
                Membresia.objects.para(other_workspace).create(
                    correo=company_admin.correo,
                    usuario=company_admin,
                    rol=role,
                )
                self.login(company_admin)
                denied_users = self.client.get(
                    reverse(
                        "plataforma_workspace_usuarios",
                        args=[workspace.uid],
                    )
                )
                denied_prospects = self.client.get(
                    reverse(
                        "plataforma_workspace_prospectos",
                        args=[workspace.uid],
                    )
                )
                self.assertEqual(denied_users.status_code, 404)
                self.assertEqual(denied_prospects.status_code, 404)

    def test_platform_admin_clearia_membership_does_not_grant_other_workspace_data(self):
        from workspaces.services import asegurar_espacio_clearia

        platform_user = Usuario.objects.create(correo="platform@example.com")
        admin = AdminPlataforma.objects.create(usuario=platform_user)
        clearia = asegurar_espacio_clearia([admin])
        other_workspace = Workspace.objects.create(
            slug="other-company",
            nombre="Otra empresa",
        )
        Contacto.objects.para(other_workspace).create(
            nombre="Contacto ajeno",
            correo="foreign@example.com",
            telefono="5551234567",
            consentimiento_version="test-v1",
            consentimiento_fecha=timezone.now(),
            origen="test",
        )
        self.login(platform_user)

        response = self.client.get(reverse("contactos", args=[other_workspace.uid]))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(Contacto.objects.para(clearia).count(), 0)

    def test_invalid_slug_error_is_identified_with_its_field(self):
        platform_user = Usuario.objects.create(correo="platform@example.com")
        AdminPlataforma.objects.create(usuario=platform_user)
        self.login(platform_user)

        response = self.client.post(
            reverse("crear_workspace"),
            {
                "slug": "invalid_slug",
                "nombre": "New Company",
                "propietario_correo": "owner@example.com",
                "plan": "inicial",
                "color_primario": "#E2554F",
                "logo_url": "",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertContains(response, 'data-field="slug"', status_code=400)
        self.assertContains(
            response,
            "Slug (identificador de la empresa): Usa de 3 a 40 caracteres",
            status_code=400,
        )
        self.assertContains(
            response,
            "No se pudo crear la empresa. Revisa estos campos:",
            status_code=400,
        )
        self.assertFalse(Workspace.objects.exists())

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

    def test_platform_cannot_suspend_internal_diagnostic_workspace(self):
        platform_user = Usuario.objects.create(correo="platform@example.com")
        AdminPlataforma.objects.create(usuario=platform_user)
        workspace = Workspace.objects.create(
            slug="clearia",
            nombre="Clear-IA",
            plan=Workspace.Plan.INTERNO,
        )
        self.login(platform_user)

        page = self.client.get(reverse("editar_workspace", args=[workspace.uid]))
        response = self.client.post(
            reverse("editar_workspace", args=[workspace.uid]),
            {"accion": "suspender"},
        )

        self.assertContains(
            page,
            "El workspace interno del diagnóstico público debe permanecer activo.",
        )
        self.assertNotContains(page, "Suspender empresa")
        self.assertEqual(response.status_code, 404)
        workspace.refresh_from_db()
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
