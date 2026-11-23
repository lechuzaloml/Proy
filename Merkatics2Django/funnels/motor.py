import math
from collections import OrderedDict
from collections.abc import Mapping


def _es_texto(value):
    return isinstance(value, str) and bool(value.strip())


def _es_numero(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _es_registro(value):
    return isinstance(value, Mapping)


def _validar_cta(value, path, errors):
    if not _es_registro(value):
        errors.append(f"{path} debe ser un objeto con texto y acción.")
        return False
    valid = True
    if not _es_texto(value.get("texto")):
        errors.append(f"{path}.texto debe ser un texto no vacío.")
        valid = False
    if not _es_texto(value.get("accion")):
        errors.append(f"{path}.accion debe ser un texto no vacío.")
        valid = False
    return valid


def _validar_resultado_fijo(value, errors):
    valid = True
    if not _es_texto(value.get("contenido")):
        errors.append("resultado.contenido debe ser un texto no vacío.")
        valid = False
    if "cta" in value and not _validar_cta(value["cta"], "resultado.cta", errors):
        valid = False
    return valid


def _validar_resultado_por_segmento(value, errors):
    results = value.get("resultados")
    if not isinstance(results, list):
        errors.append("resultado.resultados debe ser un array.")
        return False
    valid = True
    for index, result in enumerate(results):
        path = f"resultado.resultados[{index}]"
        if not _es_registro(result):
            errors.append(f"{path} debe ser un objeto de resultado por segmento.")
            valid = False
            continue
        if not _es_texto(result.get("segmento")):
            errors.append(f"{path}.segmento debe ser un texto no vacío.")
            valid = False
        if not _es_texto(result.get("contenido")):
            errors.append(f"{path}.contenido debe ser un texto no vacío.")
            valid = False
        if "cta" in result and not _validar_cta(
            result["cta"], f"{path}.cta", errors
        ):
            valid = False
    return valid


def _validar_pregunta(value, index, usa_scoring, errors):
    path = f"preguntas[{index}]"
    if not _es_registro(value):
        errors.append(f"{path} debe ser un objeto de pregunta.")
        return False
    valid = True
    for key in ("id", "texto"):
        if not _es_texto(value.get(key)):
            errors.append(f"{path}.{key} debe ser un texto no vacío.")
            valid = False
    if "seccion" in value and not _es_texto(value["seccion"]):
        errors.append(f"{path}.seccion debe ser un texto no vacío cuando existe.")
        valid = False
    participa = value.get("participa_scoring")
    if not isinstance(participa, bool):
        errors.append(f"{path}.participa_scoring debe ser booleano.")
        valid = False
    elif participa and not usa_scoring:
        errors.append(
            f"{path} participa en scoring, pero el cuestionario tiene usa_scoring=false."
        )
        valid = False

    tipo = value.get("tipo")
    if tipo == "opcion_multiple":
        options = value.get("opciones")
        if not isinstance(options, list) or not options:
            errors.append(
                f"{path}: la pregunta de opción múltiple no tiene una estructura válida; requiere opciones no vacías."
            )
            return False
        for option_index, option in enumerate(options):
            option_path = f"{path}.opciones[{option_index}]"
            if not _es_registro(option):
                errors.append(f"{option_path} debe ser un objeto de opción.")
                valid = False
                continue
            if not _es_texto(option.get("texto")):
                errors.append(f"{option_path}.texto debe ser un texto no vacío.")
                valid = False
            if "puntos" in option and not _es_numero(option["puntos"]):
                errors.append(f"{option_path}.puntos debe ser numérico cuando existe.")
                valid = False
    elif tipo == "escala":
        scale = value.get("escala")
        if not _es_registro(scale):
            errors.append(f"{path}.escala debe ser un objeto con min y max.")
            return False
        minimum = scale.get("min")
        maximum = scale.get("max")
        if not _es_numero(minimum):
            errors.append(f"{path}.escala.min debe ser numérico.")
            valid = False
        if not _es_numero(maximum):
            errors.append(f"{path}.escala.max debe ser numérico.")
            valid = False
        if _es_numero(minimum) and _es_numero(maximum) and minimum > maximum:
            errors.append(f"{path}.escala.min no puede ser mayor que max.")
            valid = False
        for label in ("etiqueta_min", "etiqueta_max"):
            if label in scale and not isinstance(scale[label], str):
                errors.append(f"{path}.escala.{label} debe ser texto cuando existe.")
                valid = False
        if "puntos_por_valor" in value:
            points = value["puntos_por_valor"]
            if not _es_registro(points):
                errors.append(
                    f"{path}.puntos_por_valor debe ser un objeto de valores numéricos."
                )
                valid = False
            else:
                for scale_value, score in points.items():
                    try:
                        numeric_value = float(scale_value)
                    except (TypeError, ValueError):
                        numeric_value = math.nan
                    if not math.isfinite(numeric_value) or not _es_numero(score):
                        errors.append(
                            f"{path}.puntos_por_valor[{scale_value}] debe asociar un valor de escala con puntos numéricos."
                        )
                        valid = False
                    elif (
                        _es_numero(minimum)
                        and _es_numero(maximum)
                        and (numeric_value < minimum or numeric_value > maximum)
                    ):
                        errors.append(
                            f"{path}.puntos_por_valor incluye el valor {scale_value} fuera del rango de la escala."
                        )
                        valid = False
    elif tipo == "abierta":
        if "limite_caracteres" in value and not _es_numero(
            value["limite_caracteres"]
        ):
            errors.append(
                f"{path}.limite_caracteres debe ser numérico cuando existe."
            )
            valid = False
    else:
        errors.append(
            f"{path}.tipo debe ser opcion_multiple, escala o abierta."
        )
        return False
    return valid


def validar_cuestionario(data):
    """Valida un objeto Cuestionario v1.1 en la raíz y devuelve sus errores."""
    errors = []
    if not _es_registro(data):
        return ["cuestionario debe ser un objeto."]

    valid = True
    for key in ("id", "cliente", "estado"):
        if not _es_texto(data.get(key)):
            errors.append(f"cuestionario.{key} debe ser un texto no vacío.")
            valid = False

    usa_scoring = data.get("usa_scoring")
    if not isinstance(usa_scoring, bool):
        errors.append("cuestionario.usa_scoring debe ser exactamente true o false.")
        valid = False
    if data.get("posicion_contacto") not in ("inicio", "final"):
        errors.append('cuestionario.posicion_contacto debe ser "inicio" o "final".')
        valid = False
    if (
        "personalizar_resultado_con_ia" in data
        and not isinstance(data["personalizar_resultado_con_ia"], bool)
    ):
        errors.append(
            "cuestionario.personalizar_resultado_con_ia debe ser booleano cuando existe."
        )
        valid = False
    styles = {
        "finanzas",
        "ciberseguridad",
        "liderazgo",
        "madurez-digital",
        "comercial",
        "masterclass",
    }
    if "estilo_visual" in data and (
        not isinstance(data["estilo_visual"], str)
        or data["estilo_visual"] not in styles
    ):
        errors.append("cuestionario.estilo_visual no corresponde a un estilo visual válido.")
        valid = False

    sections = data.get("secciones", [])
    if not isinstance(sections, list):
        errors.append("cuestionario.secciones debe ser un array.")
        valid = False
    else:
        for index, section in enumerate(sections):
            if not _es_texto(section):
                errors.append(f"secciones[{index}] debe ser un texto no vacío.")
                valid = False

    if "bienvenida" in data:
        welcome = data["bienvenida"]
        if not _es_registro(welcome):
            errors.append("cuestionario.bienvenida debe ser un objeto cuando existe.")
            valid = False
        else:
            for key in ("habilitada",):
                if key in welcome and not isinstance(welcome[key], bool):
                    errors.append(
                        f"cuestionario.bienvenida.{key} debe ser booleano cuando existe."
                    )
                    valid = False
            for key in ("titulo", "descripcion", "textoBoton"):
                if key in welcome and not _es_texto(welcome[key]):
                    errors.append(
                        f"cuestionario.bienvenida.{key} debe ser un texto no vacío cuando existe."
                    )
                    valid = False
            for key in ("imagen", "tiempoEstimado"):
                if key in welcome and not isinstance(welcome[key], str):
                    errors.append(
                        f"cuestionario.bienvenida.{key} debe ser un texto cuando existe."
                    )
                    valid = False

    questions = data.get("preguntas")
    if not isinstance(questions, list):
        errors.append("cuestionario.preguntas debe ser un array.")
        valid = False
    else:
        for index, question in enumerate(questions):
            if not _validar_pregunta(question, index, usa_scoring is True, errors):
                valid = False

    has_rules = "reglas_scoring" in data
    if usa_scoring is True:
        rules = data.get("reglas_scoring")
        if not has_rules:
            errors.append("Un cuestionario con scoring necesita reglas de scoring.")
            valid = False
        elif not isinstance(rules, list) or not rules:
            errors.append(
                "Un cuestionario con scoring necesita reglas de scoring en un array no vacío."
            )
            valid = False
        else:
            for index, rule in enumerate(rules):
                path = f"reglas_scoring[{index}]"
                if not _es_registro(rule):
                    errors.append(f"{path} debe ser un objeto de regla de scoring.")
                    valid = False
                    continue
                minimum = rule.get("puntaje_min")
                maximum = rule.get("puntaje_max")
                if not _es_numero(minimum):
                    errors.append(f"{path}.puntaje_min debe ser numérico.")
                    valid = False
                if not _es_numero(maximum):
                    errors.append(f"{path}.puntaje_max debe ser numérico.")
                    valid = False
                if (
                    _es_numero(minimum)
                    and _es_numero(maximum)
                    and minimum > maximum
                ):
                    errors.append(
                        f"{path}.puntaje_min no puede ser mayor que puntaje_max."
                    )
                    valid = False
                if not _es_texto(rule.get("segmento")):
                    errors.append(f"{path}.segmento debe ser un texto no vacío.")
                    valid = False
    elif has_rules:
        errors.append("Un cuestionario sin scoring no debe incluir reglas_scoring.")
        valid = False

    result = data.get("resultado")
    if not _es_registro(result):
        errors.append("cuestionario.resultado debe ser un objeto.")
        valid = False
    elif usa_scoring is True:
        if result.get("tipo") != "por_segmento":
            errors.append(
                'Un cuestionario con scoring requiere resultado.tipo="por_segmento".'
            )
            valid = False
        elif not _validar_resultado_por_segmento(result, errors):
            valid = False
    elif result.get("tipo") != "fijo":
        errors.append('Un cuestionario sin scoring requiere resultado.tipo="fijo".')
        valid = False
    elif not _validar_resultado_fijo(result, errors):
        valid = False
    return errors if not valid else []


class ErrorRespuestas(ValueError):
    pass


def validar_respuestas(cuestionario, respuestas):
    """Valida respuestas no confiables y devuelve valores legibles por índice."""
    if not isinstance(respuestas, Mapping):
        raise ErrorRespuestas("Las respuestas deben ser un objeto.")
    questions = cuestionario["preguntas"]
    normalized = {}
    expected_keys = {str(index) for index in range(len(questions))}
    if set(respuestas) - expected_keys:
        raise ErrorRespuestas("Se recibieron respuestas para preguntas desconocidas.")
    for index, question in enumerate(questions):
        raw = respuestas.get(str(index), respuestas.get(index))
        if not _es_registro(raw) or raw.get("tipo") != question["tipo"]:
            raise ErrorRespuestas(
                f"Falta una respuesta válida para la pregunta {index + 1}."
            )
        if question["tipo"] == "opcion_multiple":
            option_index = raw.get("indiceOpcion")
            options = question["opciones"]
            if (
                not isinstance(option_index, int)
                or isinstance(option_index, bool)
                or option_index < 0
                or option_index >= len(options)
            ):
                raise ErrorRespuestas(
                    f"La opción de la pregunta {index + 1} no es válida."
                )
            option = options[option_index]
            normalized[str(index)] = {
                "pregunta": question["texto"],
                "tipo": "opcion_multiple",
                "seccion": question.get("seccion", ""),
                "valor": option_index,
                "valor_legible": option["texto"],
            }
        elif question["tipo"] == "escala":
            value = raw.get("valor")
            scale = question["escala"]
            if (
                not _es_numero(value)
                or value < scale["min"]
                or value > scale["max"]
            ):
                raise ErrorRespuestas(
                    f"El valor de escala de la pregunta {index + 1} no es válido."
                )
            normalized[str(index)] = {
                "pregunta": question["texto"],
                "tipo": "escala",
                "seccion": question.get("seccion", ""),
                "valor": value,
                "valor_legible": str(value),
            }
        else:
            value = raw.get("valor")
            if not isinstance(value, str) or not value.strip():
                raise ErrorRespuestas(
                    f"Falta la respuesta abierta de la pregunta {index + 1}."
                )
            limit = question.get("limite_caracteres")
            if limit is not None and len(value) > limit:
                raise ErrorRespuestas(
                    f"La respuesta de la pregunta {index + 1} supera el límite."
                )
            normalized[str(index)] = {
                "pregunta": question["texto"],
                "tipo": "abierta",
                "seccion": question.get("seccion", ""),
                "valor": value,
                "valor_legible": value,
            }
    return normalized


def _puntos_respuesta(question, response):
    if question["tipo"] == "opcion_multiple":
        return question["opciones"][response["valor"]].get("puntos", 0)
    if question["tipo"] == "escala":
        points = question.get("puntos_por_valor", {})
        value = response["valor"]
        return points.get(str(value), points.get(_numero_como_clave(value), 0))
    return 0


def _numero_como_clave(value):
    return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value)


