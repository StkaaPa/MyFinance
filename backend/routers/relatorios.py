from fastapi import APIRouter
from backend.database import ligar_database
from backend.utils import evolucao_anual

router = APIRouter(prefix="/api/relatorios", tags=["relatórios"])


@router.get("")
def relatorios():
    with ligar_database() as conn:
        medias = conn.execute("""
            WITH ult AS (SELECT id FROM fechos_mensais ORDER BY mes_referencia DESC LIMIT 6)
            SELECT COALESCE(p.nome, c.nome) AS categoria, SUM(m.valor) / (SELECT COUNT(*) FROM ult) AS media
            FROM movimentos_categoria m JOIN ult ON ult.id = m.fecho_id
            JOIN categorias c ON c.id = m.categoria_id LEFT JOIN categorias p ON p.id = c.categoria_pai_id
            WHERE c.tipo = 'despesa' GROUP BY 1 ORDER BY media DESC""").fetchall()
        meses = conn.execute("""
            SELECT to_char(f.mes_referencia, 'YYYY-MM') AS mes,
              COALESCE(SUM(m.valor) FILTER (WHERE c.tipo = 'receita'), 0) AS receitas,
              COALESCE(SUM(m.valor) FILTER (WHERE c.tipo = 'despesa'), 0) AS despesas
            FROM fechos_mensais f LEFT JOIN movimentos_categoria m ON m.fecho_id = f.id
            LEFT JOIN categorias c ON c.id = m.categoria_id
            GROUP BY f.id ORDER BY f.mes_referencia DESC LIMIT 12""").fetchall()
        evolucao = evolucao_anual(conn)
    poupanca = [{"mes": m["mes"], "taxa": round(float(m["receitas"] - m["despesas"]) / float(m["receitas"]) * 100, 1)
                 if m["receitas"] else None} for m in reversed(meses)]
    return {"evolucao": evolucao, "poupanca": poupanca,
            "media_despesas": [{"categoria": r["categoria"], "media": round(float(r["media"]), 2)} for r in medias]}
