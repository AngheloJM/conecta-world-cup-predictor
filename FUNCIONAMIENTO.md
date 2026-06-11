# Cómo funciona la app · Conecta Predictor Copa FIFA 2026

Documento funcional: explica el puntaje, los bloqueos por tiempo, el guardado de
apuestas, la sincronización de resultados y el ranking. Pensado para entender el
comportamiento del sistema sin leer el código.

---

## 1. Visión general

Hay **dos formas de jugar**, independientes y ambas suman puntos:

| | **Predictor** (pestaña Predictor) | **Apuestas por partido** (pestaña Calendario) |
|---|---|---|
| Qué predices | Todo el Mundial: orden de los 12 grupos, los 8 mejores terceros y el bracket hasta el campeón | El marcador exacto de cada partido |
| Cuándo se cierra | **Una vez**, 30 min antes del primer partido | **Cada partido** se cierra a su propia hora de inicio |
| Dónde se guarda | Una "simulación" en JSON (tabla `simulacion_inicial`) | Filas individuales (tabla `apuestas_partidos`) |
| Cómo puntúa | Bonus por aciertos (campeón, grupos, terceros…) | 10/7/5/2/0 por marcador |

El usuario se registra, hace sus predicciones, y el sistema **solo** trae los
resultados reales, calcula los puntos y arma el ranking.

---

## 2. Autenticación

- **Registro / login** con email + contraseña (mínimo 8 caracteres).
- Las contraseñas se guardan **hasheadas con Argon2** (nunca en texto plano).
- Al iniciar sesión se entrega un **JWT** (token) válido por 30 días; el frontend
  lo guarda en `localStorage` y lo manda en cada petición (`Authorization: Bearer`).
- **Admin por configuración:** el usuario cuyo correo coincide con la variable
  `ADMIN_EMAIL` queda como administrador automáticamente (al registrarse o al
  iniciar sesión). No se asignan admins a mano.
- **Anti fuerza bruta:** máximo 5 intentos de login por correo por minuto; al
  excederse responde `429 Demasiados intentos`.

---

## 3. Guardado de apuestas

### 3.1 Predictor (la simulación del bracket)
- Vive en memoria mientras juegas; se **autoguarda solo** (debounced ~0.9 s)
  ante cualquier cambio de grupos/terceros/bracket.
- Se guarda como un **único JSON** vía `PUT /simulacion` en la tabla
  `simulacion_inicial` (un registro por usuario, se sobrescribe).
- También hay un botón **Guardar** para guardado explícito.
- Mientras no haya sesión, se guarda en `localStorage` del navegador.
- Salvaguarda: el autoguardado al servidor **espera** a haber cargado primero tu
  predicción guardada (bandera `predReady`), para no pisar lo guardado con un
  estado vacío al entrar.

### 3.2 Apuestas por partido (el calendario)
- Cada marcador que escribes se guarda **individualmente** vía `POST /apuestas`
  (debounced ~0.7 s, solo cuando ambos goles están escritos).
- Se almacenan como filas en `apuestas_partidos` (una por usuario+partido). Si
  cambias el marcador antes del cierre, se actualiza esa fila (upsert).
- Al iniciar sesión se cargan tus apuestas (`GET /apuestas`) para precargar el
  calendario.

### 3.3 Indicador visual
Cada guardado exitoso muestra un pequeño **"Guardado ✓"** abajo a la izquierda.

---

## 4. Bloqueo por tiempo (candados)

Hay **dos candados distintos**, ambos validados en el **backend** (no solo en el
frontend, para que nadie los esquive):

### 4.1 Candado por partido (apuestas del calendario)
- Cada apuesta se puede crear/editar **solo hasta la hora de inicio** de ese
  partido (`fecha_hora`).
- Al intentar guardar después del pitazo, el backend responde
  `400 Las apuestas están cerradas: el partido ya inició`.
- En el frontend, los inputs de un partido iniciado se ven **deshabilitados** y
  marcados como "Cerrado".

### 4.2 Cierre del Predictor (el bracket completo)
- El Predictor se cierra **una sola vez**: `PREDICTOR_BUFFER_MIN` minutos (por
  defecto **30**) **antes del primer partido del torneo**.
- La hora de cierre se calcula del partido más temprano de la base — no es una
  fecha fija.
- Tras el cierre, `PUT /simulacion` responde `403 Las predicciones están
  cerradas` y el frontend deshabilita reordenar grupos, elegir terceros, mover el
  bracket y guardar (el reloj del navbar muestra **"Cerrado"**).

> Resumen: el **bracket** se congela 30 min antes del arranque; las **apuestas
> por partido** siguen abiertas, cada una hasta que empiece su propio partido.

---

## 5. Cálculo de puntaje

### 5.1 Puntos por partido (apuestas del calendario)
Sistema plano (igual en toda fase). Por cada partido finalizado, cada apuesta
recibe:

| Pts | Categoría | Condición | Ejemplo (pred vs real) |
|---|---|---|---|
| **10** | Marcador exacto | Aciertas los goles exactos de ambos | 2-1 vs 2-1 |
| **7** | Diferencia de goles | Mismo ganador (no empate) **y** misma diferencia, sin ser exacto | 3-1 vs 2-0 |
| **5** | Resultado simple | Misma tendencia: mismo ganador con otra diferencia, o empate correcto | 2-0 vs 1-0 · 1-1 vs 2-2 |
| **2** | Consolación | Tendencia equivocada, pero aciertas los goles de **un** equipo | 1-1 vs 1-3 |
| **0** | Error total | No coincide nada | 2-0 vs 0-1 |

