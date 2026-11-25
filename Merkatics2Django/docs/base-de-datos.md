# Diccionario de la base de datos

Documento generado desde los modelos Django con `python manage.py generar_diccionario`.
Describe estructura, no contiene filas ni datos personales.

## Creación y puesta en marcha

1. En un servidor propio, crea la base y un usuario dedicado con privilegios limitados a ella. Ejemplo para MySQL 8:

   ```sql
   CREATE DATABASE <nombre> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER '<usuario>'@'<host>' IDENTIFIED BY '<contraseña>';
   GRANT ALL PRIVILEGES ON <nombre>.* TO '<usuario>'@'<host>';
   ```

   En una base alojada, crea la base y el usuario desde el panel del proveedor; copia su host, puerto y certificado CA TLS.
2. Configura `MYSQL_NAME`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_HOST`, `MYSQL_PORT`; para TLS usa `MYSQL_SSL_CA` o `MYSQL_SSL=True`.
3. Configura los demás secretos únicamente en el entorno de ejecución; no los guardes en el repositorio.
4. Ejecuta en este orden: `migrate`, `cargar_plantillas`, `crear_admin_plataforma <correo>` y `asegurar_espacio_clearia`.
5. Para respaldo sin filas personales: `mysqldump --no-data --routines --triggers <base> > estructura.sql` y `mysqldump --no-create-info <base> django_migrations > migraciones.sql`.
6. Restaura primero `mysql <base> < estructura.sql` y después `mysql <base> < migraciones.sql`. La segunda tabla contiene solo metadatos de migración, no datos de usuarios; conserva la versión de esquema. Finalmente ejecuta `migrate` para aplicar migraciones posteriores.
7. Si solo quieres iniciar una instancia vacía, configura una base nueva sin restaurar el DDL y ejecuta `migrate` para que Django cree el esquema; no ejecutes migraciones sobre tablas ya existentes sin restaurar también su historial.

La misma configuración funciona en un servidor propio o en una base alojada; usa el host, puerto y certificado TLS que proporcione el proveedor. Los datos reales no se incluyen en el repositorio.

## Diagrama de entidades

```mermaid
erDiagram
    contacts_contacto {
        BigAutoField id
        UUIDField uid
        DateTimeField creado
        DateTimeField actualizado
        FK workspace_id
        UUIDField attempt_id
        CharField nombre
        CharField correo
        CharField telefono
        CharField consentimiento_version
        DateTimeField consentimiento_fecha
        CharField origen
        CharField estado
        FK asignado_a_id
        DateTimeField contactado_en
        DateTimeField ultima_actividad
    }
    contacts_diagnostico {
        BigAutoField id
        UUIDField uid
        DateTimeField creado
        DateTimeField actualizado
        FK workspace_id
        FK contacto_id
        FK cuestionario_id
        PositiveIntegerField version
        JSONField respuestas
        PositiveIntegerField puntaje_total
        PositiveIntegerField puntaje_maximo
        PositiveSmallIntegerField porcentaje
        CharField segmento
        JSONField puntaje_por_dimension
        JSONField resultado
    }
    contacts_limiteenviosip {
        BigAutoField id
        CharField ip_hash
        DateTimeField inicio_ventana
        PositiveSmallIntegerField cantidad
    }
    contacts_seguimiento {
        BigAutoField id
        UUIDField uid
        DateTimeField creado
        DateTimeField actualizado
        FK workspace_id
        FK contacto_id
        CharField tipo
        TextField notas
        CharField resultado
        CharField proxima_accion
        FK creado_por_id
    }
    django_session {
        CharField session_key
        TextField session_data
        DateTimeField expire_date
    }
    funnels_cuestionario {
        BigAutoField id
        UUIDField uid
        DateTimeField creado
        DateTimeField actualizado
        FK workspace_id
        CharField nombre
        CharField estado
        JSONField configuracion
        PositiveIntegerField version_actual
        FK creado_por_id
    }
    funnels_plantilla {
        BigAutoField id
        SlugField slug
        CharField nombre
        CharField formato
        CharField caso_uso
        CharField nicho
        TextField descripcion
        JSONField configuracion
        CharField tipo
    }
    funnels_popup {
        BigAutoField id
        UUIDField uid
        OneToOneField workspace_id
        CharField titulo
        CharField insignia
        CharField resumen
        CharField imagen_url
        DateTimeField fecha_evento
        DateTimeField vence_en
        JSONField horarios
        CharField anfitrion_nombre
        CharField anfitrion_foto_url
        JSONField puntos
        FK cuestionario_id
        CharField estado
        DateTimeField actualizado
    }
    funnels_versioncuestionario {
        BigAutoField id
        UUIDField uid
        DateTimeField creado
        DateTimeField actualizado
        FK workspace_id
        FK cuestionario_id
        PositiveIntegerField numero
        JSONField configuracion
        BooleanField publicada
    }
    subscriptions_eventostripe {
        BigAutoField id
        CharField stripe_event_id
        CharField tipo
        BooleanField procesado
        CharField error
        DateTimeField recibido
    }
    subscriptions_pruebausada {
        BigAutoField id
        CharField correo
        SlugField slug
        DateTimeField creada
    }
    subscriptions_suscripcionworkspace {
        BigAutoField id
        OneToOneField workspace_id
        CharField estado
        DateTimeField prueba_hasta
        CharField stripe_customer_id
        CharField stripe_subscription_id
        DecimalField precio
        DateTimeField actualizado
    }
    users_adminplataforma {
        BigAutoField id
        OneToOneField usuario_id
        DateTimeField creado
    }
    users_intentoacceso {
        BigAutoField id
        CharField ip_hash
        DateTimeField inicio_ventana
        PositiveSmallIntegerField cantidad
    }
    users_usuario {
        BigAutoField id
        UUIDField uid
        CharField correo
        CharField nombre
        CharField foto_url
        BooleanField activo
        DateTimeField creado
        DateTimeField ultimo_acceso
    }
    workspaces_membresia {
        BigAutoField id
        UUIDField uid
        DateTimeField creado
        DateTimeField actualizado
        FK workspace_id
        CharField correo
        FK usuario_id
        CharField rol
        BooleanField ver_leads
        BooleanField gestionar_leads
        BooleanField editar_cuestionarios
        BooleanField publicar_cuestionarios
        CharField estado
    }
    workspaces_workspace {
        BigAutoField id
        UUIDField uid
        SlugField slug
        CharField nombre
        CharField estado
        CharField plan
        CharField color_primario
        CharField logo_url
        DateTimeField creado
    }
    workspaces_workspaceeliminacion {
        BigAutoField id
        SlugField slug
        CharField stripe_subscription_id
        DateTimeField creada
    }
    workspaces_workspace ||--o{ contacts_contacto : "workspace_id"
    users_usuario ||--o{ contacts_contacto : "asignado_a_id"
    workspaces_workspace ||--o{ contacts_diagnostico : "workspace_id"
    contacts_contacto ||--o{ contacts_diagnostico : "contacto_id"
    funnels_cuestionario ||--o{ contacts_diagnostico : "cuestionario_id"
    workspaces_workspace ||--o{ contacts_seguimiento : "workspace_id"
    contacts_contacto ||--o{ contacts_seguimiento : "contacto_id"
    users_usuario ||--o{ contacts_seguimiento : "creado_por_id"
    workspaces_workspace ||--o{ funnels_cuestionario : "workspace_id"
    users_usuario ||--o{ funnels_cuestionario : "creado_por_id"
    workspaces_workspace ||--|| funnels_popup : "workspace_id"
    funnels_cuestionario ||--o{ funnels_popup : "cuestionario_id"
    workspaces_workspace ||--o{ funnels_versioncuestionario : "workspace_id"
    funnels_cuestionario ||--o{ funnels_versioncuestionario : "cuestionario_id"
    workspaces_workspace ||--|| subscriptions_suscripcionworkspace : "workspace_id"
    users_usuario ||--|| users_adminplataforma : "usuario_id"
    workspaces_workspace ||--o{ workspaces_membresia : "workspace_id"
    users_usuario ||--o{ workspaces_membresia : "usuario_id"
```

## `contacts_contacto` — `contacts.Contacto`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `creado` | `DateTimeField` | No | No | No | No | — |
| `actualizado` | `DateTimeField` | No | No | No | No | — |
| `workspace_id` | `ForeignKey` | No | No | No | Sí | workspaces_workspace.id (CASCADE) |
| `attempt_id` | `UUIDField(32)` | No | No | No | No | — |
| `nombre` | `CharField(120)` | No | No | No | No | — |
| `correo` | `CharField(200)` | No | No | No | No | — |
| `telefono` | `CharField(30)` | No | No | No | No | — |
| `consentimiento_version` | `CharField(40)` | No | No | No | No | — |
| `consentimiento_fecha` | `DateTimeField` | No | No | No | No | — |
| `origen` | `CharField(80)` | No | No | No | No | — |
| `estado` | `CharField(12)` | No | No | No | No | — |
| `asignado_a_id` | `ForeignKey` | Sí | No | No | Sí | users_usuario.id (SET_NULL) |
| `contactado_en` | `DateTimeField` | Sí | No | No | No | — |
| `ultima_actividad` | `DateTimeField` | No | No | No | No | — |

Índices y restricciones:

- `uniq_workspace_submission_attempt` (UniqueConstraint): workspace, attempt_id

## `contacts_diagnostico` — `contacts.Diagnostico`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `creado` | `DateTimeField` | No | No | No | No | — |
| `actualizado` | `DateTimeField` | No | No | No | No | — |
| `workspace_id` | `ForeignKey` | No | No | No | Sí | workspaces_workspace.id (CASCADE) |
| `contacto_id` | `ForeignKey` | No | No | No | Sí | contacts_contacto.id (CASCADE) |
| `cuestionario_id` | `ForeignKey` | No | No | No | Sí | funnels_cuestionario.id (PROTECT) |
| `version` | `PositiveIntegerField` | No | No | No | No | — |
| `respuestas` | `JSONField` | No | No | No | No | — |
| `puntaje_total` | `PositiveIntegerField` | No | No | No | No | — |
| `puntaje_maximo` | `PositiveIntegerField` | No | No | No | No | — |
| `porcentaje` | `PositiveSmallIntegerField` | No | No | No | No | — |
| `segmento` | `CharField(100)` | No | No | No | No | — |
| `puntaje_por_dimension` | `JSONField` | No | No | No | No | — |
| `resultado` | `JSONField` | No | No | No | No | — |

Índices y restricciones:

- `uniq_workspace_diagnosis_contact` (UniqueConstraint): workspace, contacto

## `contacts_limiteenviosip` — `contacts.LimiteEnviosIP`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `ip_hash` | `CharField(64)` | No | Sí | No | No | — |
| `inicio_ventana` | `DateTimeField` | No | No | No | No | — |
| `cantidad` | `PositiveSmallIntegerField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `contacts_seguimiento` — `contacts.Seguimiento`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `creado` | `DateTimeField` | No | No | No | No | — |
| `actualizado` | `DateTimeField` | No | No | No | No | — |
| `workspace_id` | `ForeignKey` | No | No | No | Sí | workspaces_workspace.id (CASCADE) |
| `contacto_id` | `ForeignKey` | No | No | No | Sí | contacts_contacto.id (CASCADE) |
| `tipo` | `CharField(10)` | No | No | No | No | — |
| `notas` | `TextField` | No | No | No | No | — |
| `resultado` | `CharField(200)` | No | No | No | No | — |
| `proxima_accion` | `CharField(200)` | No | No | No | No | — |
| `creado_por_id` | `ForeignKey` | Sí | No | No | Sí | users_usuario.id (SET_NULL) |

Índices y restricciones:

- Ninguno declarado.

## `django_session` — `sessions.Session`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `session_key` | `CharField(40)` | No | Sí | Sí | No | — |
| `session_data` | `TextField` | No | No | No | No | — |
| `expire_date` | `DateTimeField` | No | No | No | Sí | — |

Índices y restricciones:

- Ninguno declarado.

## `funnels_cuestionario` — `funnels.Cuestionario`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `creado` | `DateTimeField` | No | No | No | No | — |
| `actualizado` | `DateTimeField` | No | No | No | No | — |
| `workspace_id` | `ForeignKey` | No | No | No | Sí | workspaces_workspace.id (CASCADE) |
| `nombre` | `CharField(200)` | No | No | No | No | — |
| `estado` | `CharField(10)` | No | No | No | No | — |
| `configuracion` | `JSONField` | No | No | No | No | — |
| `version_actual` | `PositiveIntegerField` | No | No | No | No | — |
| `creado_por_id` | `ForeignKey` | Sí | No | No | Sí | users_usuario.id (SET_NULL) |

Índices y restricciones:

- Ninguno declarado.

## `funnels_plantilla` — `funnels.Plantilla`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `slug` | `SlugField(100)` | No | Sí | No | Sí | — |
| `nombre` | `CharField(200)` | No | No | No | No | — |
| `formato` | `CharField(100)` | No | No | No | No | — |
| `caso_uso` | `CharField(150)` | No | No | No | No | — |
| `nicho` | `CharField(150)` | No | No | No | No | — |
| `descripcion` | `TextField` | No | No | No | No | — |
| `configuracion` | `JSONField` | No | No | No | No | — |
| `tipo` | `CharField(12)` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `funnels_popup` — `funnels.Popup`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `workspace_id` | `OneToOneField` | No | Sí | No | Sí | workspaces_workspace.id (CASCADE) |
| `titulo` | `CharField(160)` | No | No | No | No | — |
| `insignia` | `CharField(100)` | No | No | No | No | — |
| `resumen` | `CharField(500)` | No | No | No | No | — |
| `imagen_url` | `CharField(2048)` | No | No | No | No | — |
| `fecha_evento` | `DateTimeField` | Sí | No | No | No | — |
| `vence_en` | `DateTimeField` | Sí | No | No | No | — |
| `horarios` | `JSONField` | No | No | No | No | — |
| `anfitrion_nombre` | `CharField(120)` | No | No | No | No | — |
| `anfitrion_foto_url` | `CharField(2048)` | No | No | No | No | — |
| `puntos` | `JSONField` | No | No | No | No | — |
| `cuestionario_id` | `ForeignKey` | Sí | No | No | Sí | funnels_cuestionario.id (PROTECT) |
| `estado` | `CharField(12)` | No | No | No | No | — |
| `actualizado` | `DateTimeField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `funnels_versioncuestionario` — `funnels.VersionCuestionario`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `creado` | `DateTimeField` | No | No | No | No | — |
| `actualizado` | `DateTimeField` | No | No | No | No | — |
| `workspace_id` | `ForeignKey` | No | No | No | Sí | workspaces_workspace.id (CASCADE) |
| `cuestionario_id` | `ForeignKey` | No | No | No | Sí | funnels_cuestionario.id (CASCADE) |
| `numero` | `PositiveIntegerField` | No | No | No | No | — |
| `configuracion` | `JSONField` | No | No | No | No | — |
| `publicada` | `BooleanField` | No | No | No | No | — |

Índices y restricciones:

- `uniq_workspace_questionnaire_version` (UniqueConstraint): workspace, cuestionario, numero

## `subscriptions_eventostripe` — `subscriptions.EventoStripe`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `stripe_event_id` | `CharField(191)` | No | Sí | No | No | — |
| `tipo` | `CharField(100)` | No | No | No | No | — |
| `procesado` | `BooleanField` | No | No | No | No | — |
| `error` | `CharField(300)` | No | No | No | No | — |
| `recibido` | `DateTimeField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `subscriptions_pruebausada` — `subscriptions.PruebaUsada`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `correo` | `CharField(191)` | No | Sí | No | No | — |
| `slug` | `SlugField(40)` | No | No | No | Sí | — |
| `creada` | `DateTimeField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `subscriptions_suscripcionworkspace` — `subscriptions.SuscripcionWorkspace`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `workspace_id` | `OneToOneField` | No | Sí | No | Sí | workspaces_workspace.id (PROTECT) |
| `estado` | `CharField(16)` | No | No | No | No | — |
| `prueba_hasta` | `DateTimeField` | No | No | No | No | — |
| `stripe_customer_id` | `CharField(255)` | No | No | No | No | — |
| `stripe_subscription_id` | `CharField(191)` | No | Sí | No | No | — |
| `precio` | `DecimalField(7, 2)` | No | No | No | No | — |
| `actualizado` | `DateTimeField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `users_adminplataforma` — `users.AdminPlataforma`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `usuario_id` | `OneToOneField` | No | Sí | No | Sí | users_usuario.id (CASCADE) |
| `creado` | `DateTimeField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `users_intentoacceso` — `users.IntentoAcceso`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `ip_hash` | `CharField(64)` | No | Sí | No | No | — |
| `inicio_ventana` | `DateTimeField` | No | No | No | No | — |
| `cantidad` | `PositiveSmallIntegerField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `users_usuario` — `users.Usuario`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `correo` | `CharField(191)` | No | Sí | No | No | — |
| `nombre` | `CharField(150)` | No | No | No | No | — |
| `foto_url` | `CharField(200)` | No | No | No | No | — |
| `activo` | `BooleanField` | No | No | No | No | — |
| `creado` | `DateTimeField` | No | No | No | No | — |
| `ultimo_acceso` | `DateTimeField` | Sí | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `workspaces_membresia` — `workspaces.Membresia`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `creado` | `DateTimeField` | No | No | No | No | — |
| `actualizado` | `DateTimeField` | No | No | No | No | — |
| `workspace_id` | `ForeignKey` | No | No | No | Sí | workspaces_workspace.id (CASCADE) |
| `correo` | `CharField(191)` | No | No | No | No | — |
| `usuario_id` | `ForeignKey` | Sí | No | No | Sí | users_usuario.id (SET_NULL) |
| `rol` | `CharField(12)` | No | No | No | No | — |
| `ver_leads` | `BooleanField` | No | No | No | No | — |
| `gestionar_leads` | `BooleanField` | No | No | No | No | — |
| `editar_cuestionarios` | `BooleanField` | No | No | No | No | — |
| `publicar_cuestionarios` | `BooleanField` | No | No | No | No | — |
| `estado` | `CharField(8)` | No | No | No | No | — |

Índices y restricciones:

- `uniq_workspace_membership_email` (UniqueConstraint): workspace, correo

## `workspaces_workspace` — `workspaces.Workspace`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `uid` | `UUIDField(32)` | No | Sí | No | No | — |
| `slug` | `SlugField(40)` | No | Sí | No | Sí | — |
| `nombre` | `CharField(150)` | No | No | No | No | — |
| `estado` | `CharField(12)` | No | No | No | No | — |
| `plan` | `CharField(10)` | No | No | No | No | — |
| `color_primario` | `CharField(7)` | No | No | No | No | — |
| `logo_url` | `CharField(2048)` | No | No | No | No | — |
| `creado` | `DateTimeField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.

## `workspaces_workspaceeliminacion` — `workspaces.WorkspaceEliminacion`

| Campo | Tipo | Nulo | Único | PK | Índice | Relación |
|---|---|---:|---:|---:|---:|---|
| `id` | `BigAutoField` | No | Sí | Sí | No | — |
| `slug` | `SlugField(40)` | No | No | No | Sí | — |
| `stripe_subscription_id` | `CharField(191)` | Sí | Sí | No | No | — |
| `creada` | `DateTimeField` | No | No | No | No | — |

Índices y restricciones:

- Ninguno declarado.
