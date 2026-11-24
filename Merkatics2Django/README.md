# Merkatics2Django

Port Django del catálogo de cuestionarios, los flujos públicos y el panel de
contactos de Clear-IA. Las configuraciones fuente permanecen en
`Proy/templates` y `Proy/spec/Ejemplos`; este proyecto no modifica esas
carpetas.

## Preparación local

Desde `Merkatics2Django`:

1. Instala las dependencias existentes:

   ```powershell
   py -m pip install -r requirements.txt
   ```

2. Copia `.env.example` a `.env` y configura `SECRET_KEY`, las credenciales
   `MYSQL_*` de una base de desarrollo, y las claves de Stripe Sandbox:
   `STRIPE_SECRET_KEY` (debe comenzar con `sk_test_`), `STRIPE_PRICE_ID` y
   `STRIPE_WEBHOOK_SECRET`. Nunca uses una clave `sk_live_`: Django se niega a
   iniciar con ella. `STRIPE_PRICE_ID_INICIAL`, `STRIPE_PRICE_ID_PRO` y
   `STRIPE_PRICE_ID_AVANZADO` son opcionales; sin ellos, los tres planes usan
   el único precio de prueba configurado en `STRIPE_PRICE_ID`. No guardes
   secretos en el repositorio.
3. Aplica las migraciones a la base configurada:

   ```powershell
   py manage.py migrate
   ```

4. Carga o actualiza el catálogo desde las carpetas fuente hermanas del
   proyecto:

   ```powershell
   py manage.py cargar_plantillas
   ```

   El comando es idempotente. Carga ocho templates, tres casos de referencia y
   el diagnóstico publicado del workspace interno `clearia`. También asegura
   que cada administrador de plataforma tenga allí una membresía de propietario
   con todos los permisos.
5. Si necesitas crear la cuenta de plataforma inicial:

   ```powershell
   py manage.py crear_admin_plataforma admin@example.com
   ```

   Para reparar o asegurar solamente la membresía de Clear-IA sin volver a
   cargar plantillas ni diagnósticos:

   ```powershell
   py manage.py asegurar_espacio_clearia admin@example.com
   ```

   Se puede omitir el correo para asegurar las membresías de todas las cuentas
   `AdminPlataforma`. Este acceso solo habilita el workspace interno Clear-IA;
   no da acceso a contactos de otras empresas.
6. Inicia Django:

   ```powershell
   py manage.py runserver
   ```

## Rutas principales

- `/`: portada de Clear-IA.
- `/diagnostico/`: diagnóstico inicial del workspace interno.
- `/planes/`: planes recomendados según el diagnóstico.
- `/suscripcion/?plan=<plan>`: alta de empresa y Checkout de Stripe Sandbox.
- `/suscripcion/webhook/`: recepción de eventos Stripe con firma verificada e
  idempotencia.
- `/biblioteca/`: templates y casos de referencia. Los templates se pueden
  probar sin guardar datos; con membresía activa y permiso
  `editar_cuestionarios`, se pueden copiar como borrador.
- `/c/<slug>/<uid>/`: cuestionario publicado de una empresa.
- `/w/<workspace_uid>/cuestionarios/`: lista de cuestionarios, cupo publicado
  de la empresa y acciones de publicación/despublicación.
- `/w/<workspace_uid>/cuestionarios/<uid>/editar/`: edición de borradores. La
  configuración se valida en el servidor con el motor de funnels y no se
  guarda si es inválida; los cuestionarios publicados muestran que deben
  despublicarse antes de editarse.
- `/w/<workspace_uid>/`: resumen del espacio.
- `/w/<workspace_uid>/suscripcion/portal/`: portal de facturación, solo para
  propietario y administrador.
- `/w/<workspace_uid>/contactos/` y
  `/w/<workspace_uid>/contact/<uid>/`: búsqueda, diagnóstico y seguimiento de
  contactos.
- `/w/<workspace_uid>/miembros/`: invitación y permisos para propietarios y
  administradores.
- `/plataforma/`: consola de empresas para administradores de plataforma.

Los paneles requieren una membresía activa y sus permisos correspondientes. Los
objetos de workspace se consultan con alcance explícito; los enlaces públicos
usan UUID y un workspace suspendido o un cuestionario no publicado responde
404.

Los límites provisionales de cuestionarios publicados se comparten entre todos
los miembros de cada empresa: Inicial permite 3, Pro 10, Avanzado 25 e Interno
no tiene límite. Un plan desconocido usa el límite Inicial. La interfaz marca
estos valores como provisionales y muestra `Precio de prueba: 1 USD`. La
publicación y despublicación bloquean la fila del workspace dentro de una
transacción para que dos publicaciones no consuman el mismo cupo.

El diagnóstico muestra la recomendación de template, el motivo devuelto por el
resultado base y la calculadora de impacto portada de Proy. La calculadora
conserva sus valores iniciales, fórmulas, gráfica acumulada de 12 meses y texto
ilustrativo. No presenta puntaje ni segmento.

Las nuevas suscripciones usan Stripe Checkout en modo Sandbox, con una prueba
de 7 días y precio de 1 USD/mes. Esta aplicación no solicita ni almacena datos
de tarjeta. Configura en Stripe un precio recurrente de prueba de 1 USD y un
webhook que apunte a `/suscripcion/webhook/`; sus eventos deben incluir
`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated` y `customer.subscription.deleted`. La CLI de
Stripe es opcional y no se usa en las pruebas automatizadas. Para recibir eventos
en un servidor local, puedes reenviarlos con:

```powershell
stripe listen --forward-to localhost:8000/suscripcion/webhook/
```

Configura en `.env` el `whsec_...` de prueba que informa el comando; no lo
publiques. Para el pago de prueba usa `4242 4242 4242 4242`.
El correo puede utilizar una sola prueba gratuita. Al cancelarse o quedar
impaga la suscripción, la empresa se suspende y sus datos se conservan.

## Pruebas y comprobaciones

Las pruebas usan SQLite en memoria y no escriben en la base MySQL de desarrollo:

```powershell
py manage.py test --settings=config.settings_test
py manage.py check --settings=config.settings_test
py manage.py makemigrations --check --dry-run --settings=config.settings_test
```

La integración Stripe requiere la dependencia Python `stripe` declarada en
`requirements.txt`. Antes de desplegar, verifica también la base MySQL
configurada en `.env`:

```powershell
py manage.py check
py manage.py makemigrations --check --dry-run
py manage.py migrate
```
