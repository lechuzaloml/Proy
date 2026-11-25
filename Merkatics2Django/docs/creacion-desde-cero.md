# Creación de cuestionarios desde cero

## Acceso

Propietarios y administradores pueden crear desde cero desde Mis cuestionarios
y desde la Biblioteca. Un usuario también puede hacerlo si su membresía tiene
el permiso `editar_cuestionarios`. Publicar sigue siendo exclusivo del permiso
`publicar_cuestionarios`.

El límite provisional de borradores por empresa está configurado en
`subscriptions/planes.py`. Todas las operaciones usan el workspace activo y
responden 404 ante recursos ajenos.

## Editor vacío

Crear desde cero abre directamente la pantalla existente **Personaliza tu
cuestionario**, con el mismo diseño y controles que se usan para editar una
copia de biblioteca. Los campos de bienvenida y nombre empiezan vacíos, la
lista de preguntas está vacía y el administrador elige cuándo solicitar los
datos de contacto.

El administrador añade preguntas, define la familia con la primera pregunta,
y puede activar puntuación y agregar rangos y resultados. Las familias
disponibles son Sí/No, opción múltiple, escala y abierta; no se pueden mezclar
dentro del mismo cuestionario. El cuestionario no se crea hasta que el borrador
tiene una configuración válida.

## Edición y guardado

El editor reutiliza la estructura y estilos existentes. Permite editar datos
básicos, secciones, preguntas, opciones, puntos, escalas y resultados.
Las preguntas pueden ser obligatorias u opcionales, duplicarse, eliminarse y
reordenarse.

Guardar y guardar automáticamente mantienen el objeto como borrador. El motor
de Django valida la configuración antes de guardar o publicar. Los rangos de
scoring deben comenzar en cero, cubrir el máximo calculado y no tener huecos ni
traslapes.

## Resultados por dimensión

La configuración opcional `personalizacion_dimension` contiene un array con
secciones y textos `bajo`, `medio` y `alto`. El servidor calcula el porcentaje
de cada sección y selecciona bajo (hasta 33 %), medio (hasta 66 %) o alto (más
de 66 %). No se añade contenido generado por inteligencia artificial.

Esta personalización es compatible hacia atrás: las configuraciones anteriores
sin `personalizacion_dimension` siguen funcionando sin cambios.

## Publicación y duplicación

La publicación usa el servicio existente, el límite publicado del plan y el
permiso de publicación. La pantalla muestra una lista de comprobación antes de
publicar. Los borradores pueden duplicarse como nuevo borrador. Los publicados
se despublican antes de editar o eliminar.
