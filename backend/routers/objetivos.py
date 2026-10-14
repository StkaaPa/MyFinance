"""Página Objetivos: metas de poupança (entrada de casa, carro, viagem...).

O fundo de emergência é um objetivo especial (fundo_emergencia = true) e gere-se na sua própria página.
Cada objetivo pode estar ligado a uma conta: o valor é então o saldo dessa conta no último fecho.
Sem conta, o valor é o que escreveres à mão (valor_atual).
"""
from decimal import Decimal
from math import ceil
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import ligar_database
from backend.utils import colunas_objetivos, valor_atual_objetivo

router = APIRouter(prefix="/api/objetivos", tags=["objetivos"])

Dinheiro = dict(max_digits=12, decimal_places=2)
Icone = Literal["alvo", "casa", "carro", "viagem", "estudos", "familia"]
MSG_SQL = "Ainda não correste o ficheiro database/objetivos.sql no psql (liga os objetivos a contas e dá-lhes ícones)."


class NovoObjetivo(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    valor_alvo: Decimal = Field(gt=0, **Dinheiro)
    valor_atual: Decimal = Field(default=0, ge=0, **Dinheiro)
    contribuicao_mensal: Decimal = Field(default=0, ge=0, **Dinheiro)
    conta_id: int | None = None
    icone: Icone = "alvo"


class AtualizarObjetivo(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=60)
    valor_alvo: Decimal | None = Field(default=None, gt=0, **Dinheiro)
    valor_atual: Decimal | None = Field(default=None, ge=0, **Dinheiro)
    contribuicao_mensal: Decimal | None = Field(default=None, ge=0, **Dinheiro)
    conta_id: int | None = None          # null (enviado de propósito) = desligar_database da conta
    icone: Icone | None = None
    concluido: bool | None = None


def formatar(o, atual):
    alvo, contrib = float(o["valor_alvo"]), float(o["contribuicao_mensal"])
    concluido = bool(o["concluido"]) or atual >= alvo
    falta = max(alvo - atual, 0)
    return {"id": o["id"], "nome": o["nome"], "valor_alvo": alvo, "atual": atual, "contribuicao": contrib,
            "percentagem": round(atual / alvo * 100, 1), "concluido": concluido,
            "meses_restantes": 0 if concluido else (ceil(falta / contrib) if contrib > 0 else None),
            "fundo_emergencia": o["fundo_emergencia"], "icone": "alvo" if "icone" not in o else o["icone"],
            "conta_id": o.get("conta_id")}


def conta_valida(conn, conta_id, colunas):
    if conta_id is None:
        return
    if "conta_id" not in colunas:
        raise HTTPException(503, MSG_SQL)
    if not conn.execute("SELECT 1 FROM contas WHERE id = %s AND ativo", (conta_id,)).fetchone():
        raise HTTPException(422, "A conta escolhida não existe ou está inativa.")


def obter_formatado(conn, objetivo_id):
    o = conn.execute("SELECT * FROM objetivos WHERE id = %s", (objetivo_id,)).fetchone()
    if not o:
        raise HTTPException(404, "Objetivo não encontrado")
    ultimo = conn.execute("SELECT id FROM fechos_mensais ORDER BY mes_referencia DESC LIMIT 1").fetchone()
    return formatar(o, valor_atual_objetivo(conn, o, ultimo["id"] if ultimo else None))


@router.get("")
def listar():
    with ligar_database() as conn:
        ultimo = conn.execute("SELECT id FROM fechos_mensais ORDER BY mes_referencia DESC LIMIT 1").fetchone()
        fecho_id = ultimo["id"] if ultimo else None
        rows = conn.execute("SELECT * FROM objetivos ORDER BY fundo_emergencia DESC, id").fetchall()
        contas = {c["id"]: c["nome"] for c in conn.execute("SELECT id, nome FROM contas").fetchall()}
        saida = []
        for o in rows:
            f = formatar(o, valor_atual_objetivo(conn, o, fecho_id))
            f["conta"] = contas.get(f["conta_id"])
            saida.append(f)
    return saida


@router.post("", status_code=201)
def criar(o: NovoObjetivo):
    with ligar_database() as conn:
        colunas = colunas_objetivos(conn)
        conta_valida(conn, o.conta_id, colunas)
        if o.icone != "alvo" and "icone" not in colunas:
            raise HTTPException(503, MSG_SQL)
        oid = conn.execute(
            "INSERT INTO objetivos (nome, valor_alvo, valor_atual, contribuicao_mensal) VALUES (%s,%s,%s,%s) RETURNING id",
            (o.nome.strip(), o.valor_alvo, 0 if o.conta_id else o.valor_atual, o.contribuicao_mensal)).fetchone()["id"]
        if "conta_id" in colunas:
            conn.execute("UPDATE objetivos SET conta_id = %s WHERE id = %s", (o.conta_id, oid))
        if "icone" in colunas:
            conn.execute("UPDATE objetivos SET icone = %s WHERE id = %s", (o.icone, oid))
        return obter_formatado(conn, oid)


@router.patch("/{objetivo_id}")
def atualizar(objetivo_id: int, c: AtualizarObjetivo):
    campos = c.model_fields_set
    with ligar_database() as conn:
        o = conn.execute("SELECT * FROM objetivos WHERE id = %s", (objetivo_id,)).fetchone()
        if not o:
            raise HTTPException(404, "Objetivo não encontrado")
        colunas = colunas_objetivos(conn)
        if "conta_id" in campos:
            conta_valida(conn, c.conta_id, colunas)
        if "icone" in campos and c.icone != "alvo" and "icone" not in colunas:
            raise HTTPException(503, MSG_SQL)
        novos = {k: getattr(c, k) for k in ("nome", "valor_alvo", "valor_atual", "contribuicao_mensal", "icone", "concluido")
                 if k in campos and getattr(c, k) is not None and (k != "icone" or "icone" in colunas)}
        if "conta_id" in campos and "conta_id" in colunas:
            novos["conta_id"] = c.conta_id
            if c.conta_id is not None:
                novos["valor_atual"] = 0
        if "nome" in novos:
            novos["nome"] = novos["nome"].strip()
        if novos:
            # os nomes das colunas vêm da lista fixa acima (nunca do pedido), por isso é seguro compô-los aqui
            conn.execute(f"UPDATE objetivos SET {', '.join(k + ' = %s' for k in novos)} WHERE id = %s",
                         (*novos.values(), objetivo_id))
        return obter_formatado(conn, objetivo_id)


@router.delete("/{objetivo_id}", status_code=204)
def apagar(objetivo_id: int):
    with ligar_database() as conn:
        o = conn.execute("SELECT fundo_emergencia FROM objetivos WHERE id = %s", (objetivo_id,)).fetchone()
        if not o:
            raise HTTPException(404, "Objetivo não encontrado")
        if o["fundo_emergencia"]:
            raise HTTPException(409, "O fundo de emergência não se apaga aqui. Gere-o na página Fundo Emergência.")
        conn.execute("DELETE FROM objetivos WHERE id = %s", (objetivo_id,))
