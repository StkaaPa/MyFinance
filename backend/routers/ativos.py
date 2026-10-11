from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints

from backend.database import ligar_database
from backend.utils import tem_ativos

router = APIRouter(prefix="/api/ativos", tags=["ativos"])

TIPOS_CONTA = ["Investimento", "Reforma"]   # só estas contas podem ter ativos
SEM_TABELAS = "Ainda não criaste as tabelas dos ativos. Corre o ficheiro database/ativos.sql no psql."


class NovoAtivo(BaseModel):
    nome: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    classe: Literal["etf", "acao", "cripto", "ppr", "outro"]
    conta_id: int


class EstadoAtivo(BaseModel):
    ativo: bool


@router.get("")
def listar():
    with ligar_database() as conn:
        if not tem_ativos(conn):
            return []
        return conn.execute("""
            SELECT a.id, a.nome, a.classe, a.conta_id, c.nome AS conta, a.ativo
            FROM ativos a JOIN contas c ON c.id = a.conta_id ORDER BY c.id, a.nome""").fetchall()


@router.post("", status_code=201)
def criar(a: NovoAtivo):
    with ligar_database() as conn:
        if not tem_ativos(conn):
            raise HTTPException(503, SEM_TABELAS)
        conta = conn.execute("SELECT tipo, ativo FROM contas WHERE id = %s", (a.conta_id,)).fetchone()
        if not conta or not conta["ativo"]:
            raise HTTPException(422, "A conta escolhida não existe ou está inativa.")
        if conta["tipo"] not in TIPOS_CONTA:
            raise HTTPException(422, "Só as contas de Investimento ou Reforma podem ter ativos.")
        if conn.execute("SELECT 1 FROM ativos WHERE conta_id = %s AND lower(nome) = lower(%s) AND ativo",
                        (a.conta_id, a.nome)).fetchone():
            raise HTTPException(409, "Já existe um ativo com esse nome nessa conta.")
        return conn.execute(
            "INSERT INTO ativos (nome, classe, conta_id) VALUES (%s, %s, %s) "
            "RETURNING id, nome, classe, conta_id, ativo", (a.nome, a.classe, a.conta_id)).fetchone()


@router.patch("/{ativo_id}")
def alterar_estado(ativo_id: int, corpo: EstadoAtivo):
    """Desativa um ativo que já vendeste (o histórico fica), ou volta a ativá-lo."""
    with ligar_database() as conn:
        if not tem_ativos(conn):
            raise HTTPException(503, SEM_TABELAS)
        r = conn.execute("UPDATE ativos SET ativo = %s WHERE id = %s RETURNING id, nome, ativo",
                         (corpo.ativo, ativo_id)).fetchone()
    if not r:
        raise HTTPException(404, "Ativo não encontrado")
    return r
