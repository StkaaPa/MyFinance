from math import ceil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.database import ligar_database
from backend.utils import eur, pct

router = APIRouter(prefix="/api/objetivos", tags=["objetivos"])


class NovoObjetivo(BaseModel):
    nome: str = Field(min_length=1)
    valor_alvo: float = Field(gt=0)
    valor_atual: float = Field(default=0, ge=0)
    contribuicao_mensal: float = Field(default=0, ge=0)
    fundo_emergencia: bool = False


class AtualizarObjetivo(BaseModel):
    valor_atual: float | None = Field(default=None, ge=0)
    contribuicao_mensal: float | None = Field(default=None, ge=0)
    concluido: bool | None = None


def formatar(o):
    alvo, atual, contrib = float(o["valor_alvo"]), float(o["valor_atual"]), float(o["contribuicao_mensal"])
    meses = ceil(max(alvo - atual, 0) / contrib) if contrib > 0 else None
    return {**o, "valor_alvo": alvo, "valor_atual": atual, "contribuicao_mensal": contrib,
            "percentagem": round(atual / alvo * 100, 1), "percentagem_texto": pct(atual / alvo * 100),
            "texto": f"{eur(atual)} / {eur(alvo)}", "meses_restantes": meses}


@router.get("")
def listar(estado: str = "todos"):
    filtro = {"todos": "TRUE", "em_andamento": "NOT concluido", "concluidos": "concluido"}.get(estado)
    if filtro is None:
        raise HTTPException(422, "estado: todos | em_andamento | concluidos")
    with ligar_database() as conn:
        rows = conn.execute(f"SELECT * FROM objetivos WHERE {filtro} ORDER BY id").fetchall()
    return [formatar(o) for o in rows]


@router.post("", status_code=201)
def criar(o: NovoObjetivo):
    with ligar_database() as conn:
        row = conn.execute(
            "INSERT INTO objetivos (nome, valor_alvo, valor_atual, contribuicao_mensal, fundo_emergencia) "
            "VALUES (%s,%s,%s,%s,%s) RETURNING *",
            (o.nome, o.valor_alvo, o.valor_atual, o.contribuicao_mensal, o.fundo_emergencia)).fetchone()
    return formatar(row)


@router.patch("/{objetivo_id}")
def atualizar(objetivo_id: int, c: AtualizarObjetivo):
    with ligar_database() as conn:
        row = conn.execute("""UPDATE objetivos SET valor_atual = COALESCE(%s, valor_atual),
            contribuicao_mensal = COALESCE(%s, contribuicao_mensal), concluido = COALESCE(%s, concluido)
            WHERE id = %s RETURNING *""", (c.valor_atual, c.contribuicao_mensal, c.concluido, objetivo_id)).fetchone()
    if not row:
        raise HTTPException(404, "Objetivo não encontrado")
    return formatar(row)
