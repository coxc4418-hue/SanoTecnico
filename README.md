# Sano-Técnico

Sistema para servicios técnicos y talleres de reparación de celulares, tablets, laptops y más. Multisede, con demo de 30 minutos y PWA instalable.

**Web:** https://sano-tecnico.web.app · **Consulta del cliente:** https://sano-tecnico.web.app/estado/CODIGO

## Qué incluye

- **Recepción del equipo** en 5 pasos: cliente, equipo (marca, modelo, IMEI con validación, clave/PIN o patrón dibujado), falla, revisión al recibir (pruebas, estado físico, accesorios, hasta 4 fotos) y presupuesto con abono.
- **Órdenes de servicio** (OS-0001…) en tablero por etapas: recibido → diagnóstico → por aprobar → esperando repuesto → reparando → listo / sin reparar → entregado.
- **Ficha de la orden:** presupuesto con servicios y repuestos del inventario (se descuentan al guardar), abonos, entrega con cobro, fotos, historial, avisos por WhatsApp con mensaje listo, impresión de orden en carta (términos, firmas, QR y patrón), ticket 80 mm y etiqueta.
- **Consulta pública** para el cliente por código o QR, sin sesión.
- **Garantías** vigentes y reingreso por garantía en un clic.
- **Vender** accesorios en mostrador; **Facturación** (notas de entrega, ventas, recibos de abono) con anulación protegida por PIN.
- **Caja** en $ y Bs con tasa BCV automática, gastos y cierre con arqueo.
- **Clientes, Inventario** (compras con costo promedio, mermas, conteo, lista de compras por WhatsApp), **Técnicos** con comisiones y **Reportes**.
- **Panel del administrador** (admin): crear, congelar, renovar y eliminar sedes; aviso general.
- **Demo** anónima de 30 min con un taller de ejemplo (PIN 1234), recorridos guiados y video tutorial narrado.

## Estructura

- `public/` — la app (JS modular sin compilación, Firebase SDK 10 por CDN).
- `firestore.rules` — aislamiento por sede (`tenants/{uid}`), bloqueo de sedes congeladas o vencidas, demos que caducan y fichas públicas `tracking/{código}` (solo lectura por código exacto).
- `scripts/` — `provision.mjs` (crea admin + sedes y el archivo de credenciales), `e2e.mjs` + `test-emu.sh` (prueba completa en emuladores), `prod-smoke.mjs`, `pwa-check.mjs`, `print-check.mjs`, `screens.mjs`, `icons.mjs`, `tutorial/make-video.mjs`.

## Comandos

```sh
# Emuladores (auth 9199, firestore 8180, hosting 5066)
firebase emulators:start --only auth,firestore,hosting --project sano-tecnico
sh scripts/test-emu.sh            # prueba de extremo a extremo

# Producción
firebase deploy --only auth,firestore,hosting --project sano-tecnico
node scripts/provision.mjs 20     # admin + sede01..sede20 → CREDENCIALES_SANO_TECNICO.txt
```

Ventas y soporte: WhatsApp +58 422-190 6045.
