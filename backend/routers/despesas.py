from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import ligar_database
from backend.utils import MES, obter_fecho, pagina_categorias

router = APIRouter(prefix="/api/despesas", tags=["despesas"])

# Uma categoria "folha" é uma categoria sem subcategorias: só nelas se guardam valores.
FOLHA = "NOT EXISTS (SELECT 1 FROM categorias f WHERE f.categoria_pai_id = c.id)"


class NovaDespesa(BaseModel):
    mes: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    categoria_id: int
    valor: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    modo: Literal["somar", "definir"] = "somar"


@router.get("")
def despesas(mes: str | None = MES):
    """Dados da página: total, variação, categorias e detalhe por subcategoria."""
    with ligar_database() as conn:
        dados = pagina_categorias(conn, mes, "despesa")
        fecho = obter_fecho(conn, dados["mes"])
    dados["data_fim"] = fecho["data_fim"].isoformat()
    dados["total_valor"] = round(sum(c["valor"] for c in dados["categorias"]), 2)
    return dados


@router.get("/categorias")
def categorias_disponiveis():
    """Categorias de despesa onde se pode registar um valor (ativas e sem subcategorias)."""
    with ligar_database() as conn:
        return conn.execute(f"""
            SELECT c.id, c.nome, p.nome AS categoria_pai
            FROM categorias c LEFT JOIN categorias p ON p.id = c.categoria_pai_id
            WHERE c.tipo = 'despesa' AND c.ativo AND {FOLHA}
            ORDER BY COALESCE(p.nome, c.nome), c.nome""").fetchall()


@router.post("", status_code=201)
def registar_despesa(d: NovaDespesa):
    """Regista o valor de uma categoria num mês já criado.

    modo 'somar'   -> soma ao valor que já lá estava (ou cria, se não havia nada)
    modo 'definir' -> substitui o valor desse mês (serve para corrigir)
    """
    expressao = "movimentos_categoria.valor + EXCLUDED.valor" if d.modo == "somar" else "EXCLUDED.valor"
    with ligar_database() as conn:
        cat = conn.execute(
            f"SELECT c.id FROM categorias c WHERE c.id = %s AND c.tipo = 'despesa' AND c.ativo AND {FOLHA}",
            (d.categoria_id,)).fetchone()
        if not cat:
            raise HTTPException(422, "Escolhe uma categoria de despesa ativa e sem subcategorias.")
        fecho = conn.execute("SELECT id FROM fechos_mensais WHERE mes_referencia = %s::date",
                             (d.mes + "-01",)).fetchone()
        if not fecho:
            raise HTTPException(404, "Esse mês ainda não foi criado. Cria-o primeiro com o fecho de mês.")
        novo = conn.execute(
            f"""INSERT INTO movimentos_categoria (categoria_id, fecho_id, valor) VALUES (%s, %s, %s)
                ON CONFLICT (categoria_id, fecho_id) DO UPDATE SET valor = {expressao}
                RETURNING valor""",
            (d.categoria_id, fecho["id"], d.valor)).fetchone()
    return {"mes": d.mes, "categoria_id": d.categoria_id, "valor": float(novo["valor"])}
