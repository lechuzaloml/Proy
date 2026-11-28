# Plan de migración de Clear-IA a Django

## Alcance e inspección de la fuente

La fuente es `Proy`, una aplicación React 19 + TypeScript con Vite, Firebase
Auth/Firestore/Functions y endpoints serverless TypeScript. Los cuestionarios y
metadatos viven en JSON; el cálculo de scoring, la selección de segmento, la
validación y el perfil por sección se ejecutan en el cliente. Los endpoints de
suscripción y publicación verifican tokens de Firebase en servidor.

El catálogo visible se obtiene de `src/templates/catalogo.ts`, que carga los
JSON acompañados de `.metadata.json`. En el repositorio hay nueve archivos de
metadata, aunque `DESCRIPCION_COMPLETA.txt` todavía dice que hay ocho
templates. El diagnóstico inicial se configura por separado. Los tres casos
que muestra la biblioteca son Ser Empresario, Merkatics y Caso nuevo; los JSON
auxiliares de ejemplo que no forman parte de esos tres no deben cargarse como
catálogo.

No se migran documentos ni datos de prueba de Firestore. En una fase posterior,
los JSON seleccionados de plantillas y los tres casos de referencia se cargarán
con un comando de gestión idempotente. El esquema relacional se definirá
exclusivamente con migraciones Django.

## Inventario funcional y destino

| Funcionalidad actual | Destino Django | Notas de portabilidad |
|---|---|---|
| Landing, inicio del flujo y navegación del diagnóstico | `core` + `funnels` | Conservar introducción, progreso, navegación y recuperación del flujo; separar UI de reglas. |
| Diagnóstico inicial de siete preguntas, contacto, resultado segmentado, template/plan recomendado | `funnels` + `contacts` + `subscriptions` | El diagnóstico tiene cinco preguntas puntuadas, total 0–20 y segmentos 0–6, 7–13 y 14–20. Guardar resultado y respuestas con el consentimiento del lead. |
| Biblioteca de plantillas y sus metadatos | `funnels.Template` | JSON estático versionado en Git, sembrado por comando de gestión; las plantillas son globales, no propiedad de un workspace. |
| Copias de plantilla y creación desde cero | `funnels.Funnel` | Cada copia pertenece a un workspace. Guardar configuración JSON validada, estado y creador. |
| Tipos de pregunta: opción múltiple, escala y abierta; contacto al inicio o al final | `funnels` | Preservar el formato JSON actual y validar las respuestas en el servidor. |
| Motor de puntaje, reglas de rangos, segmento y resultado fijo/segmentado | `funnels` | Portar el cálculo a Python y ejecutarlo en backend como fuente autoritativa. |
| Perfil gráfico por sección y avance de formularios | `funnels` | El backend calcula las dimensiones y porcentajes; el frontend renderiza gráfica radial, barras y accesibilidad. |
| Recomendación de template/plan y calculadora comercial | `funnels` + `subscriptions` | Trasladar las tablas de recomendación y mantener claramente el carácter ilustrativo de las estimaciones. |
| Editor de cuestionarios y validación antes de guardar | `funnels` | Mantener el contrato JSON; rechazar errores con mensajes explícitos. |
| Publicar/despublicar, versiones inmutables y URL pública | `funnels` | Snapshot de configuración por versión; una URL pública solo expone la versión publicada vigente. |
| Límites de publicación por plan | `funnels` + `subscriptions` | Inicial 3, Pro 10, Avanzado 25; plan interno sin límite. Aplicar límite dentro de transacción al publicar. |
| Página pública por empresa y por cuestionario, con marca | `workspaces` + `funnels` | Resolver por slug/UID público; nunca exponer borradores ni respuestas de otros espacios. |
| Captura, panel, filtros y orden de leads | `contacts` | Búsqueda por nombre/correo, estado, segmento, cuestionario y fecha o madurez. |
| Historial de diagnósticos y seguimientos | `contacts` | Cada diagnóstico referencia contacto, cuestionario y versión; cada seguimiento conserva tipo, nota, autor y fecha. |
| Roles y permisos de empresa | `users` + `workspaces` | Propietario, admin y usuario; permisos `verLeads`, `gestionarLeads`, `editarCuestionarios`, `publicarCuestionarios`. |
| Consola de plataforma | `users` + `workspaces` + `subscriptions` | Administrar empresas, estado, plan, marca, miembros, métricas agregadas y liberación de prueba. Vista propia, no Django admin. |
| Prueba de siete días, Stripe Checkout, webhook y portal | `subscriptions` | Stripe sandbox únicamente. Confirmar el webhook con firma y registrar idempotentemente eventos antes de cambiar estado. |
| Página completa de registro a evento / masterclass | `funnels` + `contacts` | Plantilla pública específica y registro asociado a evento; decidir en fase funcional si habrá confirmación por correo. |
| Personalización opcional de texto de resultado con Gemini | `gemini_assistant` | Enviar solo cuestionario, respuestas necesarias y resultado ya calculado; nunca correo, teléfono ni nombre. Gemini no recalcula puntaje ni segmento. |
| CRM, WhatsApp y automatizaciones anunciadas | Fuera del primer alcance funcional | No hay integración operativa en el código actual; no presentarlas como migradas hasta implementarlas. |

