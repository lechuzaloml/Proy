
HEAD

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

Los templates pueden definir `estilo_visual` para usar controles visuales
propios (por ejemplo, escalas numéricas circulares o segmentadas). Los
cuestionarios con scoring muestran un perfil por puntos de cada sección; los
formularios y encuestas sin scoring pueden mostrar un resumen del porcentaje
de preguntas respondidas, que no representa una evaluación ni fortalezas.

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

## Base Django (migración Clear-IA)

El proyecto Django está en `Merkatics2Django`; esta base no modifica la
aplicación React/Firebase. Los comandos Django se ejecutan desde esa carpeta.
Usa Python 3.10 o superior; la versión probada para esta base es Python 3.14.

### Requisitos

- Python 3.10+.
- WampServer con MySQL iniciado.
- Una base MySQL vacía con juego de caracteres `utf8mb4`. Por ejemplo, desde
  phpMyAdmin crea `clear_ia_dev` con cotejamiento `utf8mb4_unicode_ci` y un
  usuario con permisos sobre esa base. En MySQL 8, usa el plugin de autenticación
  que esté habilitado en tu instalación (normalmente `caching_sha2_password`);
  no configures una cuenta que dependa de `mysql_native_password` si el servidor
  no carga ese plugin.
- Las credenciales de Stripe, Google OAuth y Gemini son opcionales para esta
  fase, excepto `STRIPE_SECRET_KEY`: usa un valor de prueba con prefijo
  `sk_test_`. La aplicación se niega a arrancar con claves `sk_live_`.

### Preparación en Windows PowerShell

```powershell
cd Merkatics2Django
py -3.14 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

### Activar el entorno virtual

Desde la raíz del proyecto (`PROYECTO\Proy`), entra primero en la carpeta
Django y activa su entorno virtual.

En PowerShell:

```powershell
cd Merkatics2Django
.\venv\Scripts\Activate.ps1
```

Si PowerShell bloquea la ejecución del script, puedes abrir una sesión normal
sin cambiar la configuración global del equipo:

```powershell
powershell -ExecutionPolicy Bypass -NoProfile
.\venv\Scripts\Activate.ps1
```

En Símbolo del sistema (CMD):

```bat
cd Merkatics2Django
venv\Scripts\activate.bat
```

Cuando el entorno está activo, el nombre `(venv)` aparece al inicio del
indicador de terminal. Para salir del entorno virtual, ejecuta:

```text
deactivate
```

Solo necesitas crear el entorno virtual una vez:

```powershell
py -3.14 -m venv venv
```

Edita `.env`: establece `SECRET_KEY`, `MYSQL_NAME`, `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_HOST` y `MYSQL_PORT`. No compartas ni subas `.env`.
Genera un `SECRET_KEY` local con:

```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

`STRIPE_SECRET_KEY` debe seguir comenzando con `sk_test_`; los demás valores
son marcadores de posición hasta implementar esas integraciones.

```powershell
python manage.py check
python manage.py migrate
python manage.py test --settings=config.settings_test
python manage.py collectstatic --noinput
python manage.py runserver
```

`settings_test` usa SQLite en memoria solo para pruebas unitarias; la
configuración normal siempre usa MySQL. Para instalar en otra versión de
Python, cambia `py -3.14` por la versión instalada que sea 3.10 o superior.

En esta fase no hay modelos de negocio ni migraciones de aplicación. Las
migraciones futuras se generarán con `makemigrations` y se aplicarán con
`migrate`; no se usa un archivo `.sql` como esquema.

### Stripe CLI (opcional)

Stripe CLI no forma parte de `requirements.txt`. Puede instalarse por separado
para reenviar webhooks de prueba durante una fase futura; alternativamente se
puede configurar un endpoint webhook de prueba desde el Dashboard de Stripe.

El inventario funcional, el mapeo de Firestore y el plan de fases están en
[`Merkatics2Django/docs/plan-migracion.md`](Merkatics2Django/docs/plan-migracion.md).

