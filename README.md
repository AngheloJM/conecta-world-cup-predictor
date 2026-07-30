# Conecta Mundialista 2026

Quiniela mundialista corporativa para el **Mundial 2026**. Cada usuario:

1. **Arma su Mundial** (Predictor): ordena los 12 grupos, elige los 8 mejores terceros y llena el bracket hasta el campeón.
2. **Apuesta marcadores** partido a partido (Calendario), con datos reales de la API.

El backend trae resultados reales automáticamente, calcula los puntos y ordena el ranking — todo solo.

📖 **¿Cómo funciona en detalle (puntaje, bloqueos, guardado)?** → [`FUNCIONAMIENTO.md`](docs/FUNCIONAMIENTO.md)

---

## 🧱 Arquitectura

```text
Frontend (Vercel)  ──HTTPS──►  Backend (Render)  ──SSL──►  PostgreSQL (Neon)
HTML+Tailwind+JS                Rust · Axum · SQLx              base de datos
PWA instalable                  JWT · scoring · auto-sync
                                       │
                                       └──►  football-data.org (resultados reales)
```

- **Frontend:** HTML + Tailwind (CDN) + JavaScript vanilla (sin build, sin dependencias). PWA instalable.
- **Backend:** Rust + Axum + SQLx. Auth con JWT + Argon2, scoring, sincronización automática.
- **Base de datos:** PostgreSQL (Neon en producción, Docker en local).
- **Despliegue:** Frontend en Vercel (estático), backend en **Render** (Docker, plan free), BD en **Neon** (free). Ambos con auto-deploy al hacer `push` a `main`.

> El proyecto vivió originalmente con el backend en Railway; se migró a Render (free) para operar a costo cero. El binario Docker es portable: el mismo `Dockerfile` funciona en cualquier host que inyecte `PORT`.

---

## 📁 Estructura

```text
Mundial-Rust/
├─ frontend/                 # App web (sin build)
│  ├─ index.html             #   markup + vistas (Predictor, Calendario, Tablero, Mis Apuestas, Admin)
│  ├─ manifest.json          #   PWA (instalable)
│  ├─ sw.js                  #   service worker (offline / instalación)
│  ├─ icon.svg               #   ícono de la app
│  ├─ css/styles.css         #   estilos base
│  └─ js/
│     ├─ config.js           #   API_BASE (URL del backend)
│     ├─ api.js              #   cliente HTTP + sesión (token)
│     ├─ data.js             #   grupos/partidos reales, traducciones, deadline
│     ├─ store.js            #   estado del predictor + (de)serialización
│     ├─ predictor.js        #   grupos (drag&drop) + terceros + bracket
│     ├─ calendar.js         #   apuestas por partido (relacional)
│     ├─ mis.js              #   vista "Mis Apuestas" (resumen personal)
│     ├─ admin.js            #   panel admin (solo admins)
│     ├─ main.js             #   pestañas, ranking, reloj, guardado, init
│     └─ auth.js             #   login / registro / sesión
│
├─ backend/                  # API REST (Rust · Axum · SQLx)
│  ├─ src/
│  │  ├─ main.rs             #   server, rutas, CORS, auto-sync, ranking, migraciones
│  │  ├─ auth.rs             #   registro/login (JWT+Argon2), extractores AuthUser/AdminUser
│  │  ├─ apuestas.rs         #   apuestas por partido (candado de tiempo) + listado
│  │  ├─ sim.rs              #   simulación del predictor (bracket) + bloqueo
│  │  ├─ partidos.rs         #   sync con la API, scoring en lote, bonus del predictor
│  │  ├─ admin.rs            #   gestión de usuarios + carga manual de resultados
│  │  └─ scoring.rs          #   algoritmo puro de puntos (referencia + tests)
│  ├─ migrations/            #   esquema PostgreSQL (0001 … 0007)
│  ├─ .sqlx/                 #   caché de queries (build offline en Docker/Render)
│  ├─ Dockerfile             #   build para Render/Railway (Linux)
│  └─ Cargo.toml
│
├─ docs/                     # documentación
│  ├─ FUNCIONAMIENTO.md      #   documento funcional detallado
│  ├─ PRESENTACION.md        #   guía del usuario (para generar slides en Gamma)
│  └─ img/                   #   capturas de pantalla
├─ docker-compose.yml        # PostgreSQL local para desarrollo
├─ vercel.json               # rewrites + cabeceras de seguridad (frontend)
└─ .env.example
```

> Documentación de la API (con el backend corriendo): `/docs` · spec OpenAPI en `/openapi.json`.