## Correspondencia Firestore → modelos Django propuestos

Las rutas indicadas son colecciones/documentos actuales; los nombres de modelos
son objetivos de diseño, todavía no implementados en este esqueleto.

| Firestore | Modelo propuesto | Relación / conversión |
|---|---|---|
| `empresas/{empresaId}` | `workspaces.Workspace` | Una empresa es un workspace; mover nombre, slug, estado, plan y marca. |
| `empresas/{empresaId}/miembros/{correo}` | `workspaces.Membership` | FK a Workspace y `users.User`; conservar rol, estado y permisos. Normalizar correo como identidad de Google. |
| `empresas/{empresaId}/cuestionarios/{id}` | `funnels.Funnel` | FK obligatoria a Workspace; configuración JSON validada, creador, estado y referencia a versión vigente. |
| Subcolección `versiones` / snapshots publicados | `funnels.FunnelVersion` | FK a Funnel; conservar configuración inmutable, autor y fecha de publicación. |
| `empresas/{empresaId}/leads/{leadId}` | `contacts.Contact` | FK obligatoria a Workspace; datos de contacto, consentimiento, estado, origen, último segmento/puntaje y actividad. |
| `empresas/{empresaId}/diagnosticos/{diagnosticoId}` | `contacts.Diagnostic` | FK a Contact; FK nullable o referencia preservada a Funnel/FunnelVersion para diagnóstico inicial o datos históricos. Guardar respuestas, resultado, total, máximo y perfil. |
| `empresas/{empresaId}/leads/{leadId}/seguimientos/{id}` | `contacts.FollowUp` | FK obligatoria a Contact y autor; tipo, nota, fecha de creación y próxima acción. |
| `empresas/{empresaId}/suscripcion/actual` | `subscriptions.Subscription` | Una suscripción vigente por Workspace; estado, plan/precio y customer/subscription IDs de Stripe. |
| `empresas/{empresaId}/uso/cuestionarios` | `subscriptions.WorkspaceUsage` | Contador de publicaciones por workspace; mantener con transacciones y reconciliar contra funnels publicados. |
| `pruebas/{correo}` | `subscriptions.TrialClaim` | Reclamo único por correo, workspace, fechas y eventual liberación administrativa. No almacenar secretos de Stripe. |
| `plataformaAdmins/{correo}` | `users.PlatformAdmin` | Relación uno a uno con usuario; autorización de plataforma separada de permisos de workspace. |
| JSON de `templates/` y `spec/Ejemplos/` | `funnels.Template` / datos iniciales | Sembrar únicamente las plantillas seleccionadas y los tres casos de referencia mediante comando de gestión. No son filas de migración ni datos de prueba. |

La exportación/importación de datos reales se diseñará posteriormente como
proceso separado, auditable e idempotente. No reutilizar colecciones de
Firestore como datos iniciales del esquema.

## Lógica TypeScript que debe portarse a Python

### `calcularResultado`

- Si `usa_scoring` es falso, devolver el resultado fijo configurado y no
  inventar total o segmento.
- Sumar solo preguntas con `participa_scoring`; ausencias, respuestas con tipo
  incompatible y preguntas informativas aportan cero.
- En opción múltiple tomar los puntos de la opción seleccionada; en escala,
  los puntos de `puntos_por_valor`; sin puntos configurados aportar cero.
- Elegir la primera regla cuyo intervalo inclusivo contiene el total.
- Buscar el resultado cuyo `segmento` coincide. Falta de regla o resultado es
  un error explícito, no un fallback.
- Mantener puntaje, segmento y resultado calculados por código servidor; nunca
  delegar decisiones de scoring a Gemini.

### `validarCuestionario`

- Validar objeto, identificadores y textos requeridos, estado, posición del
  formulario de contacto, secciones y tipos permitidos.
