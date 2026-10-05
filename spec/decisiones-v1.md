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
