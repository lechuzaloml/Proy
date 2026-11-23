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

2. Copia `.env.example` a `.env` y configura, como mínimo, `SECRET_KEY` y las
   credenciales `MYSQL_*` de una base de desarrollo. No guardes secretos en el
   repositorio.
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
- `/biblioteca/`: templates y casos de referencia. Los templates se pueden
  probar sin guardar datos; con membresía activa y permiso
  `editar_cuestionarios`, se pueden copiar como borrador.
- `/c/<slug>/<uid>/`: cuestionario publicado de una empresa.
- `/w/<workspace_uid>/cuestionarios/`: publicación y despublicación de
  cuestionarios.
- `/w/<workspace_uid>/`: resumen del espacio.
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

## Pruebas y comprobaciones

Las pruebas usan SQLite en memoria y no escriben en la base MySQL de desarrollo:

```powershell
py manage.py test --settings=config.settings_test
py manage.py check --settings=config.settings_test
py manage.py makemigrations --check --dry-run --settings=config.settings_test
```

`requirements.txt` no requiere paquetes adicionales para estos flujos: las
funciones se implementan con Django y la biblioteca estándar.
