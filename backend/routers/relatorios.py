"""Página Relatórios: tudo calculado a partir dos fechos mensais (nada é guardado à parte).

Um só pedido devolve os dados dos quatro separadores: tendências, comparativos, taxa de poupança e distribuição.
"""
from fastapi import APIRouter

from backend.database import ligar_database

router = APIRouter(prefix="/api/relatorios", tags=["relatórios"])

INVEST = ("investimento", "reforma")
LIQUIDEZ = ("conta_ordem", "poupanca")


def por_categoria(conn, fecho_id, tipo):
    """Total por categoria "mãe" (as subcategorias somam na categoria de cima) para um fecho."""
    rows = conn.execute("""
        SELECT COALESCE(p.nome, c.nome) AS categoria, SUM(m.valor) AS valor
        FROM movimentos_categoria m JOIN categorias c ON c.id = m.categoria_id
        LEFT JOIN categorias p ON p.id = c.categoria_pai_id
        WHERE m.fecho_id = %s AND c.tipo = %s GROUP BY 1""", (fecho_id, tipo)).fetchall()
    return {r["categoria"]: float(r["valor"]) for r in rows}


@router.get("")
def relatorios():
    with ligar_database() as conn:
        fechos = conn.execute("SELECT id, to_char(mes_referencia, 'YYYY-MM') AS mes FROM fechos_mensais ORDER BY mes_referencia").fetchall()
        if not fechos:
            return {"vazio": True}

        # --- património por fecho, separado em investimentos/reforma e liquidez (contas à ordem + poupança) ---
        pat = {r["mes"]: r for r in conn.execute("""
            SELECT to_char(f.mes_referencia, 'YYYY-MM') AS mes,
                   COALESCE(SUM(s.saldo) FILTER (WHERE c.tipo = ANY(%s)), 0) AS investimentos,
                   COALESCE(SUM(s.saldo) FILTER (WHERE c.tipo = ANY(%s)), 0) AS liquidez
            FROM fechos_mensais f JOIN saldos_conta s ON s.fecho_id = f.id JOIN contas c ON c.id = s.conta_id
            GROUP BY f.id, f.mes_referencia""", (list(INVEST), list(LIQUIDEZ))).fetchall()}
        meses = [f["mes"] for f in fechos]
        ultimos_por_ano = {}
        for m in meses:                      # o último mês fechado de cada ano
            ultimos_por_ano[m[:4]] = m
        # Com menos de 2 anos de dados, barras por ano seriam uma só: mostra mês a mês (como no Dashboard)
        if len(ultimos_por_ano) >= 2:
            modo, escolhidos = "anual", list(ultimos_por_ano.values())[-6:]
        else:
            modo, escolhidos = "mensal", meses[-12:]
        barras = [{"rotulo": m[:4] if modo == "anual" else m, "mes": m,
                   "investimentos": float(pat[m]["investimentos"]) if m in pat else 0.0,
                   "liquidez": float(pat[m]["liquidez"]) if m in pat else 0.0} for m in escolhidos]

        # --- receitas, despesas e taxa de poupança por mês (últimos 12) ---
        rd = conn.execute("""
            SELECT to_char(f.mes_referencia, 'YYYY-MM') AS mes,
                   COALESCE(SUM(m.valor) FILTER (WHERE c.tipo = 'receita'), 0) AS receitas,
                   COALESCE(SUM(m.valor) FILTER (WHERE c.tipo = 'despesa'), 0) AS despesas
            FROM fechos_mensais f LEFT JOIN movimentos_categoria m ON m.fecho_id = f.id
            LEFT JOIN categorias c ON c.id = m.categoria_id
            GROUP BY f.id, f.mes_referencia ORDER BY f.mes_referencia DESC LIMIT 12""").fetchall()[::-1]
        comparativo_meses = [{"mes": r["mes"], "receitas": float(r["receitas"]), "despesas": float(r["despesas"])} for r in rd]
        taxas = [{"mes": r["mes"], "taxa": round((float(r["receitas"]) - float(r["despesas"])) / float(r["receitas"]) * 100, 1)
                  if r["receitas"] else None} for r in rd]
        validas = [t for t in taxas if t["taxa"] is not None]
        poupanca = {"meses": taxas,
                    "media": round(sum(t["taxa"] for t in validas) / len(validas), 1) if validas else None,
                    "melhor": max(validas, key=lambda t: t["taxa"]) if validas else None,
                    "pior": min(validas, key=lambda t: t["taxa"]) if validas else None}

        # --- média mensal de despesas por categoria (últimos 6 fechos) ---
        ids6 = [f["id"] for f in fechos[-6:]]
        soma = {}
        for i in ids6:
            for cat, v in por_categoria(conn, i, "despesa").items():
                soma[cat] = soma.get(cat, 0) + v
        media_despesas = {"meses": len(ids6), "categorias": sorted(
            [{"categoria": c, "media": round(v / len(ids6), 2)} for c, v in soma.items()], key=lambda x: -x["media"])}

        # --- último mês contra o anterior, por categoria de despesa ---
        atual = por_categoria(conn, fechos[-1]["id"], "despesa")
        anterior = por_categoria(conn, fechos[-2]["id"], "despesa") if len(fechos) > 1 else {}
        categorias = sorted(
            [{"categoria": c, "atual": atual.get(c, 0.0), "anterior": anterior.get(c, 0.0),
              "variacao": round((atual.get(c, 0.0) - anterior[c]) / anterior[c] * 100, 1) if anterior.get(c) else None}
             for c in set(atual) | set(anterior)], key=lambda x: -x["atual"])

        # --- distribuição no último mês: património por tipo de conta e despesas por categoria ---
        contas = conn.execute("""SELECT c.tipo AS nome, SUM(s.saldo) AS valor FROM saldos_conta s JOIN contas c ON c.id = s.conta_id
                                 WHERE s.fecho_id = %s GROUP BY c.tipo ORDER BY valor DESC""", (fechos[-1]["id"],)).fetchall()

    def com_percentagem(itens):
        total = sum(i["valor"] for i in itens)
        return [{**i, "percentagem": round(i["valor"] / total * 100, 1) if total else 0} for i in itens]

    return {
        "vazio": False,
        "mes": fechos[-1]["mes"], "mes_anterior": fechos[-2]["mes"] if len(fechos) > 1 else None,
        "patrimonio": {"modo": modo, "barras": barras},
        "media_despesas": media_despesas,
        "comparativo": {"meses": comparativo_meses, "categorias": categorias},
        "poupanca": poupanca,
        "distribuicao": {
            "contas": com_percentagem([{"nome": r["nome"], "valor": float(r["valor"])} for r in contas]),
            "despesas": com_percentagem([{"nome": c, "valor": v} for c, v in sorted(atual.items(), key=lambda x: -x[1])]),
        },
    }
