# Entrega técnica: backend necesario para el frontend SIPINNA

Revisión: 13 de octubre de 2026. Frontend: `SIPINNA-WEB`; backend: `go-service-sipinna`.

## Alcance y conclusión

Se compararon las llamadas reales de `src/lib/api.ts` y las pantallas con las rutas registradas en `cmd/api/main.go`, handlers, repositorios y migraciones SQL. Se revisó el código local, incluidos cambios sin commit (HEAD front `5fcc816`; HEAD backend `2a4b08d`). La revisión inicial incluyó cambios de reportes y ciudadanos que después se retiraron a petición del usuario; las secciones siguientes ya reflejan el estado posterior a esa separación (ver sección 10). Esto describe el árbol de trabajo actual, no confirma qué versión está desplegada ni qué migraciones están aplicadas en producción. No se hicieron llamadas al servidor, envíos de correo/SMS ni escrituras en la base de datos.

**Faltan tres rutas que el frontend ya consume:** `GET /cases`, `POST /cases` y `PATCH /report/:folio/case`. Además, hay que proteger el envío contra reenvíos de reportes ya publicados, devolver el folio al crear reportes, agregar datos de casos y primera atención a las respuestas, implementar recuperación por teléfono y compatibilizar las contraseñas. Autenticación, personal, invitaciones, zonas, imágenes, detalle, estados y eliminación ya tienen implementación local.

## 1. Inventario: qué pantalla llama a qué endpoint

Todas las rutas de esta tabla son relativas a `VITE_API_URL`. El cliente usa `credentials: 'include'` y la cookie `session_token`; no envía el JWT en un header Authorization. Salvo la subida de imágenes, los cuerpos son JSON.

| Pantalla / acción | Método y ruta | Petición | Respuesta consumida | Situación local |
|---|---|---|---|---|
| Restaurar sesión al abrir cualquier pantalla | `GET /auth/me` | Cookie | `{name,user_type,zone_name}` | Existe; devuelve claims que pueden estar desactualizados |
| Login por correo/teléfono | `POST /auth/login` | `{email,number,password}`; uno de los contactos es `null` | Sesión y cookie | Existe |
| Login Google, después del callback Supabase | `POST /auth/google` | `{access_token}` | Sesión y cookie | Existe |
| Cerrar sesión | `POST /auth/logout` | Sin cuerpo | Respuesta exitosa, borra cookie | Existe |
| Registro ciudadano | `POST /auth/citizen` | `{nombre,edad,genero,email,telefono,password}` | El front ignora el cuerpo y luego hace login | Existe |
| Recuperación: enviar / reenviar código | `POST /auth/password/forgot` | `{email,number}` | `{message}` | Existe únicamente para correo; teléfono da 400 |
| Recuperación: guardar contraseña | `POST /auth/password/reset` | `{email,number,code,new_password}` | `{message}` | Existe únicamente para correo |
| Leer invitación | `POST /auth/invitation` | `{token}` | `{nombre,email,rol,zona_nombre}` | Existe |
| Aceptar invitación | `POST /auth/invitation/accept` | `{token,password}` | Sesión y cookie | Existe |
| Rechazar invitación | `POST /auth/invitation/reject` | `{token}` | `{message}` | Existe; elimina la cuenta invitada |
| Crear reporte, con sesión o anónimo | `POST /report` | Ver sección 3 | `{reporte_id,folio,edit_token?}` | Existe, pero no devuelve `folio` |
| Registrar metadatos de fotos | `POST /report/:report_id/images` | `{images:[{file_name,content_type}]}` | `{success:[image_id,...]}` en orden | Existe |
| Subir cada foto | `PUT /report/:report_id/images/:image_id` | Multipart, campo `file` | Cualquier éxito 2xx | Existe |
| Enviar reporte al terminar las fotos | `PUT /report/:report_id/submit` | Sin cuerpo | Cualquier éxito 2xx | Existe; falta proteger reenvíos de reportes con dueño |
| Dashboard y tabla de reportes | `GET /report/all` o `GET /report/zone/:zone` | `VITE_REPORTS_ZONE` determina cuál | `{reports:[...]}` | Existen; faltan campos y filtro de borradores |
| Mapa: selector de zonas | `GET /zones` | Cookie | `{zones:[{id,name,municipio,latitude,longitude}]}` | Existe |
| Mapa: reportes | `GET /report/all` o `GET /report/zone/:zone` | Zona seleccionada | `{reports:[...]}` | Existen |
| Mapa: abrir / buscar por folio | `GET /report/:folio` | Folio en URL | `{report:{...datos,sighting_time,images}}` | Existe; faltan campos de casos y atención |
| Mapa: cambiar estado | `PATCH /report/:folio/status` | `{estado,motivo?}` | `{folio,estado,state_changed_at}` | Existe |
| Mapa: eliminar reporte | `DELETE /report/:folio` | Sin cuerpo | 204 | Existe; el cliente tolera respuesta vacía |
| Mapa: catálogo de casos | `GET /cases` | Cookie | `{cases:[...]}` | **Falta** |
| Mapa: crear caso y agrupar reporte | `POST /cases` | `{name,folios:[...]}` | `{case:{...}}` | **Falta** |
| Mapa: agregar / quitar reporte de caso | `PATCH /report/:folio/case` | `{case_id:uuid}` o `{case_id:null}` | `{folio,case_id,case_name}` | **Falta** |
| Dashboard: administrar personal | `GET /admin/staff` | Cookie | `{staff:[...]}` | Existe |
| Dashboard: crear personal | `POST /admin/staff` | `{nombre,rol,zona_id,email,telefono}` | `{staff:{...}}` | Existe; envía invitación por correo |
| Dashboard: cambiar rol/zona/activar/suspender | `PATCH /admin/staff/:id` | `{rol?,zona_id?,estado_cuenta?}` | `{staff:{...}}` | Existe |
| Dashboard: reenviar invitación | `POST /admin/staff/:id/invitation` | Sin cuerpo | `{message}` | Existe |

