# Decisiones de contrato v1

Este documento registra decisiones que aclaran el contrato funcional v1.1
sin modificar sus diez reglas.

1. **Raíz del JSON:** cada archivo JSON contiene el objeto `Cuestionario`
   directamente en la raíz. No se usa ni se acepta un envoltorio
   `{ "cuestionario": { ... } }`.
2. **Participación individual sin scoring global:** si una pregunta tiene
   `participa_scoring: true` mientras `usa_scoring: false`, el cuestionario
   se rechaza como inválido; el campo no se ignora silenciosamente.
3. **Secciones omitidas:** si no aparece la propiedad `secciones`, se trata
   como un array vacío (`[]`) y el cuestionario sigue siendo válido.
4. **Cobertura de rangos de scoring fuera del MVP:** validar que las reglas
   `reglas_scoring` no se solapen y cubran todo el puntaje posible está
   **explícitamente fuera del alcance del MVP**. No se valida en esta etapa.
5. **Puntaje y segmento internos:** el puntaje total y el segmento obtenido
   son información interna para el negocio (determinan qué resultado
   mostrar), pero nunca se muestran al usuario final que responde el
   cuestionario — evita que alguien ajuste sus respuestas a propósito para
   obtener un segmento más favorable.
6. **Figura por categoría:** la Decisión 5 se mantiene para el diagnóstico
   inicial. En el resultado de los templates se muestra la figura con el valor
   por categoría; el nombre del segmento sigue oculto.
7. **Familia de respuesta por template:** cada template de la biblioteca usa
   una sola familia de respuesta.
8. **Aislamiento multiempresa:** los leads, diagnósticos, miembros y
   cuestionarios se almacenan bajo la ruta de su empresa. La biblioteca, el
   editor y el panel usan la empresa activa; solo el diagnóstico inicial de
   Clear-IA se guarda explícitamente en `empresas/clearia`.
9. **Puntaje para el panel:** el panel administrativo puede mostrar puntaje y
   segmento del diagnóstico. La Decisión 5 aplica únicamente a quien responde.
10. **Confianza en el puntaje:** por ahora el navegador guarda directamente
    en Firestore y el puntaje no está verificado por el servidor. Antes de
    abrir el servicio a empresas externas, el guardado y el cálculo deben
    pasar a un servidor.
11. **Calificación comercial:** permanece vacía hasta que Carlos defina qué
    caracteriza a un prospecto prioritario.
12. **Identidad de membresía:** una membresía se identifica mediante el correo
     verificado y normalizado en minúsculas; el documento de miembro conserva
     ese mismo valor en su campo `correo`.
13. **Empresas suspendidas:** una empresa con estado `suspendida` no acepta
     envíos públicos de diagnósticos.
14. **Puntaje enviado por el cliente:** el puntaje calculado y enviado desde
     el navegador no está verificado por el servidor mientras el guardado siga
     ejecutándose en el cliente.
