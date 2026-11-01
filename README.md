# Estilista de Bolsillo

Tu colorimetría, tu armario y tus looks, con Claude.

- **Diagnóstico de color** a partir de selfies, con nivel de confianza y prueba de telas para confirmarlo.
- **Tu monigote**: piel, pelo, peinado, ojos, silueta y altura. Cada look se dibuja sobre él, con estampados, tejidos, maquillaje y joyas.
- **Modo diario y modo noche** (cenas, copas, discoteca, bodas).
- **¿Me la quedo?**: sube la captura de la tienda o una foto en el probador y recibe un veredicto con tres looks.
- **Armario, diario de looks y coste por uso**: qué amortizas y qué se queda en la percha.
- **Lista de compras** con lo que le falta a tu armario, en tus colores.

Todo se guarda **solo en tu móvil**. No hay servidor: la app habla directamente con Claude usando tu propia clave.

---

## 1. Instálala en el móvil

**iPhone:** abre el enlace de la app en **Safari** → botón **Compartir** → **Añadir a pantalla de inicio**. Ábrela siempre desde ese icono.

**Android:** abre el enlace en **Chrome** → menú ⋮ → **Instalar app**.

## 2. Consigue tu clave de Claude

La app necesita una clave de la plataforma de desarrolladores de Anthropic. **Es distinta de la suscripción de Claude**: aunque pagues Claude Pro, necesitas esta clave aparte.

1. Entra en [platform.claude.com](https://platform.claude.com) y crea tu cuenta.
2. En **Billing**, añade saldo. Con unos pocos euros tienes para mucho tiempo. Te recomiendo poner también un **límite de gasto mensual**.
3. En **API Keys**, pulsa **Create Key**, ponle de nombre «Estilista» y cópiala (empieza por `sk-ant-`).
4. Pégala en la app cuando te la pida. Se guarda solo en tu móvil.

### ¿Cuánto cuesta?

Pagas por uso, directamente a Anthropic. Con el modelo **Equilibrado** (por defecto), como orientación aproximada:

| Acción | Coste aproximado (céntimos de dólar) |
| --- | --- |
| Diagnóstico de color | 5–10 céntimos |
| Analizar una prenda | 3–6 céntimos |
| Tres looks | 2–4 céntimos |
| Identificar una prenda del armario | menos de 1 céntimo |

El modelo **Económico** es bastante más barato; **Máxima calidad**, más caro. Se cambia en *Yo → Ajustes*.

## 3. Haz un buen diagnóstico

- Luz de día, de frente a una ventana. Sin luz amarilla ni flash.
- Sin maquillaje (o muy poco) y sin filtros.
- Pelo apartado de la cara, cuello visible.
- Sostén un **folio blanco** junto a la cara: sirve para corregir el color de la foto.
- Después haz la **prueba de telas** frente al espejo. Confirma o corrige lo que se ve en las fotos.

## Privacidad

- Tus fotos, tu armario, tu diario y tu clave se guardan **solo en este dispositivo**.
- Las fotos se envían a Anthropic **únicamente** cuando pides un análisis.
- Nadie más ve tus datos: ni la persona que te pasó la app ni el resto de usuarias.
- Si borras los datos del navegador o cambias de móvil, se pierden. Usa **Yo → Exportar copia de seguridad** de vez en cuando y guárdala en Archivos o iCloud.

---

Hecha con HTML, CSS y JavaScript, sin dependencias. Se aloja gratis en GitHub Pages.