`GET /report` ya existe para obtener los reportes del ciudadano, pero **no hay método en el cliente ni pantalla que lo consuma**. La página `/inicio` es informativa. La promesa del formulario “puedes consultar su estado desde tu cuenta” requiere también implementación de frontend; otro endpoint de backend no la resuelve por sí solo.

## 2. Endpoints faltantes de casos — prioridad alta

Origen: `src/lib/api.ts` (`getCases`, `createCase`, `setReportCase`) y `src/pages/InteractiveMap.tsx` (`CaseForm`). No existen rutas, handlers ni repositorios de casos en el backend. La base sí tiene `casos` y `reportes.caso_id`, pero `casos` todavía no tiene `zona_id`.

### Contrato de un caso

```json
{
  "id": "uuid",
  "name": "Calle Hidalgo esquina Juárez",
  "zone_id": "uuid",
  "report_count": 2,
  "created_at": "2026-10-13T16:00:00Z"
}
```

El tipo del front admite `zone_id:null`. Se recomienda que los casos nuevos tengan una zona obligatoria: un caso agrupa una misma situación en un lugar, y los permisos de alimentadores dependen de la zona. Esta regla y el tratamiento de casos históricos son decisiones de implementación propuestas, no reglas ya implementadas.

### GET /cases

- Exigir sesión y personal activo mediante `requireActiveStaff`.
- Administrador: todos los casos. Alimentador: solo los casos de su zona. Ciudadano: 403.
- Responder 200 `{"cases":[...]}`; lista vacía `[]`.
- Calcular `report_count` a partir de reportes asociados, sin contador editable por el cliente. Usar `LEFT JOIN` para conservar casos vacíos.
- El front carga el catálogo completo permitido una vez; no manda filtro de zona ni paginación. Si se agrega paginación, adaptar también el cliente.

### POST /cases

Petición: `{"name":"Calle Hidalgo esquina Juárez","folios":["RIETI-...-000001"]}`.