---

## 🚀 Correr en local

### 1. Base de datos (Docker)
```powershell
copy .env.example .env
docker compose up -d
```

### 2. Backend (Rust)
> En Windows se usa el toolchain GNU (no MSVC):
```powershell
cd backend
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/conecta"
cargo +stable-x86_64-pc-windows-gnu run     # http://localhost:3000
```
Al arrancar aplica las migraciones y, si hay `FOOTBALL_DATA_TOKEN`, sincroniza partidos.

### 3. Frontend
Apunta `frontend/js/config.js` (`API_BASE`) al backend y abre `frontend/index.html`.

### Regenerar caché de SQLx (tras cambiar queries)
```powershell
cd backend
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/conecta"
cargo +stable-x86_64-pc-windows-gnu sqlx prepare
```

---

## 🔧 Variables de entorno (backend)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a Postgres (Neon usa `?sslmode=require`) |
| `JWT_SECRET` | Secreto para firmar los tokens JWT |
| `FOOTBALL_DATA_TOKEN` | Token de football-data.org (auto-sync de resultados) |
| `ADMIN_EMAIL` | El usuario que se registre con este correo queda **admin** (el estado `es_admin` se guarda en la BD, así que basta una vez) |
| `CORS_ORIGINS` | Orígenes permitidos (coma-separados). Sin esto, permite cualquiera (solo dev) |
| `SELF_PING_URL` | (Opcional) Fuerza la URL del auto-ping keep-alive. En Render se toma sola de `RENDER_EXTERNAL_URL` |
| `PORT` | Puerto (lo inyectan Render/Railway) |

> `PREDICTOR_BUFFER_MIN` quedó sin uso: tras una reapertura manual del bracket, el cierre del predictor está fijado por fecha directamente en `sim.rs` (y `frontend/js/data.js`). Para volver al cierre automático (al primer partido), restaurar las líneas comentadas en ambos archivos.
>
> **Keep-alive:** el plan free de Render duerme el servicio tras 15 min sin tráfico. El backend se auto-pinguea a `/health` cada 10 min (usando `RENDER_EXTERNAL_URL`) para mantenerse despierto sin costo.

---

## 🎯 Puntaje (resumen)

**Por partido (Calendario):**

| Pts | Categoría | Condición |
|---|---|---|
| 10 | Marcador exacto | Goles exactos de ambos equipos |
| 7 | Diferencia de goles | Mismo ganador (no empate) y misma diferencia, sin ser exacto |
| 5 | Resultado simple | Misma tendencia (ganador con diferencia distinta, o empate correcto) |
| 2 | Consolación | Tendencia equivocada, pero aciertas los goles de un equipo |
| 0 | Error total | Nada coincide |

**Predictor (bracket):** campeón **+25**, finalista **+10** c/u, 1.º de grupo **+5**, clasificado top-2 **+3** c/u, mejor tercero **+2** c/u.

**Desempate:** más exactos (10) → más diferencias (7) → más simples (5) → registro más antiguo.

Detalle completo en [`FUNCIONAMIENTO.md`](docs/FUNCIONAMIENTO.md).

---

## 💾 Respaldos y restauración

Los respaldos son volcados `pg_dump` de la BD. Se guardan en `backups/`, carpeta **ignorada por Git** a propósito: contienen datos personales (correos, hashes) y no deben publicarse.

> Neon corre **PostgreSQL 18**, así que el cliente debe ser 18. La forma más simple y portable es vía Docker (no requiere instalar Postgres):

**Crear un backup:**

```bash
docker run --rm postgres:18-alpine pg_dump "$DATABASE_URL" --no-owner --no-acl > backups/backup.sql
```

**Restaurar sobre una base vacía** (Neon u otra):

```bash
docker run --rm -i postgres:18-alpine psql "$DATABASE_URL" < backups/backup.sql
```

*(Usa el endpoint **directo** de Neon —sin `-pooler`— para `pg_dump`.)*

---

## 🏁 Estado del proyecto

**Torneo finalizado (julio 2026) — proyecto archivado.** Resumen final:

- **125** participantes · **104** partidos · **4.081** pronósticos.
- 🌍 Campeón del Mundial: **España**.
- 🏆 Ganador de la polla: **Favio Enrique Salvatierra (642 pts)**.

Para bajar recursos a cero: suspender el servicio en Render (la BD Neon, con *scale-to-zero*, no consume inactiva). Los datos quedan preservados en Neon y en los backups de `backups/`.
