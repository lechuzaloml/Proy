import json
from datetime import datetime, time, timedelta

from django import forms
from django.core.exceptions import ValidationError
from django.utils import timezone

from funnels.constants import DIAS_GRACIA
from funnels.models import Cuestionario, Popup


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


class PopupEventoForm(forms.ModelForm):
    cuestionario = forms.ModelChoiceField(
        queryset=Cuestionario.objects.sin_alcance().none(),
        required=False,
        label="Cuestionario publicado",
    )
    horarios_texto = forms.CharField(
        required=False,
        label="Horarios y zona horaria (uno por línea, máximo cuatro)",
        help_text=(
            "Indica la zona horaria de cada horario. "
            "Ejemplo: 10:00 a. m. (Ciudad de México). "
            "La hora no se convierte automáticamente para cada país."
        ),
        widget=forms.Textarea(attrs={"rows": 4}),
    )
    puntos_texto = forms.CharField(
        required=False,
        label="Puntos (un título y texto por línea, separados por |)",
        widget=forms.Textarea(attrs={"rows": 4}),
    )

    class Meta:
        model = Popup
        fields = (
            "titulo",
            "insignia",
            "resumen",
            "imagen_url",
            "fecha_evento",
            "horarios_texto",
            "anfitrion_nombre",
            "anfitrion_foto_url",
            "puntos_texto",
            "cuestionario",
        )
        widgets = {
            "fecha_evento": forms.DateTimeInput(
                attrs={"type": "datetime-local"},
                format="%Y-%m-%dT%H:%M",
            )
        }
        labels = {
            "titulo": "Título",
            "insignia": "Insignia",
            "resumen": "Resumen",
            "imagen_url": "Imagen (URL HTTPS)",
            "fecha_evento": "Fecha y hora del evento",
            "anfitrion_nombre": "Nombre del anfitrión",
            "anfitrion_foto_url": "Foto del anfitrión (URL HTTPS)",
        }

    def __init__(self, *args, workspace, **kwargs):
        self.workspace = workspace
        super().__init__(*args, **kwargs)
        if self.instance.workspace_id is None:
            self.instance.workspace = workspace
        self.fields["cuestionario"].queryset = (
            Cuestionario.objects.para(workspace)
            .filter(estado=Cuestionario.Estado.PUBLICADO)
            .order_by("nombre")
        )
        self.initial.setdefault(
            "horarios_texto", "\n".join(self.instance.horarios or [])
        )
        self.initial.setdefault(
            "puntos_texto",
            "\n".join(
                f"{item.get('titulo', '')}|{item.get('texto', '')}"
                for item in (self.instance.puntos or [])
                if isinstance(item, dict)
            ),
        )

    def clean_horarios_texto(self):
        values = [
            line.strip()
            for line in self.cleaned_data["horarios_texto"].splitlines()
            if line.strip()
        ]
        if len(values) > 4:
            raise ValidationError("Agrega como máximo cuatro horarios.")
        if any(len(value) > 120 for value in values):
            raise ValidationError("Cada horario admite hasta 120 caracteres.")
        return values

    def clean_puntos_texto(self):
        values = []
        for line in self.cleaned_data["puntos_texto"].splitlines():
            if not line.strip():
                continue
            title, separator, text = line.partition("|")
            if not separator:
                raise ValidationError(
                    "Escribe cada punto como título|texto, uno por línea."
                )
            values.append(
                {"titulo": title.strip(), "texto": text.strip()}
            )
        if len(values) > 4:
            raise ValidationError("Agrega como máximo cuatro puntos.")
        if any(
            not item["titulo"]
            or len(item["titulo"]) > 120
            or not item["texto"]
            or len(item["texto"]) > 400
            for item in values
        ):
            raise ValidationError(
                "Cada punto requiere título (120 caracteres) y texto (400 caracteres)."
            )
        return values

    def save(self, commit=True):
        popup = super().save(commit=False)
        popup.workspace = self.workspace
        popup.horarios = self.cleaned_data["horarios_texto"]
        popup.puntos = self.cleaned_data["puntos_texto"]
        if popup.fecha_evento:
            event_date = timezone.localtime(popup.fecha_evento).date()
            expiry_date = event_date + timedelta(days=DIAS_GRACIA)
            expiry = datetime.combine(expiry_date, time.max)
            popup.vence_en = timezone.make_aware(
                expiry, timezone.get_current_timezone()
            )
        if commit:
            popup.save()
        return popup


