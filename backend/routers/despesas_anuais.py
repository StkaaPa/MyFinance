"""Página Despesas Anuais: gastos extraordinários que sabes que vêm (seguro, inspeção, IUC...).

Não fazem parte do fecho mensal: servem para te avisarem do que aí vem. A tabela despesas_anuais já existia.
"""
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import ligar_database

router = APIRouter(prefix="/api/despesas-anuais", tags=["despesas anuais"])


class NovaDespesaAnual(BaseModel):
    data: date
    descricao: str = Field(min_length=1, max_length=80)
    valor: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    pago: bool = False


class AtualizarDespesaAnual(BaseModel):
    data: date | None = None
    descricao: str | None = Field(default=None, min_length=1, max_length=80)
    valor: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    pago: bool | None = None


def formatar(r, hoje):
    # Pago | Previsto (ainda vai chegar) | Em atraso (a data passou e não marcaste como paga)
    estado = "Pago" if r["pago"] else ("Previsto" if r["data"] >= hoje else "Em atraso")
    return {"id": r["id"], "data": r["data"].isoformat(), "descricao": r["descricao"],
            "valor": float(r["valor"]), "pago": r["pago"], "estado": estado}


@router.get("")
def listar(ano: int | None = None):
    with ligar_database() as conn:
        hoje = conn.execute("SELECT CURRENT_DATE AS d").fetchone()["d"]
        ano = ano or hoje.year
        rows = conn.execute("SELECT id, data, descricao, valor, pago FROM despesas_anuais "
                            "WHERE EXTRACT(YEAR FROM data) = %s ORDER BY data, id", (ano,)).fetchall()
        # só conta o que ainda não pagaste e vence nos próximos 3 meses
        prox = conn.execute("SELECT COALESCE(SUM(valor), 0) AS t FROM despesas_anuais WHERE NOT pago "
                            "AND data >= %s AND data < %s::date + INTERVAL '3 months'", (hoje, hoje)).fetchone()["t"]
        anos = [int(r["a"]) for r in conn.execute(
            "SELECT DISTINCT EXTRACT(YEAR FROM data) AS a FROM despesas_anuais").fetchall()]
    anos = sorted(set(anos) | {hoje.year, hoje.year + 1}, reverse=True)
    return {"ano": ano, "anos": anos, "despesas": [formatar(r, hoje) for r in rows], "proximos_3_meses": float(prox)}


@router.post("", status_code=201)
def criar(d: NovaDespesaAnual):
    with ligar_database() as conn:
        r = conn.execute("INSERT INTO despesas_anuais (data, descricao, valor, pago) VALUES (%s,%s,%s,%s) "
                         "RETURNING id, data, descricao, valor, pago", (d.data, d.descricao.strip(), d.valor, d.pago)).fetchone()
        return formatar(r, conn.execute("SELECT CURRENT_DATE AS d").fetchone()["d"])


@router.patch("/{despesa_id}")
def atualizar(despesa_id: int, c: AtualizarDespesaAnual):
    novos = {k: getattr(c, k) for k in ("data", "descricao", "valor", "pago") if getattr(c, k) is not None}
    if "descricao" in novos:
        novos["descricao"] = novos["descricao"].strip()
    with ligar_database() as conn:
        if not novos:
            r = conn.execute("SELECT id, data, descricao, valor, pago FROM despesas_anuais WHERE id = %s", (despesa_id,)).fetchone()
        else:
            # os nomes das colunas vêm da lista fixa acima (nunca do pedido)
            r = conn.execute(f"UPDATE despesas_anuais SET {', '.join(k + ' = %s' for k in novos)} WHERE id = %s "
                             "RETURNING id, data, descricao, valor, pago", (*novos.values(), despesa_id)).fetchone()
        if not r:
            raise HTTPException(404, "Despesa não encontrada")
        return formatar(r, conn.execute("SELECT CURRENT_DATE AS d").fetchone()["d"])


@router.delete("/{despesa_id}", status_code=204)
def apagar(despesa_id: int):
    with ligar_database() as conn:
        if not conn.execute("DELETE FROM despesas_anuais WHERE id = %s RETURNING id", (despesa_id,)).fetchone():
            raise HTTPException(404, "Despesa não encontrada")