- Validar nombre después de trim, lista no vacía y folios existentes; establecer un máximo razonable para nombre y lista.
- El front envía un folio, pero el contrato permite varios. Deduplicar folios.
- Resolver la zona a partir de los reportes; el cliente no manda `zone_id`.
- Propuesta: rechazar reportes de distintas zonas y reportes DRAFT. Comprobar acceso a **todos** los folios antes de modificar.
- Crear caso y asignar reportes dentro de una transacción, bloqueando reportes en un orden estable. Un fallo debe revertir todo.
- Propuesta: si algún reporte ya pertenece a otro caso, devolver 409; evitar moverlo silenciosamente al crear un caso.
- Responder 201 `{"case":{...}}` con conteo real, por ejemplo 1. El front pone temporalmente el conteo local en cero y después suma la asociación; el backend debe seguir devolviendo el conteo correcto.

### PATCH /report/:folio/case

Petición: `{"case_id":"uuid"}` para asociar; `{"case_id":null}` para desasociar. Diferenciar propiedad ausente (400) de `null` explícito.

- Validar personal activo, reporte accesible y caso destino accesible.
- Propuesta: exigir que reporte y caso sean de la misma zona; rechazar DRAFT.
- Actualizar `reportes.caso_id` y `updated_at` en transacción, con bloqueo del reporte. Repetir la misma asociación debe ser idempotente.
- Responder 200 `{"folio":"RIETI-...","case_id":"uuid","case_name":"Calle Hidalgo esquina Juárez"}`; al quitar, ambos campos de caso son `null`.
- Errores: 400 datos inválidos; 401 sin sesión; 403 rol no autorizado; 404 recurso inexistente o fuera del alcance; 409 conflicto de zona/asociación según la regla elegida; 500 fallo interno. Formato `{"error":"mensaje"}`.

### Persistencia y lectura

Agregar una migración nueva (sin editar migraciones ya aplicadas) con `casos.zona_id`, FK a `zonas` e índice. Rellenar casos existentes que tengan una sola zona a partir de sus reportes; resolver explícitamente casos vacíos o con reportes de múltiples zonas antes de imponer NOT NULL. El índice `reportes(caso_id)` ya existe.

Crear `internal/models/case.go`, `internal/repository/case_repository.go` e `internal/handlers/case_handler.go`; registrar rutas en `cmd/api/main.go`. Ampliar `IndividualReport` y las consultas de listado y detalle con `case_id` nullable y `case_name` nullable mediante LEFT JOIN a `casos`. La asociación tiene que persistir y verse igual al recargar mapa, abrir detalle y consultar otra zona.

## 3. Flujo de creación de reportes — corregir antes de liberar

### 3.1 Envío: evitar reenvíos y conservar compatibilidad con DRAFT

Después de la separación de cambios, `UpdateReportDraft` volvió a HEAD: comprueba imágenes pendientes, pero ya no exige historial vacío. Por tanto, **el conflicto con el trigger DRAFT señalado en la revisión inicial ya no está presente en el código actual**. El trigger `migrations/000002_create_report_triggers.up.sql` sigue insertando el estado inicial DRAFT.

Ahora queda otra tarea: para reportes con ciudadano dueño, `requireReportEditor` verifica propiedad pero no exige que el último estado siga en DRAFT. El dueño puede volver a enviar un reporte ya atendido y agregar otra transición a `registrado`; también puede intentar registrar/subir más imágenes después del envío. Los anónimos ya tienen comprobación DRAFT/token.

Solución recomendada: exigir último estado DRAFT también al dueño, tanto con fila inicial como con fallback sin historial. En una transacción: bloquear reporte, verificar dueño/token y estado, comprobar imágenes registradas, insertar `registrado`, limpiar `temp_key` y confirmar. Serializar también registro/subida de imágenes respecto del envío: comprobar permisos fuera de la transacción deja una ventana entre la comprobación y la escritura.

No recuperar literalmente la condición `NOT EXISTS(historial_estados)` del stash: chocaría de nuevo con el trigger inicial. Implementar la protección mirando el **último estado**, no la ausencia de historial.

