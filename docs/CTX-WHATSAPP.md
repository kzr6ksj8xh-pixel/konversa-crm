# Ctx:Whatsapp — Botón flotante de WhatsApp para Shopify (versión GRATIS)

App de Shopify que agrega un **botón flotante de WhatsApp** a la tienda. Al hacer
clic, abre WhatsApp del cliente con un mensaje prellenado hacia el **número de
Konversa CRM**. El comerciante no escribe el número: se toma automáticamente de la
cuenta de Konversa conectada a la tienda (vía OAuth).

Número de Konversa por defecto: **+52 981 751 1111**.

---

## Cómo funciona

```
Tienda Shopify (App embed block)
        │  fetch  ?action=widget-config&shop=<tienda>.myshopify.com
        ▼
api/shopify.js  ──►  ¿la tienda tiene la app instalada (integrations)?
        │                    │ sí
        │                    ▼
        │            número de WhatsApp de Konversa
        ▼
Botón flotante → https://wa.me/<numero>?text=<mensaje>
```

- **Frontend:** `extensions/ctx-whatsapp/` (Theme App Extension → *app embed block*).
- **Backend:** endpoint público `GET /api/shopify?action=widget-config&shop=...`
  en `api/shopify.js`. Devuelve `{ enabled, number }` **solo** si la tienda tiene
  una integración Shopify activa. Siempre responde `200` (nunca rompe la tienda).

## El número de WhatsApp

`getKonversaWhatsAppNumber()` en `api/shopify.js` lo resuelve en este orden:

1. `WHATSAPP_DISPLAY_NUMBER` (variable de entorno, solo dígitos E.164).
2. Graph API: `display_phone_number` del `WHATSAPP_PHONE_NUMBER_ID` conectado.
3. Valor por defecto: `529817511111` (+52 981 751 1111).

Para cambiarlo en producción, define en Vercel:

```
WHATSAPP_DISPLAY_NUMBER=529817511111
```

## Instalación en la tienda (comerciante)

1. Instalar la app (OAuth): `https://konversa-crm.vercel.app/shopify/install?shop=<tienda>.myshopify.com`.
2. En Shopify Admin → **Tienda online → Temas → Personalizar**.
3. Panel izquierdo → **Incrustaciones de apps** (App embeds) → activar **Ctx:Whatsapp**.
4. Ajustar posición, color, mensaje y saludo. **Guardar**.

El botón solo aparece si la tienda tiene la app instalada (paso 1). Si se
desinstala, el botón desaparece solo.

## Despliegue de la extensión (desarrollador)

Requiere [Shopify CLI](https://shopify.dev/docs/api/shopify-cli):

```bash
cp shopify.app.toml.example shopify.app.toml   # pon tu client_id
shopify app config link                        # vincula con tu app de Partners
shopify app deploy                             # publica la Theme App Extension
```

## Desactivar el botón desde el CRM

En la fila de `integrations` de la tienda, poner `config.whatsapp_widget = false`.
El endpoint devolverá `enabled: false` y el botón no se mostrará.

## Personalización disponible (gratis)

| Opción              | Descripción                                   |
|---------------------|-----------------------------------------------|
| Posición            | Abajo a la derecha / izquierda                |
| Color del botón     | Por defecto verde WhatsApp `#25D366`          |
| Texto accesible     | Tooltip / `aria-label`                        |
| Globo de saludo     | Mostrar/ocultar + texto                       |
| Mensaje prellenado  | Texto que se coloca en el chat de WhatsApp    |
