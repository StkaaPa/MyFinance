"""Contas: listar, criar, editar, ativar/desativar e apagar.

Apagar só é possível enquanto a conta não tem história (saldos em fechos, ativos ou objetivos ligados):
apagar uma conta com história mudava, para trás, o património de meses já fechados.
Nesses casos desativa-se a conta (deixa de aparecer nos fechos novos, mas o histórico fica).
"""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import ligar_database
from backend.utils import colunas_objetivos, tem_ativos

router = APIRouter(prefix="/api/contas", tags=["contas"])

Tipo = Literal["Conta Ordem", "Poupança", "Investimento", "Reforma"]


class NovaConta(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    instituicao: str = Field(min_length=1, max_length=60)
    tipo: Tipo


class AtualizarConta(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=60)
    instituicao: str | None = Field(default=None, min_length=1, max_length=60)
    tipo: Tipo | None = None
    ativo: bool | None = None


def nome_repetido(conn, nome, instituicao, ignorar_id=None):
    return conn.execute("SELECT 1 FROM contas WHERE lower(nome) = lower(%s) AND lower(instituicao) = lower(%s) AND id <> %s",
                        (nome, instituicao, ignorar_id if ignorar_id is not None else -1)).fetchone()


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
    nome, instituicao = conta.nome.strip(), conta.instituicao.strip()
    if not nome or not instituicao:
        raise HTTPException(422, "Preenche o nome e a instituição.")
    with ligar_database() as conn:
        if nome_repetido(conn, nome, instituicao):
            raise HTTPException(409, "Já existe uma conta com esse nome nessa instituição.")
        return conn.execute(
            "INSERT INTO contas (nome, instituicao, tipo) VALUES (%s, %s, %s) RETURNING id, nome, instituicao, tipo, ativo",
            (nome, instituicao, conta.tipo)).fetchone()


@router.patch("/{conta_id}")
def atualizar_conta(conta_id: int, corpo: AtualizarConta):
    """Muda o que for enviado: nome, instituição, tipo e/ou o interruptor 'Ativo'."""
    novos = {k: getattr(corpo, k) for k in ("nome", "instituicao", "tipo", "ativo") if getattr(corpo, k) is not None}
    for k in ("nome", "instituicao"):
        if k in novos:
            novos[k] = novos[k].strip()
            if not novos[k]:
                raise HTTPException(422, "Preenche o nome e a instituição.")
    with ligar_database() as conn:
        c = conn.execute("SELECT id, nome, instituicao, tipo, ativo FROM contas WHERE id = %s", (conta_id,)).fetchone()
        if not c:
            raise HTTPException(404, "Conta não encontrada")
        if {"nome", "instituicao"} & novos.keys() and nome_repetido(
                conn, novos.get("nome", c["nome"]), novos.get("instituicao", c["instituicao"]), conta_id):
            raise HTTPException(409, "Já existe uma conta com esse nome nessa instituição.")
        if "tipo" in novos and novos["tipo"] not in ("investimento", "reforma") and tem_ativos(conn) and conn.execute(
                "SELECT 1 FROM ativos WHERE conta_id = %s", (conta_id,)).fetchone():
            raise HTTPException(422, "Esta conta tem investimentos (ativos): só pode ser do tipo Investimento ou Reforma.")
        if novos:
            # os nomes das colunas vêm da lista fixa acima (nunca do pedido)
            c = conn.execute(f"UPDATE contas SET {', '.join(k + ' = %s' for k in novos)} WHERE id = %s "
                             "RETURNING id, nome, instituicao, tipo, ativo", (*novos.values(), conta_id)).fetchone()
        return c


@router.delete("/{conta_id}", status_code=204)
def apagar_conta(conta_id: int):
    with ligar_database() as conn:
        if not conn.execute("SELECT 1 FROM contas WHERE id = %s", (conta_id,)).fetchone():
            raise HTTPException(404, "Conta não encontrada")
        meses = conn.execute("SELECT COUNT(*) AS n FROM saldos_conta WHERE conta_id = %s", (conta_id,)).fetchone()["n"]
        if meses:
            raise HTTPException(409, f"Esta conta tem saldo em {meses} {'mês fechado' if meses == 1 else 'meses fechados'}. "
                                     "Para não perder o histórico, desativa-a em vez de a apagar.")
        if tem_ativos(conn) and conn.execute("SELECT 1 FROM ativos WHERE conta_id = %s", (conta_id,)).fetchone():
            raise HTTPException(409, "Esta conta tem investimentos (ativos) associados. Desativa-a em vez de a apagar.")
        if "conta_id" in colunas_objetivos(conn) and conn.execute("SELECT 1 FROM objetivos WHERE conta_id = %s", (conta_id,)).fetchone():
            raise HTTPException(409, "Esta conta está ligada a um objetivo (ou ao fundo de emergência). Muda a ligação do objetivo primeiro.")
        conn.execute("DELETE FROM contas WHERE id = %s", (conta_id,))