def _puntaje_maximo(question):
    if question["tipo"] == "opcion_multiple":
        return max(0, *(option.get("puntos", 0) for option in question["opciones"]))
    if question["tipo"] == "escala":
        minimum = question["escala"]["min"]
        maximum = question["escala"]["max"]
        points = question.get("puntos_por_valor", {})
        values = []
        for key, points_value in points.items():
            try:
                scale_value = float(key)
            except (TypeError, ValueError):
                continue
            if minimum <= scale_value <= maximum:
                values.append(points_value)
        return max(0, *values)
    return 0


def _math_round(value):
    return math.floor(value + 0.5)


def calcular_perfil_secciones(cuestionario, respuestas):
    dimensions = OrderedDict()
    uses_scoring = cuestionario["usa_scoring"]
    questions = cuestionario["preguntas"]
    for index, question in enumerate(questions):
        if uses_scoring:
            if not question["participa_scoring"]:
                continue
            maximum = _puntaje_maximo(question)
            if maximum <= 0:
                continue
        name = question.get("seccion") or question["texto"]
        dimension = dimensions.setdefault(
            name,
            {
                "puntaje": 0,
                "puntaje_maximo": 0,
                "respondidas": 0,
                "total_preguntas": 0,
            },
        )
        response = respuestas.get(str(index), respuestas.get(index))
        if uses_scoring:
            dimension["puntaje_maximo"] += maximum
            dimension["total_preguntas"] += 1
            if response is not None:
                dimension["puntaje"] += _puntos_respuesta(question, response)
                dimension["respondidas"] += 1
        else:
            dimension["total_preguntas"] += 1
            if response is not None and (
                question["tipo"] != "abierta"
                or bool(str(response.get("valor", "")).strip())
            ):
                dimension["respondidas"] += 1
    return [
        {
            "nombre": name,
            "modo": "puntaje" if uses_scoring else "avance",
            "porcentaje": min(
                100,
                max(
                    0,
                    (
                        _math_round(
                            100
                            * dimension["puntaje"]
                            / dimension["puntaje_maximo"]
                        )
                        if uses_scoring and dimension["puntaje_maximo"]
                        else (
                            _math_round(
                                100
                                * dimension["respondidas"]
                                / dimension["total_preguntas"]
                            )
                            if not uses_scoring and dimension["total_preguntas"]
                            else 0
                        )
                    ),
                ),
            ),
            "respondidas": dimension["respondidas"],
            "total_preguntas": dimension["total_preguntas"],
        }
        for name, dimension in dimensions.items()
    ]


