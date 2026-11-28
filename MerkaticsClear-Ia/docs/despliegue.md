# Despliegue y operación

## Puesta en marcha en un servidor propio

- [ ] Instalar la versión de Python fijada en `.python-version` y ejecutar
  `python -m pip install -r requirements.txt`.
- [ ] Crear MySQL 8 y un usuario con permisos sobre la base. Configurar
  `utf8mb4` y TLS si el proveedor lo requiere.
- [ ] Definir las variables de entorno indicadas abajo. En producción,
  `DEBUG` debe ser `False`; los secretos no se copian al repositorio.
- [ ] Confirmar que `Proy/templates` y `Proy/spec/Ejemplos` están disponibles
  junto al proyecto Django para cargar las plantillas fuente.
- [ ] Ejecutar en este orden:

  ```text
  python manage.py migrate
  python manage.py cargar_plantillas
  python manage.py crear_admin_plataforma <correo>
  python manage.py asegurar_espacio_clearia
  ```

- [ ] Recopilar estáticos con `python manage.py collectstatic --noinput`.
- [ ] Ejecutar `python manage.py verificar_entorno` y las pruebas.
- [ ] Configurar el dominio HTTPS en `ALLOWED_HOSTS`,
  `CSRF_TRUSTED_ORIGINS` y en la consola de credenciales de Google.
- [ ] Configurar en Stripe Sandbox el webhook descrito abajo.

## Demostración en Vercel

Este proyecto solo configura una **demostración** en Vercel; no se ha
desplegado. La base de datos debe ser externa y persistente, preferiblemente en
la misma región que la función. Asegura en el proveedor de base los límites de
conexiones y los hosts de origen autorizados. Django usa conexiones de vida
corta (`CONN_MAX_AGE=0`); no depende de un pool persistente ni de almacenamiento
local de archivos.

La configuración se apoya en el runtime Python de Vercel: detecta `manage.py`
y `WSGI_APPLICATION`, usa `api/index.py` como entrada WSGI, fija Python 3.12
con `.python-version`, y ejecuta `collectstatic` en el build. WhiteNoise queda
configurado para servir estáticos cuando se ejecuta fuera de la CDN. Las rutas
de aplicación se reescriben a la función Django existente.

En las variables de entorno de **Preview y Production**, configura las
variables requeridas de la lista siguiente; `collectstatic` carga los settings
durante el build. Establece `DEBUG=False`, dominio en `ALLOWED_HOSTS` y origen
HTTPS completo en `CSRF_TRUSTED_ORIGINS`. La URL de Vercel y el dominio propio
que utilicen Google Sign-In deben figurar entre los orígenes autorizados del
cliente OAuth de Google.

El cron de `vercel.json` llama diariamente a las 05:00 UTC
(`/cron/limpiar-temporales/`). Vercel lo ejecuta solo en producción. Envía
`Authorization: Bearer <CRON_SECRET>`; la ruta elimina sesiones vencidas e
intentos y límites de envío cuya ventana ya expiró. El cron configurado usa el
formato documentado de `vercel.json` (`path` que comienza con `/` y expresión
cron); Vercel considera los Cron Jobs una función heredada y recomienda migrar
a Schedules. No se creó ni ejecutó un despliegue.

Según la documentación oficial consultada:

- El runtime Python admite WSGI y Django; las versiones publicadas son 3.12,
  3.13 y 3.14 (3.12 es la predeterminada documentada).
- El bundle Python estándar admite hasta 500 MB sin comprimir; la opción de
  funciones grandes de hasta 5 GB está en beta.
- La duración máxima documentada es 300 s en Hobby; Pro/Enterprise tiene
  300 s por defecto, 800 s máximo y 1800 s extendido en beta.
- Cron Jobs solo se ejecutan en el deployment de producción y la función
  objetivo se especifica como `path` en la raíz.

Estas cuotas pueden cambiar según el plan y la versión de la plataforma;
confírmalas en la cuenta antes de usar la demostración. La función debe
permanecer ligera y cada instancia abre conexiones de base cortas.

Fuentes oficiales consultadas:

- [Runtime Python](https://vercel.com/docs/functions/runtimes/python)
- [Django en Vercel](https://vercel.com/docs/frameworks/full-stack/django)
- [Formato `vercel.json` y cron](https://vercel.com/docs/project-configuration/vercel-json)
- [Inicio de Cron Jobs](https://vercel.com/docs/schedules/cron-jobs/quickstart)
- [Límites de Functions](https://vercel.com/docs/functions/limitations)

## Variables de entorno

No escribas valores reales en documentación ni archivos versionados.

| Variable | Requerida | Uso |
|---|---:|---|
| `SECRET_KEY` | Sí | Clave de Django. |
| `DEBUG` | Sí en despliegue | `False` en Preview/Production. |
| `ALLOWED_HOSTS` | Sí | Hosts autorizados, separados por coma. |
| `CSRF_TRUSTED_ORIGINS` | Sí en producción | Orígenes HTTPS autorizados, separados por coma. |
| `MYSQL_NAME` | Sí | Nombre de la base MySQL. |
| `MYSQL_USER` | Sí | Usuario MySQL. |
| `MYSQL_PASSWORD` | Sí | Contraseña MySQL. |
| `MYSQL_HOST` | Sí | Host de MySQL. |
| `MYSQL_PORT` | Sí | Puerto de MySQL. |
| `MYSQL_SSL_CA` | No | Ruta al certificado CA TLS del proveedor. |
| `MYSQL_SSL` | No | Activa TLS cuando no se proporciona CA. |
| `STRIPE_SECRET_KEY` | Sí | Clave `sk_test_` de Stripe Sandbox. |
| `STRIPE_PRICE_ID` | Sí | Precio recurrente de prueba. |
| `STRIPE_PRICE_ID_INICIAL` | No | Precio sandbox específico de Inicial. |
| `STRIPE_PRICE_ID_PRO` | No | Precio sandbox específico de Pro. |
| `STRIPE_PRICE_ID_AVANZADO` | No | Precio sandbox específico de Avanzado. |
| `STRIPE_WEBHOOK_SECRET` | Sí | Secreto de firma del webhook Sandbox. |
| `GOOGLE_CLIENT_ID` | Sí para acceso Google | ID del cliente OAuth y sus orígenes autorizados. |
| `CRON_SECRET` | Sí | Token del endpoint de limpieza. |

`MYSQL_SSL_CA` tiene prioridad si se configuran ambos ajustes SSL. Si no,
`MYSQL_SSL=True` habilita TLS con los valores por defecto del conector.

## Google y Stripe Sandbox

1. En Google Cloud Console, autoriza el dominio HTTPS de la demostración como
   origen JavaScript para el cliente OAuth configurado en la aplicación.
2. En Stripe, crea un precio recurrente sandbox y un endpoint de webhook en
   `/suscripcion/webhook/`.
3. Suscribe el endpoint a `checkout.session.completed`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated` y
   `customer.subscription.deleted`.
4. Copia únicamente la clave `sk_test_`, el precio y el secreto de firma del
   entorno Sandbox a las variables del despliegue. No uses claves live.

## Pruebas y verificaciones

```powershell
python manage.py check
python manage.py makemigrations --check
python manage.py migrate
python manage.py generar_diccionario
python manage.py verificar_entorno
python manage.py test --settings=config.settings_test
```

`verificar_entorno` confirma variables requeridas sin imprimir sus valores,
conexión MySQL, `utf8mb4`, strict mode, migraciones, Sandbox y el manifiesto de
estáticos generado por `collectstatic`. El diccionario de modelos se mantiene
con `generar_diccionario`; no contiene filas ni datos personales.
