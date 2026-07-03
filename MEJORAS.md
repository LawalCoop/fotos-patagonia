# Foto Patagonia — Plan de mejoras (rendimiento, protección e infraestructura)

> Documento de referencia. Alcance actual: **un solo local** (el modelo multi-tenant queda para más
> adelante). Escrito en términos simples porque lo usamos también para aprender infraestructura.

---

## 1. Contexto del negocio (del PDF)

Venta de fotos turísticas (canopy, cuatris, cerros). La **ventana de venta es de minutos**: el turista
termina la actividad, mira sus fotos y compra en el momento o se va. Por eso dos cosas son críticas:

- **Velocidad**: que las fotos se vean apenas se cargan (no esperar a que suban todas).
- **Protección**: que las fotos previas a la compra no se puedan robar (marca de agua efectiva).
- **Calidad de las previas**: las previas tienen que verse muy bien (dos niveles: vista rápida y detalle).

Volúmenes: 200–600 fotos/día típico; pico invierno hasta 300 fotos cada 40 min para mostrar en <10 min.
Originales de 6–12 MB (promedio 9 MB).

---

## 2. Cómo está armado hoy

- **Backend**: FastAPI + Postgres 13. Solo reparte "presigned URLs" y guarda registros; **no procesa
  imágenes**.
- **Frontend**: Next.js 14. **Todo el trabajo de imagen es en el navegador del fotógrafo**: calcula
  hash (dedup), comprime y genera miniatura de 640px con canvas, y sube original + miniatura directo al
  storage.
- **Storage**: hoy DigitalOcean Spaces en `sfo3` (San Francisco) — muy lejos de la Patagonia.
- **Deploy**: GitHub Actions entra por SSH a un droplet de DigitalOcean, hace `git reset` + `docker
  compose build --no-cache` + `up`. Sin reverse proxy versionado, **sin backups de la base**.

---

## 3. Hallazgos clave

### 3.1 La protección de imágenes es solo cosmética
`components/organisms/WatermarkedImage.tsx` pone la marca de agua como **capa CSS por encima** del
original a resolución completa, que se sirve por presigned URL. Cualquiera abre el inspector de red y
baja el original **sin marca**. Contradice el requisito "protección efectiva" del PDF.
(`PublicPhotoSchema.watermark_url` hoy apunta al mismo original — hay un TODO en `models/photo.py`.)

### 3.2 Hay que esperar a que suban TODAS antes de ver alguna
En `frontend/hooks/photos/usePhotoUpload.ts` la subida hace todo en un bloque y **recién al final**
llama **una sola vez** a `complete-upload` (~línea 644). Una foto existe para la galería solo después de
ese llamado (ahí el backend crea el registro en `services/photos.py::finalize_photo_uploads`, línea 299).
Además la galería del álbum (`app/albumes/[id]/page.tsx`) carga una vez y **no se refresca sola**.
Resultado: no se ve nada hasta que termina todo el lote. Esto es exactamente lo que el PDF quiere evitar.

### 3.3 Las previas dependen de mostrar el original
Hoy la "vista rápida" usa la miniatura de 640px (bien), pero la "vista detalle" muestra **el original**
con marca CSS. Se ve muy bien justamente porque es el original → si lo protegemos, la vista de detalle
necesita una **previa grande con marca de agua quemada** que se vea igual de bien.

---

## 4. Mejora #1 — Carga incremental (de a 5 fotos)  ✅ HECHO (2026-07-03)

**Estado:** implementado y probado en local. Lo que se hizo:
- **Backend:** `POST /photos/complete-upload` acepta un `session_id` opcional (`routers/photos.py`); si
  viene, `finalize_photo_uploads` (`services/photos.py`) agrega las fotos a esa sesión en vez de crear
  una nueva (valida existencia y permiso del fotógrafo).
- **Frontend (`hooks/photos/usePhotoUpload.ts`):** la subida se procesa en tandas de 5
  (`INCREMENTAL_BATCH_SIZE`) de punta a punta; la primera tanda crea la sesión y las siguientes reusan su
  `session_id`. Emite `onBatchComplete` por tanda, manteniendo el resultado agregado final.
- **Modal (`components/organisms/photo-modal.tsx`):** `onBatchComplete` refleja cada tanda en la grilla.

**Objetivo:** que las fotos aparezcan en la galería a medida que suben, en tandas de ~5, sin esperar el
total. Es cambio de **código puro** (no toca infraestructura).

Son dos mitades:

