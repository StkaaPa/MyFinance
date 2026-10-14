from fastapi import APIRouter
from backend.database import ligar_database
from backend.utils import (MES, eur, pct, variacao, obter_fecho, fecho_anterior, indicadores,
                           distribuicao, evolucao_anual, evolucao_mensal, valor_atual_objetivo)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(mes: str | None = MES):
    with ligar_database() as conn:
        f = obter_fecho(conn, mes)
        ant = fecho_anterior(conn, f)
        a = indicadores(conn, f["id"])
        b = indicadores(conn, ant["id"]) if ant else None
        por_tipo = conn.execute("""
            SELECT c.tipo AS nome, SUM(s.saldo) AS valor FROM saldos_conta s JOIN contas c ON c.id = s.conta_id
            WHERE s.fecho_id = %s GROUP BY c.tipo ORDER BY valor DESC""", (f["id"],)).fetchall()
        for r in por_tipo:
            r["valor"] = float(r["valor"])
        fundo = conn.execute("SELECT * FROM objetivos WHERE fundo_emergencia").fetchone()
        fundo_atual = valor_atual_objetivo(conn, fundo, f["id"]) if fundo else 0
        evolucao = evolucao_anual(conn)
        evolucao_meses = evolucao_mensal(conn, f["mes_referencia"])
    if fundo:
        p = fundo_atual / float(fundo["valor_alvo"]) * 100
        texto = f"O teu fundo de emergência está a {pct(p)} do objetivo."
    else:
        texto = "Ainda não definiste um fundo de emergência."
    return {
        "mes": f["mes_referencia"].strftime("%Y-%m"),
        "patrimonio": eur(a["patrimonio"]), "patrimonio_variacao": variacao(a["patrimonio"], b and b["patrimonio"]),
        "receitas": eur(a["receitas"]), "receitas_variacao": variacao(a["receitas"], b and b["receitas"]),
        "despesas": eur(a["despesas"]), "despesas_variacao": variacao(a["despesas"], b and b["despesas"]),
        "taxa_poupanca": pct(a["taxa"]),
        "taxa_variacao": f"{a['taxa'] - b['taxa']:+.1f} pp".replace(".", ",") if b else "—",
        "fundo_texto": texto, "evolucao": evolucao, "evolucao_mensal": evolucao_meses, "distribuicao": distribuicao(por_tipo),
        "centro": eur(a["patrimonio"]),
    }
