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
    slug = forms.CharField(max_length=40, validators=[validate_workspace_slug])
    nombre = forms.CharField(max_length=150)
    propietario_correo = forms.CharField(max_length=191)
    plan = forms.ChoiceField(choices=Workspace.Plan.choices)
    color_primario = forms.RegexField(
        regex=r"^#[0-9A-Fa-f]{6}$",
        error_messages={"invalid": "Usa un color hexadecimal con formato #RRGGBB."},
    )
    logo_url = forms.URLField(required=False, validators=[URLValidator(schemes=["https"])])

    def clean_slug(self):
        return self.cleaned_data["slug"].strip().lower()

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
    logo_url = forms.URLField(required=False, validators=[URLValidator(schemes=["https"])])

