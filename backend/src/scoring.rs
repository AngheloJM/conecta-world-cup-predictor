//! Módulo de puntuación. Función PURA, sin I/O ni dependencias externas.
//! Sistema plano (igual en toda fase):
//!   10 · Marcador exacto
//!    7 · Diferencia de goles (mismo ganador, no empate, misma diferencia)
//!    5 · Resultado simple (misma tendencia, diferencia distinta, o empate correcto)
//!    2 · Consolación (tendencia equivocada pero aciertas los goles de un equipo)
//!    0 · Error total

/// Calcula el puntaje de un pronóstico contra el resultado real. **Función pura.**
pub fn calcular_puntos(goles_l: i32, goles_v: i32, pred_l: i32, pred_v: i32) -> u8 {
    // 10 · Marcador exacto.
    if goles_l == pred_l && goles_v == pred_v {
        return 10;
    }

    let dif_real = goles_l - goles_v;
    let dif_pred = pred_l - pred_v;
    let misma_tendencia = dif_real.signum() == dif_pred.signum();

    if misma_tendencia {
        // 7 · Mismo ganador (no empate) y misma diferencia de goles.
        if goles_l != goles_v && dif_real == dif_pred {
            return 7;
        }
        // 5 · Misma tendencia (ganador con diferencia distinta, o empate correcto no exacto).
        return 5;
    }

    // 2 · Tendencia equivocada, pero aciertas los goles exactos de un equipo.
    if goles_l == pred_l || goles_v == pred_v {
        return 2;
    }

    // 0 · Error total.
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marcador_exacto() {
        assert_eq!(calcular_puntos(2, 1, 2, 1), 10);
        assert_eq!(calcular_puntos(0, 0, 0, 0), 10);
    }

    #[test]
    fn diferencia_de_goles() {
        // mismo ganador (local) + misma diferencia (+2), no exacto
        assert_eq!(calcular_puntos(2, 0, 3, 1), 7);
        // mismo ejemplo del usuario: 1-0 vs 3-2 (+1 ambos) -> 7
        assert_eq!(calcular_puntos(3, 2, 1, 0), 7);
        // visitante con misma diferencia
        assert_eq!(calcular_puntos(0, 2, 1, 3), 7);
    }

    #[test]
    fn resultado_simple() {
        // mismo ganador, diferencia distinta (+2 real vs +1 pred)
        assert_eq!(calcular_puntos(2, 0, 1, 0), 5);
        // empate correcto, no exacto
        assert_eq!(calcular_puntos(2, 2, 1, 1), 5);
    }

    #[test]
    fn consolacion() {
        // real 1-3 (gana visita), pred 1-1 (empate) -> tendencia mal, pero local exacto (1==1)
        assert_eq!(calcular_puntos(1, 3, 1, 1), 2);
        // visitante exacto
        assert_eq!(calcular_puntos(3, 1, 0, 1), 2);
    }

    #[test]
    fn error_total() {
        // real 0-1 (gana visita), pred 2-0 (gana local), ningún gol coincide
        assert_eq!(calcular_puntos(0, 1, 2, 0), 0);
    }
}
