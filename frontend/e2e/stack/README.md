# Tests e2e contra el entorno completo

Recorren la app real en Chromium: subida de fotos (incluido un lote de 1200),
compra (cliente hasta Mercado Pago, venta local en efectivo y ZIP del pedido)
y el visor en tablet. Corren contra el entorno de desarrollo, nunca contra
producción.

1. Levantar el entorno: `./dev-up.sh` (desde la raíz del repo).
2. Generar las fotos de prueba una sola vez (~300 MB):

   ```
   python3 e2e/stack/generate-photos.py 1230 /tmp/fotos-e2e
   ```

3. Correr los tests:

   ```
   E2E_PHOTOS_DIR=/tmp/fotos-e2e npm run test:e2e:stack
   ```

Cada corrida crea su propio álbum y fotógrafo, y agrega unos bytes al final de
cada JPEG para que el backend no las descarte como duplicadas, así que se
pueden repetir sin limpiar la base.

Variables opcionales: `E2E_APP_URL` (por defecto `http://localhost:3001`),
`E2E_API_URL` (`http://localhost:8010`), `E2E_ADMIN_EMAIL` y
`E2E_ADMIN_PASSWORD` (el admin por defecto de desarrollo).