Mapear “ya enviado” e “imágenes pendientes” a 409, ID inválido a 400 y reporte inexistente a 404. Para reintentos tras una respuesta perdida, definir un resultado idempotente verificable por el dueño; si es anónimo, conservar una credencial de comprobación con vigencia limitada o diseñar otra prueba de propiedad. Actualmente el envío borra `temp_key` y el reintento anónimo ya no puede autenticarse.

### 3.2 Devolver folio al crear

El SQL genera folio, pero `CreateReport` solo usa `RETURNING id` y el handler responde `{reporte_id,edit_token?}`. `NewReport.handleSend` espera `created.folio`, por lo que la pantalla de confirmación pierde el folio.

Cambiar a `RETURNING id,folio`, escanear ambos y responder:

```json
{"reporte_id":"uuid","folio":"RIETI-MUNICIPIO-2026-000001","edit_token":"uuid-solo-si-es-anonimo"}
```

El ID UUID se usa para fotos y submit; el folio se usa para lectura, estados, casos y borrado. No intercambiarlos.

### 3.3 Validación y datos del formulario

`POST /report` recibe `description`, `latitude`, `longitude`, `children_quantity`, `children_age`, `work_type`, `sighting_time`. La web manda cantidad **1**, rangos de edad y varias modalidades separadas por coma. Dirección y condición vienen concatenadas dentro de `description`; no requiere endpoints de dirección o condición.

Agregar validación server-side: descripción, coordenadas válidas, cantidad positiva, rango de edad/modalidades aceptadas y formato de hora `YYYY-MM-DDTHH:mm`. Conservar el contrato actual para no romper clientes. Definir cómo interpretar esa hora local, por ejemplo America/Mexico_City, si luego se transforma a timestamp.

La zona se asigna actualmente por centro más cercano (haversine), sin verificar que el punto esté dentro del municipio. Tener zonas sembradas y con coordenadas es requisito para crear reportes. Si se necesita pertenencia territorial exacta, hará falta una regla por polígonos; es una mejora de negocio, no un endpoint que el front ya esté llamando.

### 3.4 No publicar borradores en listados de personal

`GetReportsByZone`, usado también por `/report/all`, no excluye DRAFT. El front normaliza estados desconocidos como `registrado`, por lo que borradores incompletos pueden sumar KPIs y aparecer en el mapa como enviados. Filtrar último estado distinto de DRAFT en los listados del personal y evitar que el PATCH de estados pueda enviar un borrador saltándose la comprobación de imágenes. Definir igual restricción para detalle de personal; el dueño puede conservar acceso a su borrador.

### 3.5 Imágenes

La web limita a 5 fotos y 10 MB por foto, pero **los controles equivalentes del backend se retiraron y quedan pendientes**. Implementar máximo 5 fotos acumuladas por reporte, límite de request multipart con margen para headers, máximo 10 MB por archivo y tipos JPEG/PNG/WebP/HEIC/HEIF. Ya existe control por dueño o X-Edit-Token y respuesta exitosa si la imagen estaba registrada; falta exigir DRAFT al dueño. El paso de fotos del front es opcional; permitir submit sin imágenes. Al registrar fotos en varias llamadas, calcular `orden` a partir de las existentes y bloquear el reporte para no repetir posiciones ni exceder el máximo en concurrencia.

Lectura: `GetReportByFolio` firma URLs con el bucket literal `sipinna-photos`, pero subida y eliminación usan el bucket configurado. Usar `SIPINNA_BUCKET` también al firmar, y devolver solo imágenes con estado `registrado`. Si se cambia de bucket, el detalle no debe romperse. Las URLs duran 15 minutos; para renovarlas el front puede volver a pedir detalle.

## 4. Datos faltantes del dashboard

### Primera atención

`src/lib/dashboardStats.ts` consume `first_attention_at` para calcular promedio de primera atención. El backend no tiene ese campo en `IndividualReport` ni en consultas. Sin él, el indicador no tiene datos.

