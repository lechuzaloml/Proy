"""Límites provisionales de cuestionarios publicados por empresa."""

LIMITES_CUESTIONARIOS_PUBLICADOS = {
    "inicial": 3,
    "pro": 10,
    "avanzado": 25,
    "interno": None,
}

PLANES_SUSCRIPCION = (
    {"id": "inicial", "nombre": "Inicial", "limite": 3, "nombre_completo": "Plan Inicial"},
    {"id": "pro", "nombre": "Pro", "limite": 10, "nombre_completo": "Plan Pro"},
    {"id": "avanzado", "nombre": "Avanzado", "limite": 25, "nombre_completo": "Plan Avanzado"},
)

VALORES_PROVISIONALES = True
ETIQUETA_PRECIO_PRUEBA = "Precio de prueba: 1 USD"
ETIQUETA_MODO_PRUEBA = "Modo de prueba: no se cobra dinero real"


def plan_por_id(plan_id):
    return next((plan for plan in PLANES_SUSCRIPCION if plan["id"] == plan_id), None)


def limite_cuestionarios_publicados(plan):
    return LIMITES_CUESTIONARIOS_PUBLICADOS.get(
        plan,
        LIMITES_CUESTIONARIOS_PUBLICADOS["inicial"],
    )
