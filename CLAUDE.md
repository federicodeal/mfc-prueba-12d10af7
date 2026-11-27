# Mala Fama Control

App de control del restaurante Mala Fama (Punta del Este): cierres de caja, ventas, compras, carta, recetas y recuento de stock.

## Cómo está armada

- Este repositorio tiene **solo archivos estáticos** (HTML, CSS y JavaScript). No hay paso de compilación: se publica tal cual.
- Se publica con **GitHub Pages** desde la rama `main`. Lo que se sube a `main` queda en el aire al toque:
  https://federicodeal.github.io/mfc-prueba-12d10af7/
- Los datos no están en este repo. Están en el proyecto de **Supabase** `malafama-control`, referencia `hvueinkatzizamkesjyw`.
- La clave pública (anon) de la app está en `config.js`. **No uses ni subas la clave maestra (service role) ni contraseñas.**
- Archivos principales: `index.html`, `app.js` (navegación, login, catálogo, stock, compras), `ventas.js`, `compras.js`, `carta.js`, `styles.css`.

## Antes de editar

1. Siempre hacé `git pull` al empezar, porque Developer también sube cambios acá. Si no, se pisan.
2. No trabajemos los dos a la vez en el mismo archivo. Si vas a editar, avísale a Federico / a Developer.
3. Para un cambio grande, trabajá en una rama y mostrá cómo queda antes de unirlo a `main`.
4. Antes de borrar o cambiar datos reales (ventas, compras, cierres, recetas), mostrá qué vas a hacer y esperá el OK.

## Conectar Supabase a Claude Code

En la carpeta del proyecto:

```
claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=hvueinkatzizamkesjyw"
```

La primera vez se abre el navegador para entrar con la cuenta de Supabase de Federico. No hay que copiar ninguna clave.

## Roles y permisos (RLS)

Los usuarios están en `perfiles` (ligado a Auth). Roles: `admin`, `encargado`, `cocina`, `barra`, `stock` (tablet) e `ingesta`.

- **admin** (Federico): ve todo, incluido Cierres, Ventas, Compras y Carta / Recetas.
- **encargado**: Catálogo y Novedades.
- **tablet (`stock`)**: solo Ingreso de stock. Si entra a otra sección, la app la redirige. No debe ver Ventas ni Compras.
- **cocina / barra**: recuento de stock de su categoría.
- **ingesta**: carga automática de facturas.

Las tablas tienen RLS. La app entra con la clave pública y el usuario logueado; lo que cada uno puede leer o escribir lo decide su rol.

## Tablas principales

Compras (FacturaExpress):

- `proveedores`, `articulos`, `categorias` (Cocina, Barra, Cocina y Barra, Otros)
- `compra_lineas` — cada renglón de factura. El monto a usar es `coalesce(monto, total)`.
- `v_articulos` — vista que usa la app para el catálogo (totales y última compra).
- `ingestas`, `novedades` — cargas nuevas y artículos o proveedores que aparecen por primera vez.

Ventas (caja / Vectio / Factura Express):

- `ventas_tickets` — un ticket por `tipo|serie|numero`.
- `ventas_lineas` — un renglón por ticket, clave `tipo|serie|numero|renglon`.
- `ventas_codigos` — código de caja → ítem de carta, tipo (plato, bebida, trago, etc.) y si es histórico. El COMODIN cuenta como venta y se muestra aparte. No se mezclan con los cierres de caja: son dos fuentes distintas.

Cierres de caja (mails diarios, otra fuente):

- `cierres` — un cierre por caja y jornada (totales, pagos, secciones, mozos).

Carta y recetas:

- `carta_categorias`, `carta_items`
- `recetas`, `receta_insumos`, `item_recetas`
- `carta_sync`, `recetas_conflictos`

Stock:

- `recuentos_stock` — lo que carga la tablet.

## Cierres: no tocar el esquema a ciegas

Developer carga los cierres todos los días a las 9:00 (hora de Uruguay) con `cargar_cierres.py`, que corre de su lado (no está en este repo) y escribe en la tabla `cierres`.

Si vas a cambiar el esquema de `cierres` (columnas, tipos, claves, RLS), avisá a Developer antes, para ajustar la carga y que no se rompa.

## Otras reglas

- Nunca subas secretos, claves de servicio de Supabase, contraseñas, PINs ni tokens.
- No mezcles los datos de los mails de cierre de caja con los de Vectio / Factura Express de ventas.
- El dashboard viejo sigue publicado hasta que Federico diga de apagarlo.
- Los archivos de recetas y stock en Google Drive son de solo lectura; los cambios de recetas en la app van por las tablas de acá (hay una sincronización desde el documento).
- No hace falta pegar claves en el chat: para la app alcanza la pública de `config.js`, y para la base la conexión MCP de arriba.
