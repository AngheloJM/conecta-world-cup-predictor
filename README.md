# Conecta Mundialista 2026

Quiniela mundialista corporativa para el **Mundial 2026**. Cada usuario:

1. **Arma su Mundial** (Predictor): ordena los 12 grupos, elige los 8 mejores terceros y llena el bracket hasta el campeón.
2. **Apuesta marcadores** partido a partido (Calendario), con datos reales de la API.

El backend trae resultados reales automáticamente, calcula los puntos y ordena el ranking — todo solo.

📖 **¿Cómo funciona en detalle (puntaje, bloqueos, guardado)?** → [`FUNCIONAMIENTO.md`](docs/FUNCIONAMIENTO.md)

---

## 🧱 Arquitectura

```text
Frontend (Vercel)  ──HTTPS──►  Backend (Railway)  ──SSL──►  PostgreSQL (Neon)
HTML+Tailwind+JS                Rust · Axum · SQLx              base de datos
PWA instalable                  JWT · scoring · auto-sync
                                       │
                                       └──►  football-data.org (resultados reales)
```

- **Frontend:** HTML + Tailwind (CDN) + JavaScript vanilla (sin build, sin dependencias). PWA instalable.
- **Backend:** Rust + Axum + SQLx. Auth con JWT + Argon2, scoring, sincronización automática.
- **Base de datos:** PostgreSQL (Neon en producción, Docker en local).
- **Despliegue:** Frontend en Vercel (estático), backend en Railway (Docker), BD en Neon.

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
│  ├─ migrations/            #   esquema PostgreSQL (0001 … 0006)
│  ├─ .sqlx/                 #   caché de queries (build offline en Docker/Railway)
│  ├─ Dockerfile             #   build para Railway (Linux)
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
| `ADMIN_EMAIL` | El usuario que se registre con este correo queda **admin** |
| `CORS_ORIGINS` | Orígenes permitidos (coma-separados). Sin esto, permite cualquiera (solo dev) |
| `PREDICTOR_BUFFER_MIN` | Minutos antes del 1.er partido en que cierra el predictor (def. 30) |
| `PORT` | Puerto (lo inyecta Railway) |

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
