"""Página Investimentos: valor de cada ativo, variação mensal, rendimento no ano e movimentos.

Rendimento = quanto o valor cresceu SEM contar o dinheiro que depositaste:
    rendimento de um mês = valor_este_mês - valor_mês_anterior - depositado_este_mês
O primeiro registo de um ativo é o ponto de partida (não conta como rendimento).
"""
from datetime import date

from fastapi import APIRouter

from backend.database import ligar_database
from backend.utils import MES, fecho_anterior, obter_fecho, tem_ativos

router = APIRouter(prefix="/api/investimentos", tags=["investimentos"])
TIPOS = ["investimento", "reforma"]


def fecho_base(conn, fecho):
    """Ponto de partida do ano: o último fecho do ano anterior; se não houver, o primeiro fecho deste ano."""
    inicio_ano = date(fecho["mes_referencia"].year, 1, 1)
    base = conn.execute("SELECT * FROM fechos_mensais WHERE mes_referencia < %s ORDER BY mes_referencia DESC LIMIT 1",
                        (inicio_ano,)).fetchone()
    if base:
        return base
    return conn.execute("""SELECT * FROM fechos_mensais WHERE mes_referencia >= %s AND mes_referencia < %s
                           ORDER BY mes_referencia LIMIT 1""", (inicio_ano, fecho["mes_referencia"])).fetchone()


def rendimento_ano(registos):
    """registos: lista [(valor, depositado), ...] por ordem de data. Devolve (rendimento, capital) ou (None, None)."""
    if len(registos) < 2:
        return None, None
    rendimento = sum(v - registos[i][0] - d for i, (v, d) in enumerate(registos[1:]))
    capital = registos[0][0] + sum(d for _, d in registos[1:])
    return round(rendimento, 2), round(capital, 2)


@router.get("")
def investimentos(mes: str | None = MES):
    with ligar_database() as conn:
        f = obter_fecho(conn, mes)
        ant = fecho_anterior(conn, f)
        base = fecho_base(conn, f)
        usa_ativos = tem_ativos(conn)
        ant_id = ant["id"] if ant else None
        itens, movimentos = [], []

        if usa_ativos:
            rows = conn.execute("""
                SELECT a.id, a.nome, a.classe, c.nome AS conta, v.valor, v.depositado,
                       (SELECT v2.valor FROM valores_ativo v2 WHERE v2.ativo_id = a.id AND v2.fecho_id = %s) AS valor_anterior
                FROM valores_ativo v JOIN ativos a ON a.id = v.ativo_id JOIN contas c ON c.id = a.conta_id
                WHERE v.fecho_id = %s ORDER BY v.valor DESC""", (ant_id, f["id"])).fetchall()
            historico = {}
            if base:
                for r in conn.execute("""
                        SELECT v.ativo_id, v.valor, v.depositado FROM valores_ativo v
                        JOIN fechos_mensais fm ON fm.id = v.fecho_id
                        WHERE fm.mes_referencia >= %s AND fm.mes_referencia <= %s
                        ORDER BY v.ativo_id, fm.mes_referencia""", (base["mes_referencia"], f["mes_referencia"])).fetchall():
                    historico.setdefault(r["ativo_id"], []).append((float(r["valor"]), float(r["depositado"])))
            for r in rows:
                rend, capital = rendimento_ano(historico.get(r["id"], []))
                itens.append({"id": r["id"], "nome": r["nome"], "classe": r["classe"], "conta": r["conta"],
                              "valor": float(r["valor"]), "depositado": float(r["depositado"]),
                              "valor_anterior": float(r["valor_anterior"]) if r["valor_anterior"] is not None else None,
                              "rendimento_ytd": rend, "capital_ytd": capital})
            movimentos = [
                {"data": r["data_fim"].isoformat(), "ativo": r["nome"], "classe": r["classe"], "valor": float(r["depositado"])}
                for r in conn.execute("""
                    SELECT fm.data_fim, a.nome, a.classe, v.depositado
                    FROM valores_ativo v JOIN ativos a ON a.id = v.ativo_id JOIN fechos_mensais fm ON fm.id = v.fecho_id
                    WHERE v.depositado <> 0 AND fm.mes_referencia <= %s
                    ORDER BY fm.mes_referencia DESC, a.nome LIMIT 30""", (f["mes_referencia"],)).fetchall()]

        # Contas de investimento SEM ativos: entram com o saldo (sem rendimento, não sabemos os depósitos)
        sem_ativos = "AND NOT EXISTS (SELECT 1 FROM valores_ativo v JOIN ativos a ON a.id = v.ativo_id " \
                     "WHERE a.conta_id = c.id AND v.fecho_id = s.fecho_id)" if usa_ativos else ""
        for r in conn.execute(f"""
                SELECT c.id, c.nome, s.saldo,
                       (SELECT s2.saldo FROM saldos_conta s2 WHERE s2.conta_id = c.id AND s2.fecho_id = %s) AS saldo_anterior
                FROM saldos_conta s JOIN contas c ON c.id = s.conta_id
                WHERE s.fecho_id = %s AND c.tipo = ANY(%s) {sem_ativos} ORDER BY s.saldo DESC""",
                (ant_id, f["id"], TIPOS)).fetchall():
            itens.append({"id": None, "nome": r["nome"], "classe": "outro", "conta": r["nome"],
                          "valor": float(r["saldo"]), "depositado": 0.0,
                          "valor_anterior": float(r["saldo_anterior"]) if r["saldo_anterior"] is not None else None,
                          "rendimento_ytd": None, "capital_ytd": None})

    return {"mes": f["mes_referencia"].strftime("%Y-%m"), "data_fim": f["data_fim"].isoformat(),
            "base_mes": base["mes_referencia"].strftime("%Y-%m") if base else None,
            "usa_ativos": usa_ativos, "itens": itens, "movimentos": movimentos}
