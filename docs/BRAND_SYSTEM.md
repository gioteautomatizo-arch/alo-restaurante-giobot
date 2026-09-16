# Sistema de marca — Gioteautomatizo / Giobot

## Jerarquía de marca

### 1. Gioteautomatizo
Marca madre de la plataforma. Se usa en:
- acceso a la plataforma
- onboarding de negocios
- selector de negocios
- configuración general
- comunicaciones de producto

Slogan base: **Automatiza hoy, crece siempre**.

### 2. Giobot
Asistente IA de fábrica. Se usa en:
- atención por IA
- recomendaciones y ventas asistidas
- negocios que no han creado avatar propio
- experiencia Premium de IA

Firma: **Giobot by Gioteautomatizo**.

### 3. Marca del negocio
Cada tenant puede personalizar:
- logo
- paleta
- nombre
- avatar
- personalidad del asistente

Si no configura identidad propia, hereda la apariencia de Gioteautomatizo.

## Paleta Gioteautomatizo

- Negro principal: `#050505`
- Negro absoluto: `#000000`
- Superficie: `#111111`
- Superficie secundaria: `#1A1A1A`
- Blanco: `#F7F7F7`
- Gris/plata: `#C8C8C8`
- Dorado principal: `#D6A34A`
- Dorado oscuro: `#B8822D`
- Dorado suave: `#E3BC6B`
- Borde oscuro dorado: `#3A3022`

## Paleta Giobot

Giobot comparte el sistema negro/dorado y agrega plata metálica como elemento distintivo.

- Fondo: `#050505`
- Superficie: `#121212`
- Texto: `#F5F5F5`
- Dorado: `#D9A73E`
- Dorado oscuro: `#A87418`
- Dorado claro: `#F1C761`
- Plata: `#C7C7C7`

## Reglas de uso

1. La plataforma siempre inicia con identidad Gioteautomatizo.
2. El dueño puede quedarse con la identidad por defecto o personalizar su negocio.
3. Giobot es el asistente por defecto de todo negocio nuevo.
4. Un avatar propio sustituye visualmente a Giobot dentro del tenant, pero no cambia la marca madre.
5. La personalización de un tenant nunca debe modificar visualmente otros negocios.
6. La paleta personalizada debe guardarse por `restaurantId`/`businessId`.

## Assets

- `/brand/gioteautomatizo-logo.svg`
- `/brand/giobot-logo.svg`

## Implementación

El código fuente de colores y fallback está en:
- `src/lib/brandSystem.ts`
- `src/components/platform/platformTheme.css`
