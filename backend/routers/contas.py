from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.database import ligar_database

router = APIRouter(prefix="/api/contas", tags=["contas"])


class NovaConta(BaseModel):
    nome: str = Field(min_length=1)
    instituicao: str = Field(min_length=1)
    tipo: Literal["conta_ordem", "poupanca", "investimento", "reforma"]


class EstadoConta(BaseModel):
    ativo: bool


@router.get("")
def listar_contas():
    with ligar_database() as conn:
        return conn.execute("""
            SELECT c.id, c.nome, c.instituicao, c.tipo, c.ativo,
              (SELECT s.saldo FROM saldos_conta s JOIN fechos_mensais f ON f.id = s.fecho_id
               WHERE s.conta_id = c.id ORDER BY f.mes_referencia DESC LIMIT 1) AS saldo
            FROM contas c ORDER BY c.id""").fetchall()


@router.post("", status_code=201)
def criar_conta(conta: NovaConta):
    with ligar_database() as conn:
        return conn.execute(
            "INSERT INTO contas (nome, instituicao, tipo) VALUES (%s, %s, %s) "
            "RETURNING id, nome, instituicao, tipo, ativo",
            (conta.nome, conta.instituicao, conta.tipo)).fetchone()


@router.patch("/{conta_id}")
def alterar_estado(conta_id: int, corpo: EstadoConta):
    """Liga/desliga uma conta (o interruptor 'Ativo')."""
    with ligar_database() as conn:
        c = conn.execute("UPDATE contas SET ativo = %s WHERE id = %s RETURNING id, nome, ativo",
                         (corpo.ativo, conta_id)).fetchone()
    if not c:
        raise HTTPException(404, "Conta não encontrada")
    return c