Definición propuesta para implementar y confirmar con negocio: primera fecha de transición a `en_revision`, `en_seguimiento`, `canalizado` o `concluido`. Obtener `MIN(changed_at)` de esos estados por reporte; devolver timestamp ISO o `null` si nunca fue atendido. No usar el último cambio: perdería la primera atención al mover nuevamente el reporte. Agregar el campo a listado y detalle; se puede calcular desde historial sin columna nueva.

El dashboard calcula los demás KPIs en el navegador a partir de la lista: estados, antigüedad, zona, edades, modalidades, series mensuales y duración hasta último cambio de reportes canalizados/concluidos. **No requiere hoy un `/dashboard/stats` ni endpoints de gráficas.** Si se introduce paginación server-side, esos cálculos deben adaptarse para no medir solo una página.

### Sospecha

El worker ya analiza reportes enviados con Jev/TypeSafe; requiere `TYPESAFE_API_KEY`. Listado transforma puntaje pendiente `NULL` a 0, mientras detalle conserva `null`; el tipo TypeScript declara `number`. Esto puede mostrar “legítimo” aunque aún no haya análisis.

Recomendación coordinada: conservar `suspicius_level:number|null` en ambos y adaptar front para “pendiente de análisis”; no contar pendientes como verdaderos. Conservar el nombre actual `suspicius_level` (aunque esté mal escrito) para compatibilidad. El puntaje es una estimación de sospecha; la etiqueta “falso” del front se basa en un umbral, no en verificación humana.

## 5. Recuperación por teléfono y contraseñas

### SMS — funcionalidad prometida y actualmente ausente

`ForgotPassword.tsx` acepta correo o teléfono y llama a los endpoints existentes. `passwordResetEmail` rechaza todo teléfono con 400. No falta otra ruta: falta completar ambas rutas actuales para el canal SMS.

Seleccionar proveedor SMS y agregar configuración/cliente; normalizar teléfono a E.164 y buscar por teléfono. Reutilizar OTP de seis dígitos almacenado como hash, vencimiento de 10 minutos, cooldown de 1 minuto, límite de intentos y consumo atómico existentes. Invalidar código anterior al reenviar; descartar código si falla el envío. Dar respuesta genérica para cuenta inexistente, conservar restricciones de cuentas invitadas y aceptar el mismo contacto en `/reset`. Actualizar mensaje genérico para no referirse solo al correo.

El botón “Validar código” del front solo verifica que haya seis dígitos; el backend valida autenticidad al guardar la contraseña. No falta un endpoint de verificación para el flujo actual. Si se quiere validar antes de mostrar la contraseña, eso requiere nueva llamada y adaptación del front.

### Política de contraseñas — incompatibilidad real

Frontend `src/lib/passwordPolicy.ts`: 10–128 caracteres Unicode, una mayúscula y un símbolo; conserva espacios. Backend registro, invitación y reset: mínimo 6 bytes y bcrypt directo. Go bcrypt rechaza contraseñas de más de 72 bytes, por lo que contraseñas que la web acepta pueden fallar con 500, incluso antes de 72 caracteres si tienen Unicode.

Implementar un validador compartido para registro, aceptación y reset. Decidir una estrategia compatible con el rango prometido (por ejemplo un formato de hash versionado que soporte contraseñas largas), manteniendo verificación de hashes bcrypt existentes en login. Otra opción es reducir y comunicar el límite en frontend según bytes. **No truncar silenciosamente.** Devolver 400 con mensaje claro para violaciones de política. No aplicar la nueva política al login de contraseñas históricas válidas.

## 6. Sesiones y configuración

`GET /auth/me` devuelve rol, nombre y zona del JWT emitido por siete días. Si se cambia rol/zona o se suspende una cuenta desde StaffManager, la interfaz restaurada puede conservar los datos viejos. Los handlers de personal ya verifican estado y zona actuales en BD; mantener ese control. Cambiar `/auth/me` para leer usuario/rol/zona actuales, rechazar cuentas suspendidas o borradas y, si procede, renovar claims/cookie. Verificar que una suspensión deje de restaurar sesión de personal y que un cambio de zona se refleje al recargar. El front además debe restringir sus rutas de personal por rol: `ProtectedRoute` actualmente solo exige sesión.

