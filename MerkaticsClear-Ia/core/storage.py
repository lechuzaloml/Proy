from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import Storage


class ExternalStorageRequired(Storage):
    def _save(self, _name, _content):
        _ = (_name, _content)
        raise ImproperlyConfigured(
            "Configura almacenamiento externo antes de aceptar archivos."
        )

    def exists(self, _name):
        _ = _name
        return False