### 5.2 Bonus del Predictor (el bracket)
Cuando hay resultados reales, la simulación de cada usuario se compara con lo que
realmente pasó:

| Bonus | Acierto |
|---|---|
| **+25** | Campeón correcto |
| **+10** | Cada finalista correcto (los 2 equipos de la final) |
| **+5** | 1.º de cada grupo correcto |
| **+3** | Cada clasificado top-2 correcto |
| **+2** | Cada "mejor tercero" (grupo) correcto |

Detalles del cálculo:
- Las **tablas de grupos** se calculan de los partidos reales (puntos → diferencia
  de gol → goles a favor), y solo cuentan cuando el grupo está **completo**.
- Los **mejores 8 terceros** se rankean cuando termina **toda** la fase de grupos.
- El **campeón y finalistas** salen del partido de la final; el campeón usa el
  **ganador real** de la API (que resuelve penales).

### 5.3 Total y cuándo se recalcula
- **Total del usuario** = suma de puntos de sus apuestas **+** bonus del predictor.
- El recálculo es **idempotente** (se puede correr muchas veces, siempre da lo
  mismo) y ocurre:
  - automáticamente tras cada **sincronización** (cada 15 min), y
  - manualmente desde el **Panel Admin** (botón "Recalcular puntos").
- Está optimizado para escala: todo el scoring se hace en **pocas queries SQL en
  lote** (no una por apuesta), por lo que aguanta miles de usuarios.

---

## 6. Sincronización de resultados (auto-sync)

- Una tarea en segundo plano consulta **football-data.org** (competición Mundial)
  **al arrancar y cada 15 minutos**.
- Por cada partido actualiza: estado, marcador y **ganador**; e inserta los nuevos.
- Tras sincronizar, dispara el **recálculo de puntos**.
- Usa el token `FOOTBALL_DATA_TOKEN`. El plan gratuito permite 10 req/min; usamos
  ~1 req cada 15 min, muy por debajo del límite.
- Si la API falla un partido, el admin puede **cargar el resultado a mano**
  (ver §8), que también recalcula.

---

## 7. Ranking y desempates

- `GET /ranking` ordena a los usuarios por **puntos totales** (descendente).
- **Criterios de desempate** (en orden):
  1. Más marcadores **exactos** (10 pts).
  2. Más aciertos de **diferencia** (7 pts).
  3. Más **resultados simples** (5 pts).
  4. **Registro más antiguo** (quien se registró primero, va arriba).
- Estos conteos están **materializados** en el usuario (se actualizan en el
  recálculo), así que abrir el Tablero es instantáneo aunque haya miles de
  apuestas.
- El **Tablero** muestra podio (top 3) + tabla completa + tu posición. **Mis
  Apuestas** muestra tu resumen: posición, puntos, bonus del predictor y el
  detalle de cada apuesta con sus puntos.

---

## 8. Panel de administración

Visible solo para administradores (pestaña **Admin**). Todo protegido en el
backend con el extractor `AdminUser` (verifica `es_admin`).

- **Sincronizar API ahora** — fuerza el sync (además del automático).
- **Recalcular puntos** — recomputa todo el scoring.
- **Usuarios** — lista todos; permite **eliminar** (no a sí mismo).
- **Cargar resultado manual** — ingresar/corregir el marcador de un partido (por
  si la API lo falla). Al guardar marca el partido como Finalizado y recalcula.

---

## 9. Seguridad

- Contraseñas con **Argon2**; sesión por **JWT** (sin cookies → sin CSRF).
- **CORS** restringido a los orígenes de `CORS_ORIGINS` en producción.
- **Cabeceras de seguridad** en el frontend (Vercel): `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, etc.
- **Rate limiting** en login (anti fuerza bruta).
- Endpoints de admin protegidos por rol.
- Conexión a la base **por SSL** (Neon, `sslmode=require`).

---

## 10. Referencia de endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/register` | — | Registro |
| POST | `/auth/login` | — | Login (rate-limited) |
| GET | `/me` | Bearer | Datos del usuario actual |
| GET/PUT | `/simulacion` | Bearer | Leer/guardar la simulación del predictor (PUT con candado) |
| GET/POST | `/apuestas` | Bearer | Listar / guardar apuestas por partido (POST con candado) |
| GET | `/partidos` | — | Listado de partidos (con resultados/escudos) |
| GET | `/ranking` | — | Tabla de posiciones (con desempates) |
| POST | `/admin/sync` | Admin | Forzar sincronización |
| POST | `/admin/recalcular` | Admin | Forzar recálculo de puntos |
| GET | `/admin/usuarios` | Admin | Listar usuarios |
| DELETE | `/admin/usuarios/:id` | Admin | Eliminar usuario |
| POST | `/admin/partido/:id/resultado` | Admin | Cargar resultado manual |
| GET | `/health` · `/docs` · `/openapi.json` | — | Salud y documentación de la API |

---

## 11. Stack y despliegue

- **Frontend:** Vercel (estático). PWA instalable (manifest + service worker).
- **Backend:** Railway (Docker, Rust). Auto-sync en segundo plano.
- **Base de datos:** Neon (PostgreSQL gestionado, gratis, escala a cero).
- **Datos reales:** football-data.org.

Diagrama y variables de entorno en el [`README.md`](README.md).