Configuración a comprobar sin compartir valores secretos:

| Variable / servicio | Funcionalidad |
|---|---|
| Front `VITE_API_URL` | Base de todas las llamadas a Go |
| Backend `DATABASE_URL`, `PORT`, `JWT_SECRET` | BD, servidor y sesión |
| Backend `FRONTEND_URL` | Origen CORS y URL de enlaces de invitación |
| Backend `SIPINNA_BUCKET` y credenciales/región AWS | Subir, leer y borrar fotos |
| Backend `SIPINNA_RESEND_API_KEY`, `SIPINNA_RESEND_FROM` | Recuperación por correo e invitaciones; remitente verificado |
| Backend `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Validar login Google |
| Front `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | OAuth Google/PKCE y callback |
| Backend `TYPESAFE_API_KEY` | Worker de análisis de sospecha |
| Front `VITE_MAP_BOX_TOKEN` | Mapas y geocodificación |
| Front `VITE_REPORTS_ZONE` (opcional) | Filtra dashboard/tabla por UUID o municipio |
| Nuevo proveedor SMS | Recuperación por teléfono |

CORS ya permite credenciales y X-Edit-Token. Comprobar origen real, HTTPS y cookie `HttpOnly; Secure; SameSite=None` en el navegador del despliegue. Confirmar también callback OAuth `/auth/callback` autorizado en Supabase y proveedor Google. No cambiar de mecanismo de autenticación para conectar los endpoints nuevos.

## 7. Dependencias directas del front y ajustes que no son de backend

- Mapbox: estilos/mapa estático y `/search/geocode/v6/forward` y `/reverse`. Se consultan directamente desde navegador.
- INEGI: `https://gaia.inegi.org.mx/wscatgeo/v2`, catálogo `/mgem/15` y contornos `/geo/mgee/15`, `/geo/mgem/:cvegeo`.
- Supabase: OAuth y canje PKCE; luego se canjea el access token con Go.
- Enlace a Google Maps: navegación con coordenadas, no endpoint de Go.
- CSV y PDF: se generan en el navegador (`src/lib/reportExport.ts`); no faltan rutas de exportación.
- Tabla: filtros, orden y paginación se ejecutan localmente. La API debe entregar todos los registros autorizados con el contrato actual.
- Casos en mapa: hoy se muestran casos de todas las zonas visibles al administrador; si backend exige misma zona, filtrar opciones del selector según zona del reporte. Al borrar un reporte, `handleDeleted` tampoco actualiza `report_count` local: recargar casos o descontar asociación.
- Consulta ciudadana: agregar consumo de `GET /report` y una vista de sus reportes/detalles. El contrato existente de resumen usa `report_state`, no `last_state`.

## 8. Orden de implementación y criterios de entrega

1. **Integridad del reporte:** proteger DRAFT/submit contra reenvíos, devolver folio, recuperar límites de fotos y orden acumulado, serializar envío y fotos, excluir borradores de vistas de personal.
2. **Casos:** migración de zona, tres rutas, permisos, transacciones y campos de asociación en listado/detalle.
3. **Datos y compatibilidad:** primera atención, bucket configurable, contraseña y distinción de sospecha pendiente.
4. **Recuperación completa:** SMS en las dos rutas y pruebas con proveedor.
5. **Sesión e integración:** `/auth/me` actualizado, configuración real y ajustes de frontend identificados.

Pruebas de aceptación a realizar por quien implemente (no ejecutadas en esta revisión):

