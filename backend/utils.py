"""Funções partilhadas pelas rotas: formatação, fechos e cálculos."""
from fastapi import HTTPException, Query

# Parâmetro opcional ?mes=AAAA-MM. Se omitido, usa-se o último mês fechado.
MES = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="AAAA-MM; omitido = último fecho")


def eur(v, casas=0):
    s = f"{float(v or 0):,.{casas}f}"
    return "€ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def pct(v, casas=1):
    return f"{float(v):.{casas}f}".replace(".", ",") + "%"


def variacao(atual, anterior):
    """Variação percentual face ao mês anterior, como texto ('+2,3%')."""
    if not anterior:
        return "—"
    v = (float(atual) - float(anterior)) / float(anterior) * 100
    return f"{v:+.1f}%".replace(".", ",")


def obter_fecho(conn, mes=None):
    if mes:
        f = conn.execute("SELECT * FROM fechos_mensais WHERE mes_referencia = %s::date", (mes + "-01",)).fetchone()
    else:
        f = conn.execute("SELECT * FROM fechos_mensais ORDER BY mes_referencia DESC LIMIT 1").fetchone()
    if not f:
        raise HTTPException(404, "Ainda não existe nenhum fecho para este mês")
    return f


def fecho_anterior(conn, fecho):
    return conn.execute(
        "SELECT * FROM fechos_mensais WHERE mes_referencia < %s ORDER BY mes_referencia DESC LIMIT 1",
        (fecho["mes_referencia"],),
    ).fetchone()


def total_saldos(conn, fecho_id, tipos=None):
    sql = ("SELECT COALESCE(SUM(s.saldo),0) AS t FROM saldos_conta s "
           "JOIN contas c ON c.id = s.conta_id WHERE s.fecho_id = %s")
    params = [fecho_id]
    if tipos:
        sql += " AND c.tipo = ANY(%s)"
        params.append(tipos)
    return float(conn.execute(sql, params).fetchone()["t"])


def total_categorias(conn, fecho_id, tipo):
    return float(conn.execute(
        "SELECT COALESCE(SUM(m.valor),0) AS t FROM movimentos_categoria m "
        "JOIN categorias c ON c.id = m.categoria_id WHERE m.fecho_id = %s AND c.tipo = %s",
        (fecho_id, tipo),
    ).fetchone()["t"])


def indicadores(conn, fecho_id):
    """Os 4 números do topo do dashboard, para um fecho."""
    rec = total_categorias(conn, fecho_id, "receita")
    desp = total_categorias(conn, fecho_id, "despesa")
    return {"patrimonio": total_saldos(conn, fecho_id), "receitas": rec, "despesas": desp,
            "taxa": (rec - desp) / rec * 100 if rec else 0.0}


def distribuicao(rows, chave="nome"):
    total = sum(r["valor"] for r in rows)
    return [{"nome": r[chave], "valor": r["valor"],
             "percentagem": round(r["valor"] / total * 100, 1) if total else 0} for r in rows]


def evolucao_anual(conn, anos=5):
    """Património no último mês fechado de cada ano (últimos N anos)."""
    rows = conn.execute("""
        SELECT EXTRACT(YEAR FROM f.mes_referencia)::int AS ano, SUM(s.saldo) AS patrimonio
        FROM fechos_mensais f JOIN saldos_conta s ON s.fecho_id = f.id
        WHERE f.mes_referencia = (SELECT MAX(f2.mes_referencia) FROM fechos_mensais f2
              WHERE EXTRACT(YEAR FROM f2.mes_referencia) = EXTRACT(YEAR FROM f.mes_referencia))
        GROUP BY 1 ORDER BY 1 DESC LIMIT %s""", (anos,)).fetchall()
    return [{"ano": r["ano"], "patrimonio": float(r["patrimonio"])} for r in reversed(rows)]


def evolucao_mensal(conn, ate, meses=12):
    """Património de cada mês fechado, até ao mês escolhido (últimos N meses)."""
    rows = conn.execute("""
        SELECT to_char(f.mes_referencia, 'YYYY-MM') AS mes, SUM(s.saldo) AS patrimonio
        FROM fechos_mensais f JOIN saldos_conta s ON s.fecho_id = f.id
        WHERE f.mes_referencia <= %s
        GROUP BY f.id ORDER BY f.mes_referencia DESC LIMIT %s""", (ate, meses)).fetchall()
    return [{"mes": r["mes"], "patrimonio": float(r["patrimonio"])} for r in reversed(rows)]


def valores_folhas(conn, fecho_id, tipo):
    rows = conn.execute("""
        SELECT c.id, COALESCE(p.nome, c.nome) AS categoria, c.nome, m.valor
        FROM movimentos_categoria m JOIN categorias c ON c.id = m.categoria_id
        LEFT JOIN categorias p ON p.id = c.categoria_pai_id
        WHERE m.fecho_id = %s AND c.tipo = %s ORDER BY m.valor DESC""", (fecho_id, tipo)).fetchall()
    for r in rows:
        r["valor"] = float(r["valor"])
    return rows


def pagina_categorias(conn, mes, tipo):
    """Resposta comum às páginas Despesas e Receitas."""
    f = obter_fecho(conn, mes)
    ant = fecho_anterior(conn, f)
    atual = valores_folhas(conn, f["id"], tipo)
    antes = valores_folhas(conn, ant["id"], tipo) if ant else []
    total, total_ant = sum(r["valor"] for r in atual), sum(r["valor"] for r in antes)
    por_cat, ant_cat = {}, {}
    for r in atual:
        por_cat[r["categoria"]] = por_cat.get(r["categoria"], 0) + r["valor"]
    for r in antes:
        ant_cat[r["categoria"]] = ant_cat.get(r["categoria"], 0) + r["valor"]
    ant_folha = {r["id"]: r["valor"] for r in antes}
    return {
        "mes": f["mes_referencia"].strftime("%Y-%m"),
        "total": eur(total, 2), "centro": eur(total), "variacao": variacao(total, total_ant),
        "categorias": [{"categoria": k, "valor": v, "percentagem": round(v / total * 100, 1) if total else 0,
                        "variacao": variacao(v, ant_cat.get(k))} for k, v in sorted(por_cat.items(), key=lambda x: -x[1])],
        "detalhe": [{"categoria": r["categoria"], "nome": r["nome"], "valor": r["valor"],
                     "variacao": variacao(r["valor"], ant_folha.get(r["id"]))} for r in atual],
    }


def tem_ativos(conn):
    """True se as tabelas dos ativos já foram criadas (database/ativos.sql)."""
    return conn.execute("SELECT to_regclass('public.ativos') IS NOT NULL "
                        "AND to_regclass('public.valores_ativo') IS NOT NULL AS ok").fetchone()["ok"]
