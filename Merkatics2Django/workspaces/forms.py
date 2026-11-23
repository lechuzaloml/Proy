from django import forms
from django.core.validators import URLValidator, validate_email

from workspaces.models import Workspace, validate_workspace_slug


class AltaMembresiaForm(forms.Form):
    correo = forms.CharField(max_length=191)
    rol = forms.ChoiceField(choices=[])

    def __init__(self, *args, roles, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["rol"].choices = roles

    def clean_correo(self):
        correo = self.cleaned_data["correo"].strip().lower()
        validate_email(correo)
        return correo


class EdicionMembresiaForm(forms.Form):
    rol = forms.ChoiceField(choices=[])
    ver_leads = forms.BooleanField(required=False)
    gestionar_leads = forms.BooleanField(required=False)
    editar_cuestionarios = forms.BooleanField(required=False)
    publicar_cuestionarios = forms.BooleanField(required=False)

    def __init__(self, *args, roles, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["rol"].choices = roles


class CrearWorkspaceForm(forms.Form):
    slug = forms.CharField(
        label="Slug (identificador de la empresa)",
        max_length=40,
        help_text=(
            "Identificador corto y único; no es el nombre visible. Usa de 3 a "
            "40 caracteres: letras, números y guiones internos. Se guarda en "
            "minúsculas. Ejemplo: acme-mexico."
        ),
    )
    nombre = forms.CharField(
        label="Nombre de la empresa",
        max_length=150,
        help_text="Nombre que verán las personas en el selector de empresas.",
    )
    propietario_correo = forms.CharField(
        label="Correo del propietario",
        max_length=191,
        help_text=(
            "Cuenta a la que se asignará el rol de propietario. Si aún no tiene "
            "cuenta, se vinculará cuando inicie sesión con Google usando este correo."
        ),
    )
    plan = forms.ChoiceField(
        label="Plan",
        choices=Workspace.Plan.choices,
        help_text="Categoría de plan que quedará asignada a la empresa.",
    )
    color_primario = forms.RegexField(
        label="Color principal",
        regex=r"^#[0-9A-Fa-f]{6}$",
        error_messages={"invalid": "Usa un color hexadecimal con formato #RRGGBB."},
        help_text="Color de marca en formato hexadecimal; por ejemplo, #E2554F.",
    )
    logo_url = forms.URLField(
        label="Logo (URL, opcional)",
        max_length=2048,
        required=False,
        validators=[URLValidator(schemes=["https"])],
        help_text=(
            "Enlace HTTPS a la imagen del logo (hasta 2048 caracteres). "
            "Puedes dejarlo vacío."
        ),
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name, field in self.fields.items():
            auto_id = self[name].auto_id
            field.widget.attrs["aria-describedby"] = (
                f"{auto_id}_help {auto_id}_errors"
            )

    def clean_slug(self):
        slug = self.cleaned_data["slug"].strip().lower()
        validate_workspace_slug(slug)
        return slug

    def clean_propietario_correo(self):
        correo = self.cleaned_data["propietario_correo"].strip().lower()
        validate_email(correo)
        return correo


class EditarWorkspaceForm(forms.Form):
    nombre = forms.CharField(max_length=150)
    plan = forms.ChoiceField(choices=Workspace.Plan.choices)
    color_primario = forms.RegexField(
        regex=r"^#[0-9A-Fa-f]{6}$",
        error_messages={"invalid": "Usa un color hexadecimal con formato #RRGGBB."},
    )
    logo_url = forms.URLField(
        max_length=2048,
        required=False,
        validators=[URLValidator(schemes=["https"])],
    )