- Crear BD con todas las migraciones desde cero; crear reporte y enviarlo sin fotos y con fotos. La confirmación debe mostrar folio.
- Repetir como ciudadano y anónimo; comprobar que otra cuenta o token no pueda registrar/subir fotos ni enviar ese borrador. Reporte ya enviado no vuelve a DRAFT.
- Simular dos submits y registro/subida concurrentes; no duplicar transición ni dejar imágenes pendientes en un reporte publicado. Probar reintento tras respuesta perdida.
- DRAFT no aparece en mapa/dashboard/tabla y no cuenta en KPIs.
- Crear caso, asociar dos reportes, quitar uno y recargar. Conteos y campos deben coincidir en GET cases, listado y detalle. Probar rollback con un folio inválido y acceso entre zonas.
- Alimentador no accede a casos/reportes de otra zona; ciudadano no usa casos/personal/cambios de estado. Administrador accede a todas las zonas.
- Primera atención queda fija después de cambios sucesivos; reporte nunca atendido tiene `null`.
- Recuperación por correo y teléfono: código correcto, inválido, vencido, reenviado, consumido y bloqueado por intentos; error de proveedor.
- Registro/reset/invitación con contraseñas Unicode y largas dentro del límite acordado; login con hashes antiguos.
- Cambiar zona/rol/suspender personal y restaurar sesión; comprobar datos y permisos actuales.
- Bucket de prueba distinto de `sipinna-photos`: subir, abrir detalle, ver foto y eliminar.
- Probar en origen HTTPS final cookie, CORS, login Google, invitaciones y recuperación. Confirmar versión y migraciones desplegadas antes de declarar completo.

## 9. Archivos de referencia

Frontend: `src/lib/api.ts` (contratos), `src/pages/NewReport.tsx` (secuencia de envío), `src/pages/InteractiveMap.tsx` (casos/estados/detalle), `src/lib/dashboardStats.ts` (KPIs), `src/pages/ForgotPassword.tsx`, `src/lib/passwordPolicy.ts`, `src/components/StaffManager.tsx`, `src/context/AuthContext.tsx`.

Backend: `cmd/api/main.go` (rutas), `internal/handlers/report_handler.go`, `internal/repository/report_repository.go`, `internal/models/report.go`, `internal/handlers/password_reset_handler.go`, `internal/handlers/user_handler.go`, `internal/handlers/invitation_handler.go`, `internal/handlers/staff_handler.go`, `internal/handlers/s3_bucket_handler.go`, `internal/analysis/worker.go` y `migrations/000001_create_whole_database.up.sql` / `000002_create_report_triggers.up.sql`.


## 10. Cambios retirados del backend y convertidos en pendientes

Separación realizada el 13 de octubre de 2026, a petición del usuario. Se creó primero un respaldo completo, incluyendo archivos nuevos, y luego se recuperaron únicamente los cambios relacionados con correos e invitaciones. El frontend no se revirtió.

**Respaldo Git:** stash con mensaje `Respaldo antes de separar correos e invitaciones de pendientes backend 2026-10-13`; identificador permanente `ea4206c31a0a46f060e8cd1a7203d0f7517506e0` (al crearlo era `stash@{0}`). Contiene el estado completo anterior, incluidas las invitaciones que siguen en el árbol de trabajo. Consultar `git stash show -p ea4206c31a0a46f060e8cd1a7203d0f7517506e0`; no aplicar el stash entero sin revisar, porque reintroduce todos los cambios y puede generar conflictos con los archivos conservados.

### Conservado en el árbol de trabajo

- Plantilla HTML de correo, renderizado de recuperación e invitación, envío con Resend y pruebas de plantillas (`internal/resend/*`).
- Rutas y handlers para consultar, aceptar, rechazar y reenviar invitaciones; token con hash, vencimiento y persistencia (`invitation_handler.go`, `invitation_repository.go`, `cmd/api/main.go`).
- Alta de personal sin contraseña, correo obligatorio, cuenta pendiente hasta aceptar, `invitacion_pendiente` en la respuesta y bloqueo de activación manual previa a aceptar (`staff_handler.go`, `staff_repository.go`).
- Retiro de las antiguas rutas de autoalta/activación directa de admin para utilizar el flujo de invitación (`/auth/admin`, `/admin/:id/status-accepted`) y sus funciones de repositorio.
- Login compatible con `password_hash` NULL de una cuenta invitada, negativa a emitir sesión de personal no activado y bloqueo de recuperación de contraseña antes de aceptar invitación. Son dependencias del flujo conservado.

