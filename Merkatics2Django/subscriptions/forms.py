from django import forms
from django.core.exceptions import ValidationError

from subscriptions.models import PruebaUsada
from subscriptions.planes import PLANES_SUSCRIPCION
from workspaces.models import Workspace, validate_workspace_slug


class AltaSuscripcionForm(forms.Form):
    plan_id = forms.ChoiceField(
        choices=[(plan["id"], plan["nombre"]) for plan in PLANES_SUSCRIPCION],
        error_messages={"invalid_choice": "Elige un plan disponible."},
    )
    nombre = forms.CharField(max_length=80, strip=True)
    slug = forms.CharField(max_length=40, strip=True)

    def __init__(self, *args, correo, **kwargs):
        self.correo = correo.strip().lower()
        super().__init__(*args, **kwargs)

    def clean_slug(self):
        slug = self.cleaned_data["slug"].lower()
        validate_workspace_slug(slug)
        if Workspace.objects.filter(slug=slug).exists():
            raise ValidationError("Este identificador ya está en uso.")
        return slug

    def clean_nombre(self):
        nombre = self.cleaned_data["nombre"]
        if not nombre:
            raise ValidationError("Escribe el nombre de la empresa.")
        return nombre

    def clean(self):
        cleaned_data = super().clean()
        if PruebaUsada.objects.filter(correo=self.correo).exists():
            raise ValidationError(
                "Este correo ya utilizó una prueba gratuita. Inicia sesión con otro correo."
            )
        return cleaned_data
