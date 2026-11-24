import json

from django import forms


class EditorCuestionarioForm(forms.Form):
    nombre = forms.CharField(max_length=120, strip=True)
    configuracion = forms.CharField(widget=forms.HiddenInput)

    def clean_configuracion(self):
        value = self.cleaned_data["configuracion"]
        try:
            configuration = json.loads(value)
        except (TypeError, ValueError) as error:
            raise forms.ValidationError(
                "La configuración del cuestionario no tiene un formato JSON válido."
            ) from error
        if not isinstance(configuration, dict):
            raise forms.ValidationError(
                "La configuración del cuestionario debe ser un objeto."
            )
        return configuration


class PublicSubmissionForm(forms.Form):
    attempt_id = forms.UUIDField(widget=forms.HiddenInput)
    nombre = forms.CharField(max_length=120, strip=True)
    correo = forms.EmailField(max_length=200)
    telefono = forms.CharField(min_length=5, max_length=30, strip=True)
    consentimiento = forms.BooleanField(required=True)
    respuestas = forms.CharField(widget=forms.HiddenInput)

    def __init__(self, *args, require_consent=True, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["consentimiento"].required = require_consent

    def clean_correo(self):
        return self.cleaned_data["correo"].strip().lower()

    def clean_respuestas(self):
        value = self.cleaned_data["respuestas"]
        try:
            responses = json.loads(value)
        except (TypeError, ValueError) as error:
            raise forms.ValidationError("No se pudieron leer las respuestas.") from error
        if not isinstance(responses, dict):
            raise forms.ValidationError("Las respuestas deben tener un formato válido.")
        return responses