- Validar cada pregunta y sus opciones; rangos de escala, etiquetas, límites
  de caracteres y valores numéricos de puntos finitos dentro de escala.
- Evitar que preguntas participen en scoring cuando el cuestionario no puntúa.
- Para scoring exigir reglas no vacías y resultado por segmentos; sin scoring
  exigir resultado fijo y prohibir reglas de scoring.
- Validar textos de resultados y CTA (`texto` y `accion`), estilo visual y
  campos de bienvenida.
- Usar los mismos errores funcionales que espera el editor, con localización
  española. Añadir validación del servidor aunque el cliente ya valide.

### `calcularPerfilSecciones`

- Agrupar por nombre de sección; las preguntas sin sección usan el texto de la
  pregunta como nombre de dimensión.
- Con scoring, considerar solo preguntas puntuadas con máximo positivo.
  Máximo de opción múltiple = mayor puntuación de opciones; máximo de escala =
  mayor puntuación configurada dentro del rango. Porcentaje = puntos /
  máximo posible × 100, redondeado al entero más cercano; las no respondidas
  siguen en el máximo posible.
- Sin scoring, porcentaje = preguntas completas / preguntas de la dimensión ×
  100; una respuesta abierta está completa si el texto recortado no está vacío.
- Devolver modo (`puntaje` o `avance`), porcentaje y contadores. La UI solo
  muestra perfil cuando hay al menos dos dimensiones y aclara que avance no
  es una evaluación.

También se deben portar las reglas de recomendación por segmento, los límites
de plan, la consistencia de versiones publicadas, el consentimiento del lead y
las fórmulas ilustrativas de la calculadora comercial.

## Plan por fases

1. **Base (actual):** proyecto Django limpio, configuración por entorno,
   MySQL/PyMySQL, seguridad base, WhiteNoise, núcleo de UID y alcance, pruebas
   de aislamiento. Sin modelos de negocio ni autenticación.
2. **Identidad y espacios:** modelo propio de usuario, Google OAuth verificado
   en servidor, sesiones firmadas/rotadas, CSRF, cookies seguras y límites de
   intentos; workspaces, membresías, permisos y managers/querysets con scope.
3. **Cuestionarios:** modelos de templates, funnels y versiones; comando
   idempotente de carga de JSON; validador Python, editor y motor de scoring.
4. **Captura pública y contactos:** páginas públicas, diagnóstico, registro a
   evento, consentimiento, contactos/leads, diagnósticos y seguimientos;
   pruebas de aislamiento por workspace para cada ruta.
5. **Planes y consola:** planes y límites transaccionales, prueba de siete
   días, Stripe sandbox, webhooks firmados/idempotentes, portal y consola de
   plataforma.
6. **Gemini y experiencia:** redacción opcional del resultado con datos
   mínimos, calculadora/recomendaciones, perfiles y pulido de UI/accesibilidad.
7. **Despliegue:** validar runtime Python serverless/WSGI y límites vigentes de
   Vercel, variables y secretos, MySQL administrado accesible desde Vercel,
   WhiteNoise/collectstatic en build y cron solo para tareas protegidas por
   HTTP. No usar procesos residentes, hilos o escritura de archivos en runtime.

El esqueleto ya expone el callable WSGI en `api/index.py`; Vercel debe tomar
`Merkatics2Django` como raíz del proyecto. `collectstatic` se ejecuta en build,
no dentro de una petición. La función debe limitar su paquete a dependencias y
estáticos necesarios, y cada cron debe invocar rutas autenticadas; no se
mantiene ningún proceso residente.
El storage predeterminado falla explícitamente al guardar archivos; las
funciones futuras de carga deben usar almacenamiento externo y no temporales
locales del servidor.

La documentación oficial consultada (12 y 24 de agosto de 2026) indica Python
3.12/3.13/3.14 en Vercel y un máximo estándar de bundle Python de 500 MB sin
comprimir (5 GB en Large Functions beta). Los límites de duración publicados
son Hobby 300 s y Pro/Enterprise 300 s por defecto (hasta 800 s; 1.800 s en
beta); memoria 2 GB en Hobby y 4 GB en Pro/Enterprise. Volver a verificarlos al desplegar:
[runtime Python](https://vercel.com/docs/functions/runtimes/python) y
[límites de Functions](https://vercel.com/docs/functions/limitations).

## Estado de esta fase

En esta fase solo se crea el esqueleto y el núcleo abstracto. No se crean
modelos de negocio, no se importan documentos Firestore, no se configura
autenticación de producto y no se ejecutan comandos de Stripe.
