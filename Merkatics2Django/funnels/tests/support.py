import json


def questionnaire_config(position="final"):
    return {
        "id": "test-questionnaire",
        "cliente": "Empresa de prueba",
        "estado": "publicado",
        "usa_scoring": True,
        "posicion_contacto": position,
        "secciones": ["Captación", "Seguimiento"],
        "bienvenida": {
            "habilitada": True,
            "titulo": "Antes de empezar",
            "descripcion": "Responde las preguntas.",
            "textoBoton": "Comenzar",
        },
        "preguntas": [
            {
                "id": "captacion",
                "texto": "¿Cómo captas prospectos?",
                "seccion": "Captación",
                "tipo": "opcion_multiple",
                "participa_scoring": True,
                "opciones": [
                    {"texto": "No hay proceso", "puntos": 0},
                    {"texto": "Tenemos un proceso", "puntos": 2},
                ],
            },
            {
                "id": "seguimiento",
                "texto": "¿Das seguimiento?",
                "seccion": "Seguimiento",
                "tipo": "opcion_multiple",
                "participa_scoring": True,
                "opciones": [
                    {"texto": "No", "puntos": 0},
                    {"texto": "Sí", "puntos": 2},
                ],
            },
        ],
        "reglas_scoring": [
            {
                "puntaje_min": 0,
                "puntaje_max": 4,
                "segmento": "segmento-privado",
            }
        ],
        "resultado": {
            "tipo": "por_segmento",
            "resultados": [
                {
                    "segmento": "segmento-privado",
                    "contenido": "Tu resultado está listo.",
                }
            ],
        },
    }


def posted_answers(first=1, second=0):
    return {
        "0": {"tipo": "opcion_multiple", "indiceOpcion": first},
        "1": {"tipo": "opcion_multiple", "indiceOpcion": second},
    }


def valid_contact_post(attempt_id, answers=None, **extra):
    return {
        "attempt_id": str(attempt_id),
        "nombre": "Nombre de prueba",
        "correo": "PRUEBA@EXAMPLE.COM",
        "telefono": "5551234567",
        "consentimiento": "on",
        "respuestas": json.dumps(answers if answers is not None else posted_answers()),
        **extra,
    }