def calcular_resultado(cuestionario, respuestas):
    questions = cuestionario["preguntas"]
    uses_scoring = cuestionario["usa_scoring"]
    if not uses_scoring:
        result = cuestionario["resultado"]
        return {
            "tipo": "fijo",
            "resultado": result,
            "puntaje_total": 0,
            "puntaje_maximo": 0,
            "porcentaje": 0,
            "segmento": "",
        }

    total = sum(
        _puntos_respuesta(
            question,
            respuestas.get(str(index), respuestas.get(index)),
        )
        for index, question in enumerate(questions)
        if question["participa_scoring"]
        and respuestas.get(str(index), respuestas.get(index)) is not None
    )
    maximum = sum(
        _puntaje_maximo(question)
        for question in questions
        if question["participa_scoring"]
    )
    rules = cuestionario.get("reglas_scoring", [])
    rule = next(
        (
            candidate
            for candidate in rules
            if candidate["puntaje_min"] <= total <= candidate["puntaje_max"]
        ),
        None,
    )
    if rule is None:
        raise ErrorRespuestas("No se encontró un segmento para el puntaje obtenido.")
    result = next(
        (
            candidate
            for candidate in cuestionario["resultado"]["resultados"]
            if candidate["segmento"] == rule["segmento"]
        ),
        None,
    )
    if result is None:
        raise ErrorRespuestas(
            "No se encontró un resultado para el segmento obtenido."
        )
    return {
        "tipo": "por_segmento",
        "resultado": result,
        "puntaje_total": total,
        "puntaje_maximo": maximum,
        "porcentaje": min(
            100, max(0, _math_round(100 * total / maximum) if maximum else 0)
        ),
        "segmento": rule["segmento"],
    }
