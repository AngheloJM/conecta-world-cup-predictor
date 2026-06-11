# Conecta · World Cup Predictor 2026

Polla/quiniela mundialista corporativa. El usuario arma su Mundial completo
(ordena los 12 grupos, elige los 8 mejores terceros, llena el bracket) y apuesta
marcadores por fecha. El backend valida el cierre por tiempo y calcula puntos escalados.

## 📁 Estructura

```
Mundial-Rust/
├─ frontend/             # App web (HTML + Tailwind CDN + JS vanilla, sin build)
│  ├─ index.html         #   markup
│  ├─ css/styles.css     #   estilos
│  └─ js/
│     ├─ data.js         #   equipos, grupos, fixtures, helpers (banderas)
│     ├─ store.js        #   estado + persistencia (localStorage)
│     ├─ predictor.js    #   grupos (drag&drop) + terceros + bracket + conectores
│     ├─ calendar.js     #   calendario / apuestas por fecha
│     └─ main.js         #   toast, leaderboard, reloj, envío, init
│
├─ backend/              # API REST (Rust · Axum · SQLx)
│  ├─ src/
│  │  ├─ main.rs         #   server, CORS, migraciones, candado de tiempo
│  │  ├─ auth.rs         #   registro/login (JWT + Argon2) + OpenAPI
│  │  └─ scoring.rs      #   algoritmo puro de puntos (con tests)
│  ├─ migrations/        #   esquema PostgreSQL (sqlx migrate)
│  ├─ .sqlx/             #   caché de consultas (build offline en Docker/Railway)
│  ├─ Dockerfile         #   build para Railway (Linux)
│  └─ Cargo.toml
│
├─ docker-compose.yml    # PostgreSQL en Docker para desarrollo local
├─ vercel.json           # despliegue del frontend en Vercel
└─ .env.example          # credenciales / DATABASE_URL
```

> Documentación de la API (cuando el backend corre): `http://localhost:3000/docs`

## 🚀 Cómo correr

### Frontend
Abre `frontend/index.html` en el navegador (doble clic). Sin build ni dependencias.

### Base de datos (Docker)
```powershell
copy .env.example .env
docker compose up -d
```

### Backend (Rust)
```powershell
cd backend
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/conecta"
cargo run    # http://localhost:3000
```

## 🎯 Reglas de puntos (backend `scoring.rs`) — iguales en toda fase
| Pts | Categoría | Condición |
|---|---|---|
| 10 | Marcador exacto | Aciertas los goles exactos de ambos equipos |
| 7 | Diferencia de goles | Mismo ganador (no empate) y misma diferencia, sin ser exacto |
| 5 | Resultado simple | Misma tendencia (ganador con diferencia distinta, o empate correcto) |
| 2 | Consolación | Tendencia equivocada, pero aciertas los goles de un equipo |
| 0 | Error total | Nada coincide |

Desempate del ranking: más exactos (10) → más diferencias (7) → más simples (5) → registro más antiguo.
