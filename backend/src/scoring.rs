//! Módulo de puntuación. Función PURA, sin I/O ni dependencias externas.
//! Totalmente testeable de forma aislada.

/// Fase del partido. Determina la escala de puntos.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fase {
    Grupos,
    Dieciseisavos,
    Octavos,
    Cuartos,
    Semifinal,
    Final,
}

impl Fase {
    /// Parseo desde el ENUM `fase_partido` de PostgreSQL.
    pub fn from_db(s: &str) -> Option<Self> {
        match s {
            "Grupos" => Some(Fase::Grupos),
            "Dieciseisavos" => Some(Fase::Dieciseisavos),
            "Octavos" => Some(Fase::Octavos),
            "Cuartos" => Some(Fase::Cuartos),
            "Semifinal" => Some(Fase::Semifinal),
            "Final" => Some(Fase::Final),
            _ => None,
        }
    }
}

/// Devuelve `1` (local), `-1` (visitante) o `0` (empate) según el signo del marcador.
#[inline]
fn signo(local: i32, visitante: i32) -> i32 {
    (local - visitante).signum()
}

/// Algoritmo de cálculo de puntos escalados. **Función pura**.
///
/// - Resultado exacto:  Grupos +5 · 16vos/8vos/4tos +8 · Semifinal/Final +11
/// - Ganador / empate:  Grupos +3 · 16vos/8vos/4tos +5 · Semifinal/Final +7
/// - No acertó:         0
pub fn calcular_puntos(goles_l: i32, goles_v: i32, pred_l: i32, pred_v: i32, fase: Fase) -> u8 {
    // 1. Marcador exacto: máxima recompensa.
    if goles_l == pred_l && goles_v == pred_v {
        return match fase {
            Fase::Grupos => 5,
            Fase::Dieciseisavos | Fase::Octavos | Fase::Cuartos => 8,
            Fase::Semifinal | Fase::Final => 11,
        };
    }

    // 2. Mismo resultado (ganador o empate), pero marcador distinto.
    if signo(goles_l, goles_v) == signo(pred_l, pred_v) {
        return match fase {
            Fase::Grupos => 3,
            Fase::Dieciseisavos | Fase::Octavos | Fase::Cuartos => 5,
            Fase::Semifinal | Fase::Final => 7,
        };
    }

    // 3. No acertó nada.
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exacto_por_fase() {
        assert_eq!(calcular_puntos(2, 1, 2, 1, Fase::Grupos), 5);
        assert_eq!(calcular_puntos(2, 1, 2, 1, Fase::Octavos), 8);
        assert_eq!(calcular_puntos(2, 1, 2, 1, Fase::Cuartos), 8);
        assert_eq!(calcular_puntos(2, 1, 2, 1, Fase::Semifinal), 11);
        assert_eq!(calcular_puntos(2, 1, 2, 1, Fase::Final), 11);
    }

    #[test]
    fn ganador_correcto_marcador_distinto() {
        // Real 2-1 (gana local), predicho 3-0 (gana local)
        assert_eq!(calcular_puntos(2, 1, 3, 0, Fase::Grupos), 3);
        assert_eq!(calcular_puntos(2, 1, 3, 0, Fase::Cuartos), 5);
        assert_eq!(calcular_puntos(2, 1, 3, 0, Fase::Final), 7);
    }

    #[test]
    fn empate_correcto_marcador_distinto() {
        assert_eq!(calcular_puntos(1, 1, 2, 2, Fase::Grupos), 3);
        assert_eq!(calcular_puntos(0, 0, 3, 3, Fase::Semifinal), 7);
    }

    #[test]
    fn fallo_total() {
        // Real 2-1 (gana local), predicho 0-1 (gana visitante)
        assert_eq!(calcular_puntos(2, 1, 0, 1, Fase::Grupos), 0);
        assert_eq!(calcular_puntos(2, 1, 0, 1, Fase::Final), 0);
    }

    #[test]
    fn parseo_fase_desde_db() {
        assert_eq!(Fase::from_db("Cuartos"), Some(Fase::Cuartos));
        assert_eq!(Fase::from_db("desconocido"), None);
    }
}
