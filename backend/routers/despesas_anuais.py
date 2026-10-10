from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.database import ligar_database
from backend.utils import eur

router = APIRouter(prefix="/api/despesas-anuais", tags=["despesas anuais"])


class NovaDespesaAnual(BaseModel):
    data: date
    descricao: str = Field(min_length=1)
    valor: float = Field(ge=0)


class EstadoPago(BaseModel):
    pago: bool


@router.get("")
def listar(ano: int | None = None):
    ano = ano or date.today().year
    with ligar_database() as conn:
        rows = conn.execute("SELECT id, data, descricao, valor, pago FROM despesas_anuais "
                            "WHERE EXTRACT(YEAR FROM data) = %s ORDER BY data", (ano,)).fetchall()
        prox = conn.execute("SELECT COALESCE(SUM(valor),0) AS t FROM despesas_anuais WHERE NOT pago "
                            "AND data >= CURRENT_DATE AND data < CURRENT_DATE + INTERVAL '3 months'").fetchone()["t"]
    for r in rows:
        r["valor"], r["estado"] = float(r["valor"]), "Pago" if r["pago"] else "Previsto"
    return {"ano": ano, "despesas": rows,
            "resumo": f"Nos próximos 3 meses tens {eur(prox, 2)} em despesas extraordinárias previstas."}


@router.post("", status_code=201)
def criar(d: NovaDespesaAnual):
    with ligar_database() as conn:
        return conn.execute("INSERT INTO despesas_anuais (data, descricao, valor) VALUES (%s,%s,%s) "
                            "RETURNING id, data, descricao, valor, pago", (d.data, d.descricao, d.valor)).fetchone()


@router.patch("/{despesa_id}")
def marcar_pago(despesa_id: int, e: EstadoPago):
    with ligar_database() as conn:
        r = conn.execute("UPDATE despesas_anuais SET pago = %s WHERE id = %s RETURNING id, pago",
                         (e.pago, despesa_id)).fetchone()
    if not r:
        raise HTTPException(404, "Despesa não encontrada")
    return r
