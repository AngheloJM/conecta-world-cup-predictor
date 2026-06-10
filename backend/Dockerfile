# ============================================================
#  Backend Conecta · build multi-stage para Railway (Linux)
# ============================================================

# ---- Etapa de compilación ----
FROM rust:1-bookworm AS builder
WORKDIR /app

COPY . .

# El rust-toolchain.toml pinea el toolchain GNU de Windows (sólo para dev local).
# En Linux usamos el stable del contenedor.
RUN rm -f rust-toolchain.toml

# Compilación offline: usa el caché .sqlx (no necesita base de datos en build).
ENV SQLX_OFFLINE=true
RUN cargo build --release

# ---- Etapa de runtime ----
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/polla-conecta /usr/local/bin/polla-conecta

ENV RUST_LOG=info
# Railway inyecta PORT; el binario lo lee (default 3000 en local).
CMD ["polla-conecta"]
