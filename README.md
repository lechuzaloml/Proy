# Clear-IA

Aplicación React + TypeScript para cuestionarios, resultados calculados y
personalización opcional de la redacción con Google Gemini.

## Preparar Gemini en desarrollo local

1. Abre `.env.local` en la raíz del proyecto.
2. Pega tu clave después de `GEMINI_API_KEY=`. No la compartas ni la pongas en
   archivos de `src/`.
3. En una terminal, ejecuta `npm install` y luego `npm run dev`.
4. Abre la dirección local que imprime la terminal (por defecto
   `http://localhost:3000`).

El servidor lee la clave únicamente desde `.env.local`; el archivo está
excluido de Git. No uses variables con prefijo `VITE_` para secretos. Si Gemini
falla o aún no hay clave, se muestra el resultado base y un aviso.
El servidor usa la API oficial de Interactions, intenta primero
`gemini-3.5-flash-lite` y usa `gemini-2.5-flash` como alternativa. Las
interacciones se envían con `store: false` para no guardar la solicitud en el
historial de interacciones de Gemini. La dependencia oficial `@google/genai`
debe permanecer en la versión 2 o superior para ser compatible con el esquema
actual de esa API.

La API recibe el cuestionario, sus respuestas y el resultado ya calculado; no
envía nombre, correo ni teléfono. Las respuestas de texto libre pueden incluir
información personal, por lo que evita compartir datos sensibles en ellas.
El scoring y la selección del segmento siguen siendo responsabilidad de la
aplicación, no de Gemini.

Para compilar, ejecuta `npm run build`. Para servir la compilación, ejecuta
`npm start` después de compilar. Antes de publicar el endpoint en internet,
configura controles de uso para evitar que terceros consuman la cuota de tu
clave.

## Publicar en Vercel

Configura `Proy` como directorio raíz del proyecto en Vercel, usa `npm run
build` como comando de compilación y `dist` como directorio de salida. Agrega
`GEMINI_API_KEY` en **Settings > Environment Variables** para cada entorno que
vayas a usar (Production, Preview o Development); no la agregues con prefijo
`VITE_`. La función `api/personalizar.ts` expone el endpoint que usa la
aplicación y lee esta variable en el servidor.
