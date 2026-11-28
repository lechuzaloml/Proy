from users.models import Usuario


class UsuarioMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.usuario = None
        usuario_uid = request.session.get("usuario_uid")
        if usuario_uid:
            request.usuario = (
                Usuario.objects.filter(uid=usuario_uid, activo=True).first()
            )
        return self.get_response(request)