class MotivoRechazoPopupForm(forms.Form):
    motivo = forms.CharField(
        label="Motivo del rechazo",
        strip=False,
        widget=forms.Textarea(attrs={"rows": 5}),
    )

    def clean_motivo(self):
        motivo = self.cleaned_data["motivo"]
        if not motivo.strip():
            raise ValidationError("Escribe el motivo del rechazo.")
        return motivo


class EventoRegistroForm(forms.Form):
    prefijos = (
        ("+52", "MX +52"),
        ("+1", "US +1"),
        ("+34", "ES +34"),
        ("+57", "CO +57"),
        ("+54", "AR +54"),
        ("+56", "CL +56"),
        ("+51", "PE +51"),
    )
    nombre = forms.CharField(
        max_length=120,
        label="Nombre",
        widget=forms.TextInput(attrs={"autocomplete": "given-name"}),
    )
    apellido = forms.CharField(
        max_length=120,
        label="Apellido",
        widget=forms.TextInput(attrs={"autocomplete": "family-name"}),
    )
    correo = forms.EmailField(
        max_length=200,
        label="Correo electrónico",
        widget=forms.EmailInput(attrs={"autocomplete": "email"}),
    )
    telefono = forms.CharField(
        min_length=5,
        max_length=30,
        label="Teléfono",
        widget=forms.TextInput(
            attrs={
                "autocomplete": "tel",
                "type": "tel",
                "maxlength": 30,
                "minlength": 5,
            }
        ),
    )
    horario = forms.ChoiceField(label="Horario")
    consentimiento = forms.BooleanField(
        required=True,
        label="Acepto el aviso de privacidad y el uso de mis datos para este evento.",
    )

    def __init__(self, *args, horarios, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["horario"].choices = [
            ("", "Selecciona un horario"),
            *((horario, horario) for horario in horarios),
        ]

    def clean_correo(self):
        return self.cleaned_data["correo"].strip().lower()

    def clean(self):
        cleaned_data = super().clean()
        nombre = cleaned_data.get("nombre", "")
        apellido = cleaned_data.get("apellido", "")
        if nombre and apellido and len(f"{nombre} {apellido}") > 120:
            self.add_error(
                "apellido",
                "El nombre y apellido en conjunto admiten hasta 120 caracteres.",
            )
        return cleaned_data


class EventoGeneralDemoForm(forms.Form):
    nombre = forms.CharField(
        max_length=80,
        label="Nombre",
        widget=forms.TextInput(attrs={"autocomplete": "given-name"}),
    )
    apellido = forms.CharField(
        max_length=80,
        label="Apellido",
        widget=forms.TextInput(attrs={"autocomplete": "family-name"}),
    )
    correo = forms.EmailField(
        max_length=200,
        label="Correo empresarial",
        widget=forms.EmailInput(attrs={"autocomplete": "email"}),
    )
    lada = forms.ChoiceField(
        choices=EventoRegistroForm.prefijos,
        label="Prefijo telefónico",
    )
    telefono = forms.RegexField(
        r"^[0-9]{7,15}$",
        max_length=15,
        label="Celular",
        widget=forms.TextInput(
            attrs={
                "autocomplete": "tel",
                "inputmode": "numeric",
                "maxlength": 15,
                "placeholder": "5551234567",
                "type": "tel",
            }
        ),
        error_messages={"invalid": "Escribe un celular de 7 a 15 dígitos."},
    )
    horario = forms.ChoiceField(label="Selecciona tu horario")

    def __init__(self, *args, horarios, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["horario"].choices = [
            ("", "Selecciona una opción"),
            *((horario, horario) for horario in horarios),
        ]

    def clean_correo(self):
        return self.cleaned_data["correo"].strip().lower()


class EventoRespuestasForm(forms.Form):
    respuestas = forms.CharField(widget=forms.HiddenInput)

    def clean_respuestas(self):
        try:
            responses = json.loads(self.cleaned_data["respuestas"])
        except (TypeError, ValueError) as error:
            raise ValidationError("No se pudieron leer las respuestas.") from error
        if not isinstance(responses, dict):
            raise ValidationError("Las respuestas deben tener un formato válido.")
        return responses