### A) Productor (el que sube) — cortar en tandas
Archivo: `frontend/hooks/photos/usePhotoUpload.ts`
- Hoy: un `completeUpload(todos)` al final.
- Nuevo: llamar a `completeUpload` **cada 5 originales que terminen** (con su miniatura lista), en vez
  de una sola vez.

**Trampa a resolver (backend):** `finalize_photo_uploads` (`services/photos.py:353-364`) crea **una
sesión nueva cada vez que se lo llama**. Si lo llamamos 20 veces, crea 20 sesiones sueltas.
- Solución: crear **una sola sesión al inicio del lote** y que las tandas siguientes reusen ese
  `session_id`.
- Cambio concreto: que `POST /photos/complete-upload` (`routers/photos.py`) acepte un `session_id`
  opcional; la primera tanda crea la sesión y devuelve su id, las siguientes lo reenvían.

**Detalle de orden:** finalizar una foto cuando ya subieron **su original Y su miniatura**, para que
aparezca completa en la grilla.

### B) Consumidor (el que mira) — que la pantalla se entere
Archivo: `app/albumes/[id]/page.tsx` (galería que ve el vendedor/cliente)
- Mientras hay una carga activa, disparar `refetch()` cada ~3–4 segundos (polling). El hook ya expone
  `refetch()`; solo falta el intervalo.
- En la pantalla del propio fotógrafo se puede además inyectar de forma optimista los `createdPhotos`
  que devuelve cada tanda.

**Criterio de terminado:** subiendo 100 fotos, la galería se va llenando de a ~5 en vivo y el vendedor
puede empezar a mostrar a los pocos segundos.

---

## 5. Mejora #2 — Refresco automático de la galería  ✅ HECHO (2026-07-03)

**Estado:** implementado en las **dos** vistas donde alguien puede estar mirando durante una carga:
- **Álbum público** (`app/albumes/[id]/page.tsx`) y **galería admin** (`app/admin/fotos/page.tsx`).
- Polling cada ~7s, **solo con la pestaña visible**, en segundo plano: en el álbum se agregó un
  `refetch({ silent: true })` a `useAlbums` (no toca `loading`); en la galería admin se traen las fotos
  con id no visto y se agregan.
- La pantalla del propio fotógrafo, además, se actualiza al instante por la UI optimista (`onBatchComplete`).

Con esto se cumple el caso del PDF completo: subiendo 100 fotos, el que mira ve aparecer las que ya se
subieron sin recargar ni esperar al final.

### 5.1 Arreglos de UX (preexistentes) detectados al implementar y ya corregidos
- **Cartel de subida** (`upload-manager.tsx`): el título quedaba fijo en "Subidas en progreso"; ahora
  cambia a "Subida terminada / parcial / con errores" con su ícono.
- **Placeholder colgado** (`photo-modal.tsx`): con nombres de archivo repetidos un placeholder quedaba en
  "Subiendo… 100%" para siempre; se agregó un **barrido final** que resuelve todos los placeholders.
- **Galería vacía tras F5** (`app/admin/fotos/page.tsx`): no había carga inicial (solo scroll infinito,
  que no arranca con la lista vacía); se agregó una carga inicial al montar.
- **Grilla solapada + borde crema** (`app/admin/fotos/page.tsx` + `admin-photo-card.tsx`): el
  virtualizador estimaba mal la altura de fila (filas encimadas); se pasó a medición real
  (`measureElement`). El borde crema era el `py-6` por defecto del `Card` base; se anuló con `p-0`.
- **Aviso de duplicados** (`photo-modal.tsx` + `upload-manager.tsx`): avisa cuántas ya existían y por qué
  no se subieron.

---

## 6. Mejora #3 — Previas nítidas + protección real (van juntas)

Dos niveles de imagen:
- **Vista rápida (grilla):** miniatura ~640–800px, calidad ~0.82. (hoy ya existe; se puede subir un poco
  el tamaño para pantallas grandes).
- **Vista detalle (al tocar):** previa grande ~1600–2000px **con marca de agua quemada** y buena calidad.
  El **original** solo se sirve por presigned URL **después de pagar**.

Dos formas de generar esa previa grande:
- **Opción 1 — en el navegador del fotógrafo.** Simple, sin servicios nuevos, pero le agrega trabajo al
  cliente en el pico (ya hace hash + compresión + miniatura por foto).
- **Opción 2 — en el borde/servidor bajo demanda** (Cloudflare Images o un worker de imágenes): el
  fotógrafo **solo sube el original**; el sistema genera miniatura + previa con marca, ambas cacheadas
  cerca (Neuquén), y el original queda privado. Mata tres pájaros: subida más rápida, previas nítidas y
  original protegido. Recomendada al escalar (suma una pieza a configurar).

