"""Página Fundo de Emergência.

O fundo é o objetivo marcado com fundo_emergencia = true (só pode haver um).
Pode estar ligado a uma conta (objetivos.conta_id): nesse caso o valor de cada mês é o saldo dessa conta
no fecho, e a evolução desenha-se sozinha. Sem conta, usa-se o valor_atual escrito à mão (sem evolução).
"""
from decimal import Decimal
from math import ceil

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import ligar
from backend.utils import total_categorias

router = APIRouter(prefix="/api/fundo-emergencia", tags=["fundo de emergência"])


class FundoIn(BaseModel):
    valor_alvo: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    contribuicao_mensal: Decimal = Field(default=0, ge=0, max_digits=12, decimal_places=2)
    conta_id: int | None = None
    valor_atual: Decimal = Field(default=0, ge=0, max_digits=12, decimal_places=2)   # só conta se não houver conta


def tem_coluna_conta(conn):
    return conn.execute("""SELECT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'objetivos' AND column_name = 'conta_id') AS ok""").fetchone()["ok"]


@router.get("")
def fundo():
    with ligar() as conn:
        o = conn.execute("SELECT * FROM objetivos WHERE fundo_emergencia").fetchone()
        if not o:
            return {"existe": False}
        com_coluna = tem_coluna_conta(conn)
        conta_id = o.get("conta_id") if com_coluna else None
        ultimo = conn.execute("SELECT * FROM fechos_mensais ORDER BY mes_referencia DESC LIMIT 1").fetchone()

        atual, evolucao, conta, cobertura = float(o["valor_atual"]), [], None, None
        if conta_id:
            conta = conn.execute("SELECT nome FROM contas WHERE id = %s", (conta_id,)).fetchone()["nome"]
            atual = 0.0
            if ultimo:
                # evolução: um ponto por fecho do ano do último fecho (como na página de Dashboard, é por mês)
                evolucao = [{"mes": r["mes"], "valor": float(r["saldo"])} for r in conn.execute("""
                    SELECT to_char(f.mes_referencia, 'YYYY-MM') AS mes, s.saldo
                    FROM fechos_mensais f JOIN saldos_conta s ON s.fecho_id = f.id AND s.conta_id = %s
                    WHERE EXTRACT(YEAR FROM f.mes_referencia) = %s ORDER BY f.mes_referencia""",
                    (conta_id, ultimo["mes_referencia"].year)).fetchall()]
                ultimo_saldo = conn.execute("SELECT saldo FROM saldos_conta WHERE conta_id = %s AND fecho_id = %s",
                                            (conta_id, ultimo["id"])).fetchone()
                atual = float(ultimo_saldo["saldo"]) if ultimo_saldo else 0.0

        # Quantos meses de despesas o fundo cobre (média dos últimos 3 fechos)
        if ultimo:
            ids = [r["id"] for r in conn.execute("SELECT id FROM fechos_mensais ORDER BY mes_referencia DESC LIMIT 3").fetchall()]
            media = sum(total_categorias(conn, i, "despesa") for i in ids) / len(ids)
            cobertura = round(atual / media, 1) if media > 0 else None

    alvo, contrib = float(o["valor_alvo"]), float(o["contribuicao_mensal"])
    falta = max(alvo - atual, 0)
    return {"existe": True, "nome": o["nome"], "valor_alvo": alvo, "atual": atual, "contribuicao": contrib,
            "percentagem": round(atual / alvo * 100, 1),
            "meses_restantes": (ceil(falta / contrib) if falta > 0 else 0) if (contrib > 0 or falta == 0) else None,
            "conta_id": conta_id, "conta": conta, "suporta_conta": com_coluna,
            "evolucao": evolucao, "meses_cobertos": cobertura}


@router.put("")
def guardar(f: FundoIn):
    """Cria o fundo de emergência ou atualiza o que já existe."""
    with ligar() as conn:
        com_coluna = tem_coluna_conta(conn)
        if f.conta_id is not None:
            if not com_coluna:
                raise HTTPException(503, "Ainda não ligaste o fundo a uma conta na base de dados. "
                                         "Corre o ficheiro database/fundo_emergencia.sql no psql.")
            if not conn.execute("SELECT 1 FROM contas WHERE id = %s AND ativo", (f.conta_id,)).fetchone():
                raise HTTPException(422, "A conta escolhida não existe ou está inativa.")
        existe = conn.execute("SELECT id FROM objetivos WHERE fundo_emergencia").fetchone()
        valor_atual = 0 if f.conta_id is not None else f.valor_atual
        if existe:
            conn.execute("UPDATE objetivos SET valor_alvo = %s, contribuicao_mensal = %s, valor_atual = %s WHERE id = %s",
                         (f.valor_alvo, f.contribuicao_mensal, valor_atual, existe["id"]))
            oid = existe["id"]
        else:
            oid = conn.execute("""INSERT INTO objetivos (nome, valor_alvo, valor_atual, contribuicao_mensal, fundo_emergencia)
                                  VALUES ('Fundo de Emergência', %s, %s, %s, TRUE) RETURNING id""",
                               (f.valor_alvo, valor_atual, f.contribuicao_mensal)).fetchone()["id"]
        if com_coluna:
            conn.execute("UPDATE objetivos SET conta_id = %s WHERE id = %s", (f.conta_id, oid))
    return {"id": oid}
