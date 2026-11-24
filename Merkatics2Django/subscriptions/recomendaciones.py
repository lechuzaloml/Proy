from subscriptions.planes import PLANES_SUSCRIPCION


NOTA_PRECIO = "Precio de prueba: 1 USD. Los valores son provisionales."
BENEFICIOS = (
    {"texto": "Biblioteca de templates de diagnóstico (8 disponibles)", "estado": "disponible"},
    {"texto": "Cuestionarios con puntaje y resultado personalizado por segmento", "estado": "disponible"},
    {"texto": "Captura de datos de contacto de tus prospectos", "estado": "disponible"},
    {"texto": "Almacenamiento y panel de tus leads", "estado": "disponible"},
    {"texto": "Conexión con el CRM y WhatsApp de Merkatics", "estado": "proximamente"},
    {"texto": "Personalización de tus propios cuestionarios", "estado": "disponible"},
)

_PLANES = {plan["id"]: plan for plan in PLANES_SUSCRIPCION}

RECOMENDACIONES = {
    "proceso_por_construir": {
        "template_slug": "demo-onboarding-para-agencia",
        "plan_id": "inicial",
    },
    "proceso_en_consolidacion": {
        "template_slug": "demo-test-madurez-marketing-digital",
        "plan_id": "pro",
    },
    "proceso_preparado_para_crecer": {
        "template_slug": "demo-diagnostico-preparacion-comercial",
        "plan_id": "avanzado",
    },
}


def planes_recomendados():
    return [
        {
            **plan,
            "precio": "1 USD / mes",
            "nota_precio": NOTA_PRECIO,
            "beneficios": BENEFICIOS,
            "texto_boton": f"Suscribirme al {plan['nombre_completo']}",
        }
        for plan in _PLANES.values()
    ]
