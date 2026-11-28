DIAGNOSTICO_CLEARIA = "diagnostico-inicial"
PUBLIC_QUESTIONNAIRE_PREFIX = "cuestionario-"
EVENT_PREFIX = "evento-"

ORIGIN_FILTERS = (
    ("todos", "Todos"),
    ("clear-ia", "Diagnóstico de Clear-IA"),
    ("publicos", "Formularios públicos"),
    ("eventos", "Eventos"),
)


def etiqueta_origen(origen):
    if origen == DIAGNOSTICO_CLEARIA:
        return "Diagnóstico de Clear-IA"
    if origen.startswith(PUBLIC_QUESTIONNAIRE_PREFIX):
        return "Formulario público"
    if origen.startswith(EVENT_PREFIX):
        return "Evento"
    return "Otro"


def filtrar_por_origen(queryset, origen):
    if origen in {"", "todos"}:
        return queryset
    if origen == "clear-ia":
        return queryset.filter(origen=DIAGNOSTICO_CLEARIA)
    if origen == "publicos":
        return queryset.filter(origen__startswith=PUBLIC_QUESTIONNAIRE_PREFIX)
    if origen == "eventos":
        return queryset.filter(origen__startswith=EVENT_PREFIX)
    return queryset.none()
