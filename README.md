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
│  │  ├─ main.rs         #   server + endpoint con candado de tiempo
│  │  └─ scoring.rs      #   algoritmo puro de puntos (con tests)
│  ├─ Cargo.toml
│  └─ rust-toolchain.toml
│
├─ database/             # Esquema PostgreSQL
│  └─ schema.sql
│
├─ docker-compose.yml    # PostgreSQL en Docker (carga schema.sql al iniciar)
└─ .env.example          # credenciales / DATABASE_URL
```

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

## 🎯 Reglas de puntos (backend `scoring.rs`)
| Acierto | Grupos | Octavos/Cuartos | Semifinal/Final |
|---|---|---|---|
| Marcador exacto | +5 | +8 | +11 |
| Ganador / empate | +3 | +5 | +7 |
| No acierta | 0 | 0 | 0 |