### Pendientes retirados (implementar posteriormente)

| Archivo / funcionalidad | Qué volver a implementar y por qué | Criterio de aceptación |
|---|---|---|
| `internal/handlers/report_handler.go`: dueño del reporte | Solo asignar `ciudadano_id` si `user_type == citizen`; los reportes hechos por personal deben ser anónimos y devolver edit token. Actualmente HEAD toma cualquier user_id y un admin puede violar la FK a ciudadanos. | Ciudadano crea con dueño; personal y usuario sin sesión crean sin FK inválida y continúan con token. |
| `report_handler.go`: editor y envío | Exigir DRAFT al dueño antes de registrar/subir imágenes o submit, con controles transaccionales. | No modificar imágenes ni regresar a registrado un reporte ya enviado/atendido. |
| `internal/repository/report_repository.go`: submit | Recuperar protección contra envío repetido usando último estado DRAFT. La condición retirada de historial vacío era incompatible con el trigger y **debe rediseñarse**. | BD creada con migraciones acepta primer envío y serializa reintentos/concurrencia sin duplicar historial. |
| `report_handler.go`: registrar imágenes | Rechazar lista vacía, validar MIME permitido y dar error claro al superar máximo. | JPEG/PNG/WebP/HEIC/HEIF aceptados; tipo no admitido/lista vacía rechazados con 400. |
| `report_repository.go`: cantidad y orden de fotos | Recuperar `MaxReportImages=5`, conteo acumulado, bloqueo del reporte y `orden=existentes+índice`. | Dos llamadas no chocan en UNIQUE(reporte_id,orden); dos llamadas concurrentes no superan 5 fotos. |
| `internal/handlers/s3_bucket_handler.go`: tamaño de archivo | Recuperar `MaxImageBytes=10 MiB`, `http.MaxBytesReader` y validación file.Size. | Foto o request demasiado grande devuelve 413 y no se sube. |
| Reportes y S3: errores y logs | Sustituir errores internos expuestos o serializados como objetos por mensajes estables en `{error}` o `message`; registrar detalles solo en logs y retirar prints de depuración. | Error legible en frontend; sin detalles SQL/AWS ni logs de depuración innecesarios. |
| `internal/handlers/user_handler.go`: registro ciudadano | Recuperar clave JSON `error` (HEAD usa `erroruwu` en error de binding), tratar SQLSTATE 23505 como 409 y devolver mensajes genéricos con detalle en log. | Formulario muestra error de validación y duplicado legibles; no recibe error SQL. |
| `user_handler.go`: nombre al registrarse | Pasar `newUser.Name` a `respondWithToken` en vez de `change_later`. | Cookie y respuesta de registro incluyen nombre real; `/auth/me` inmediato lo refleja. |
| `internal/models/report.go` y `internal/models/user.go` | Corregir etiqueta `db: "created_at"` a `db:"created_at"`. Las correcciones se retiraron porque no pertenecen al correo/invitación. | Etiquetas válidas para reflexión y `go vet`. |

Los cinco archivos de reportes/S3/modelos (`report_handler.go`, `s3_bucket_handler.go`, `report_repository.go`, `models/report.go`, `models/user.go`) volvieron completos a HEAD. En `user_handler.go` se separaron los cambios: se conservó lo de invitaciones/activación y se revirtió únicamente la mejora del registro ciudadano. El resto de la guía mantiene los pendientes funcionales identificados originalmente, ajustados al estado actual.

Verificación de la separación: los cinco archivos restaurados coinciden byte por byte con HEAD; los doce archivos conservados coinciden con la selección preparada antes del stash; `git diff --check` y `go test ./...` pasan. Esto comprueba compilación y pruebas disponibles (análisis y plantillas), no las pruebas de integración con BD, S3, correo, SMS o despliegue de la sección 8.