---

## 7. Infraestructura y deploy (después de las mejoras de código)

### 7.1 Latencia / geografía (investigado)
- **Hetzner no tiene datacenter en Sudamérica.** Lo más cerca es **Ashburn (EEUU este)**, ~110–150 ms de
  Argentina. Aun así es **más cerca que hoy** (Spaces en San Francisco).
- **Cloudflare R2 (fotos) tiene presencia de red en Neuquén (código NQN), Buenos Aires y Córdoba.** Las
  fotos servidas por un **dominio propio con caché activada** se entregan desde Neuquén → rapidísimo, y
  encima el egress (tráfico de salida) es **gratis** (Spaces lo cobra).
- **Ojo:** las presigned URLs actuales **no** pasan por esa caché (van al depósito central de R2). Para
  aprovechar Neuquén hay que servir las miniaturas/previas por **dominio propio cacheado** (públicas, con
  marca) y dejar los originales por presigned URL privada. Esto se conecta con la Mejora #3.

### 7.2 Plan de infra (para el local único)
- **Servidor**: Hetzner CX22 en **Ashburn**. Poner **Caddy** adelante (HTTPS + ruteo `/api`→backend,
  resto→frontend) y **Cloudflare** adelante del dominio.
- **Storage**: migrar a **Cloudflare R2** (solo cambian variables `S3_*`, el código boto3 no se toca).
- **Base de datos**: decisión pendiente —
  (a) Postgres en el servidor con backup `pg_dump`→R2 + restore al arranque (plan del compañero), o
  (b) **Postgres administrado gratis** (Neon/Supabase) afuera, más simple y seguro para una base que es
  solo metadata (MB). *Recomendación: (b).*
- **Backups**: hoy **no existen** — es el agujero más grave. Resolver sí o sí.
- **Prende/apaga estacional**: botón (Cloudflare Pages + Worker) que crea el servidor y actualiza el DNS
  al abrir, y lo destruye al cerrar. Fuera de temporada, costo ~$0.
- **Costo estimado**: ~$6–7/mes en temporada, ~$0 fuera (+ dominio ~$10–15/año).

---

## 7.3 Pipeline de deploy (compilar en CI + registry)

> Estado: **plan escrito, sin ejecutar todavía**. Registry a definir (recomendado GHCR).

### Cómo es el deploy HOY (`.github/workflows/deploy.yml`)
Se dispara con cada `push` a `main`. Dos jobs:
1. **`build`**: descarga código, `npm ci` + `npm run build` del frontend. Solo **verifica que
   compila**; la imagen resultante **se descarta** (control de calidad).
2. **`deploy-prod`** (solo si pasó el anterior): entra por **SSH** al droplet y corre un script:
   `git reset --hard origin/main` → `docker compose down` → `docker compose build --no-cache`
   (**compila en el servidor**) → `docker compose up -d`.

**Problemas:** se compila dos veces (una se descarta); el servidor chico hace lo pesado; hay
**downtime** entre `down` y `up`; el rollback está declarado en el workflow pero **no conectado**
(hoy es a mano); usa `--no-cache` siempre (rearma todo desde cero).

### Cómo quedaría con registry
Separar **fabricar** (CI) de **usar** (servidor):
1. **GitHub Actions** compila las imágenes de backend y frontend **una vez**, las etiqueta (por
   commit `sha-xxxx` + `latest`) y las **sube al registry** (ej: `ghcr.io/omegonstudio/fotopatagonia-backend`).
2. **`docker-compose.prod.yml`**: cambiar `build:` por `image: ghcr.io/.../fotopatagonia-backend:${TAG}`
   (idem frontend). El servidor deja de compilar.
3. **Deploy en el servidor** = `docker compose pull` → `docker compose up -d` (segundos, sin
   downtime largo). Migraciones siguen con el `alembic upgrade head` del comando del backend.
4. **Rollback** = poner `TAG` en un commit anterior y `pull` + `up`.

**Beneficios:** deploy rápido sin downtime largo; el servidor chico no se satura; reproducible
(corre exactamente la imagen probada); rollback en segundos; y **acelera mucho el arranque del
prende/apaga estacional** (un servidor nuevo baja la imagen hecha en vez de compilar → menos de los
2-3 min de cold start).

### Detalles a resolver
- **`NEXT_PUBLIC_*` del frontend** (API URL, reCAPTCHA, EmailJS) se "queman" al construir la imagen.
  Como la construcción pasa a CI, esas variables deben estar disponibles **en GitHub** al buildear
  (son públicas, no es riesgo de seguridad, solo configurarlas ahí).
