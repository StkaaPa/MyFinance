"""Histórico anual do património: um valor por ano (fim de ano), inserido à mão.

Só serve para anos SEM meses fechados. Quando fechas meses de um ano, o valor desse ano
passa a vir dos fechos e o valor manual deixa de ser usado (a API nem deixa guardá-lo).
"""
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import ligar_database
from backend.utils import historico_anual

router = APIRouter(prefix="/api/patrimonio-historico", tags=["histórico anual"])


class Linha(BaseModel):
    ano: int = Field(ge=1990, le=2100)
    valor: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)  # None = sem valor (apaga)


class Corpo(BaseModel):
    anos: list[Linha] = Field(max_length=60)


def anos_com_fechos(conn):
    return {r["ano"]: float(r["valor"]) for r in conn.execute("""
        SELECT EXTRACT(YEAR FROM f.mes_referencia)::int AS ano, SUM(s.saldo) AS valor
        FROM fechos_mensais f JOIN saldos_conta s ON s.fecho_id = f.id
        WHERE f.mes_referencia = (SELECT MAX(f2.mes_referencia) FROM fechos_mensais f2
              WHERE EXTRACT(YEAR FROM f2.mes_referencia) = EXTRACT(YEAR FROM f.mes_referencia))
        GROUP BY 1""").fetchall()}


@router.get("")
def listar():
    with ligar_database() as conn:
        tabela_existe = bool(conn.execute("SELECT to_regclass('public.patrimonio_historico') AS t").fetchone()["t"])
        manual = historico_anual(conn)
        fechos = anos_com_fechos(conn)
    return {"tabela_existe": tabela_existe, "ano_atual": date.today().year,
            "anos": [{"ano": a, "origem": "fechos" if a in fechos else "manual",
                      "valor": fechos[a] if a in fechos else manual[a]} for a in sorted(set(manual) | set(fechos))]}


@router.put("")
def guardar(corpo: Corpo):
    """Guarda vários anos de uma vez (tudo ou nada). valor = null apaga o ano."""
    anos = [l.ano for l in corpo.anos]
    if len(set(anos)) != len(anos):
        raise HTTPException(422, "Há anos repetidos.")
    with ligar_database() as conn:
        if not conn.execute("SELECT to_regclass('public.patrimonio_historico') AS t").fetchone()["t"]:
            raise HTTPException(500, "A tabela patrimonio_historico ainda não existe. Corre database/patrimonio_historico.sql no psql.")
        fechos = anos_com_fechos(conn)
        for l in corpo.anos:
            if l.ano in fechos and l.valor is not None:
                raise HTTPException(409, f"O ano {l.ano} já tem meses fechados: o valor vem dos fechos.")
            if l.valor is None:
                conn.execute("DELETE FROM patrimonio_historico WHERE ano = %s", (l.ano,))
            else:
                conn.execute("""INSERT INTO patrimonio_historico (ano, valor) VALUES (%s, %s)
                                ON CONFLICT (ano) DO UPDATE SET valor = EXCLUDED.valor""", (l.ano, l.valor))
    return listar()