- **Imagen privada vs pública:** si el registry es privado, el servidor necesita un `docker login`
  (token) de una sola vez para poder bajarlas.

### Decisión pendiente
- **Registry:** GHCR (recomendado, gratis, ya están en GitHub) / Docker Hub (límites en free) /
  DOCR de DigitalOcean (pago, ata a DO).
- **Cuándo/dónde:** aplicarlo sobre el DigitalOcean actual (bajo riesgo, la misma imagen se reusa en
  Hetzner) o junto con la migración a Hetzner.

---

## 8. Orden recomendado (roadmap)

Primero lo que es **solo código** y da valor inmediato, después la infraestructura:

1. ~~**Mejora #1 — carga incremental de a 5**~~ ✅ HECHO (2026-07-03).
2. ~~**Mejora #2 — refresco automático de la galería**~~ ✅ HECHO (2026-07-03).
3. **Mejora #3 (Opción 1) — previa grande con marca quemada** + proteger el original. **← siguiente**
   (conviene hacerla junto con R2/Cloudflare para no tener doble marca). Nada de la marca de agua se tocó
   todavía: sigue siendo el overlay CSS de `WatermarkedImage.tsx`.
4. **Infra**: backups de la base (urgente) → Caddy → migración a R2 con dominio cacheado → prende/apaga.
5. Más adelante: generación de previas en el borde (Opción 2) y multi-tenant.

Ver el paso a paso de arranque acordado con el equipo (sección "cómo empezar").

---

## 9. Pendientes / bloqueos externos

El servidor viejo (DigitalOcean) fue **apagado** y el sitio está **offline**, así que todos los
secretos que vivían en su `.env` **se perdieron**. Los secretos NO se deducen del código ni del sitio
(a diferencia de las `NEXT_PUBLIC_*`): o se recupera acceso a la cuenta, o se regeneran.

### 9.1 Estado de las variables `NEXT_PUBLIC_*` (build del frontend)
Investigado en el código:
- `NEXT_PUBLIC_API_URL` — **se usa** (`lib/api.ts`, pedidos). Valor conocido: `https://somosfotospatagonia.com/api`
  (a revisar si la coope usa dominio propio). **Única imprescindible para el build.**
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — **se usa** (`app/contacto/page.tsx`). Perdida, pero **recreable
  gratis** en la consola de Google reCAPTCHA. Si queda vacía, el build funciona igual (solo el captcha
  del form de contacto no anda).
- `NEXT_PUBLIC_EMAILJS_SERVICE_ID` / `_TEMPLATE_ID` / `_PUBLIC_KEY` — **variables MUERTAS**, no se usan
  en ningún lado. Se sacaron del workflow.

### 9.2 Mail — decisión: unificar todo en Resend
- Hoy hay **dos** sistemas: backend con **Resend** (confirmaciones de compra, `services/email_service.py`
  llamado desde `orders.py`) y el **form de contacto con EmailJS** (`app/api/contact/route.ts`).
- **Plan:** migrar el form de contacto de EmailJS → Resend (cambio en `app/api/contact/route.ts`), y
  eliminar EmailJS por completo. Reutiliza el `RESEND_API_KEY`.
- **Nota de comportamiento:** si `RESEND_API_KEY` no está configurada, el backend **no rompe** — saltea
  el envío y loguea "Skipping email sending". O sea, la app puede correr sin mail mientras se consigue
  el acceso.

### 9.3 Accesos que hay que recuperar (mensaje enviado a la dueña)
- **Dominio** (`somosfotospatagonia.com`) — para DNS (verificar Resend, apuntar la web). *Solicitado.*
- **Cuenta de Resend** — para generar una API key nueva y confirmar el dominio verificado. *Solicitado.*
- **Cuenta de MercadoPago** — para el `MERCADOPAGO_ACCESS_TOKEN` (cobros). Pendiente.
- Definir: ¿se sigue con `somosfotospatagonia.com` o dominio propio de la coope? (afecta `EMAIL_FROM`,
  `NEXT_PUBLIC_API_URL`, verificación de Resend, DNS).

### 9.4 Secretos a regenerar al re-desplegar (no dependen de terceros)
`SECRET_KEY` (login), `POSTGRES_PASSWORD` (DB nueva), claves de storage (será R2 nuevo).

### 9.5 Limpieza de código pendiente (variables muertas de EmailJS)
- `frontend/Dockerfile.prod` y `docker-compose.prod.yml` todavía declaran los `NEXT_PUBLIC_EMAILJS_*`
  como build args. Sacarlos cuando toquemos esos archivos (bajo, no urgente). En el workflow ya se
  quitaron.
