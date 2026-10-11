from datetime import date, timedelta
from decimal import Decimal
import psycopg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.database import ligar_database
from backend.utils import tem_ativos

router = APIRouter(prefix="/api/fechos", tags=["fecho mensal"])


class SaldoIn(BaseModel):
    conta_id: int
    saldo: Decimal = Field(max_digits=12, decimal_places=2)


class MovimentoIn(BaseModel):
    categoria_id: int
    valor: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class AtivoIn(BaseModel):
    ativo_id: int
    valor: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    depositado: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)  # negativo = levantaste


class NovoFecho(BaseModel):
    mes_referencia: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    data_inicio: date
    data_fim: date
    saldos: list[SaldoIn]
    movimentos: list[MovimentoIn]
    ativos: list[AtivoIn] = []


@router.get("")
def listar_fechos():
    with ligar_database() as conn:
        return conn.execute("SELECT id, to_char(mes_referencia,'YYYY-MM') AS mes, data_inicio, data_fim, fechado_em "
                            "FROM fechos_mensais ORDER BY mes_referencia DESC").fetchall()


@router.get("/formulario")
def dados_formulario():
    """O que o pop-up de fecho precisa: contas ativas, categorias folha ativas e datas sugeridas."""
    with ligar_database() as conn:
        ultimo = conn.execute("SELECT id, data_fim FROM fechos_mensais ORDER BY mes_referencia DESC LIMIT 1").fetchone()
        ultimo_id = ultimo["id"] if ultimo else None
        # saldo_anterior / valor_anterior: o que registaste no último fecho (ajuda a preencher e a comparar)
        contas = conn.execute("""
            SELECT c.id, c.nome, c.tipo, s.saldo AS saldo_anterior
            FROM contas c LEFT JOIN saldos_conta s ON s.conta_id = c.id AND s.fecho_id = %s
            WHERE c.ativo ORDER BY c.id""", (ultimo_id,)).fetchall()
        # só categorias "folha" (sem subcategorias): é nelas que se guardam valores
        cats = conn.execute("""
            SELECT c.id, c.nome, c.tipo, p.nome AS categoria_pai, m.valor AS valor_anterior
            FROM categorias c
            LEFT JOIN categorias p ON p.id = c.categoria_pai_id
            LEFT JOIN movimentos_categoria m ON m.categoria_id = c.id AND m.fecho_id = %s
            WHERE c.ativo AND NOT EXISTS (SELECT 1 FROM categorias f WHERE f.categoria_pai_id = c.id)
            ORDER BY c.tipo, COALESCE(p.nome, c.nome), c.nome""", (ultimo_id,)).fetchall()
        dia = conn.execute("SELECT valor FROM configuracoes WHERE chave = 'dia_inicio'").fetchone()
        # ativos (ETF, ações, cripto, PPR...) das contas de investimento
        ativos = []
        if tem_ativos(conn):
            ativos = conn.execute("""
                SELECT a.id, a.nome, a.classe, a.conta_id, c.nome AS conta, v.valor AS valor_anterior
                FROM ativos a JOIN contas c ON c.id = a.conta_id
                LEFT JOIN valores_ativo v ON v.ativo_id = a.id AND v.fecho_id = %s
                WHERE a.ativo AND c.ativo ORDER BY c.id, a.nome""", (ultimo_id,)).fetchall()
    com_ativos = {a["conta_id"] for a in ativos}
    for c in contas:
        c["saldo_anterior"] = float(c["saldo_anterior"]) if c["saldo_anterior"] is not None else None
        c["tem_ativos"] = c["id"] in com_ativos   # o saldo destas contas é a soma dos ativos
    for c in cats:
        c["valor_anterior"] = float(c["valor_anterior"]) if c["valor_anterior"] is not None else None
    for a in ativos:
        a["valor_anterior"] = float(a["valor_anterior"]) if a["valor_anterior"] is not None else None
    return {"contas": contas, "categorias": cats, "ativos": ativos,
            "data_inicio_sugerida": (ultimo["data_fim"] + timedelta(days=1)) if ultimo else None,
            "dia_inicio_configurado": int(dia["valor"]) if dia else 27}


@router.post("", status_code=201)
def fechar_mes(novo: NovoFecho):
    """Grava o fecho, os saldos e os movimentos numa só transação: ou fica tudo, ou nada."""
    if novo.data_fim < novo.data_inicio:
        raise HTTPException(422, "A data de fim é anterior à de início")
    # Convenção: o mês leva o nome do mês em que o período TERMINA (27/08 a 26/09 = setembro)
    if novo.data_fim.strftime("%Y-%m") != novo.mes_referencia:
        raise HTTPException(422, "O mês de referência tem de ser o mês em que o período termina "
                                 f"(a data de fim é {novo.data_fim.strftime('%d/%m/%Y')}).")
    ids_c = [s.conta_id for s in novo.saldos]
    ids_m = [m.categoria_id for m in novo.movimentos]
    if len(set(ids_c)) != len(ids_c) or len(set(ids_m)) != len(ids_m):
        raise HTTPException(422, "Há contas ou categorias repetidas")

    with ligar_database() as conn:
        ok = conn.execute("SELECT id FROM contas WHERE id = ANY(%s) AND ativo", (ids_c,)).fetchall()
        if len(ok) != len(ids_c):
            raise HTTPException(422, "Há contas inexistentes ou inativas")
        ok = conn.execute("""SELECT id FROM categorias WHERE id = ANY(%s) AND ativo
                             AND NOT EXISTS (SELECT 1 FROM categorias f WHERE f.categoria_pai_id = categorias.id)""",
                          (ids_m,)).fetchall()
        if len(ok) != len(ids_m):
            raise HTTPException(422, "Só se guardam valores em categorias ativas sem subcategorias")
        # Ativos: o saldo de uma conta com ativos é a SOMA dos valores dos seus ativos
        ids_a = [a.ativo_id for a in novo.ativos]
        if len(set(ids_a)) != len(ids_a):
            raise HTTPException(422, "Há ativos repetidos")
        saldos_ativos = {}   # conta_id -> soma dos ativos
        ativo_conta = {}
        if tem_ativos(conn):
            ativos_ativos = conn.execute("""SELECT a.id, a.nome, a.conta_id FROM ativos a
                                            JOIN contas c ON c.id = a.conta_id WHERE a.ativo AND c.ativo""").fetchall()
            ativo_conta = {r["id"]: r["conta_id"] for r in ativos_ativos}
            if any(i not in ativo_conta for i in ids_a):
                raise HTTPException(422, "Há ativos inexistentes ou inativos")
            em_falta = [r["nome"] for r in ativos_ativos if r["id"] not in ids_a]
            if em_falta:
                raise HTTPException(422, "Falta o valor de: " + ", ".join(em_falta) + " (0 se já não tens).")
            if any(s.conta_id in set(ativo_conta.values()) for s in novo.saldos):
                raise HTTPException(422, "Uma conta com ativos não leva saldo próprio: o saldo é a soma dos ativos.")
            for a in novo.ativos:
                c = ativo_conta[a.ativo_id]
                saldos_ativos[c] = saldos_ativos.get(c, Decimal("0")) + a.valor
        elif ids_a:
            raise HTTPException(503, "Ainda não criaste as tabelas dos ativos. Corre o ficheiro database/ativos.sql no psql.")
        if conn.execute("SELECT 1 FROM fechos_mensais WHERE mes_referencia = %s::date",
                        (novo.mes_referencia + "-01",)).fetchone():
            raise HTTPException(409, "Esse mês já está fechado")
        if conn.execute("SELECT 1 FROM fechos_mensais WHERE data_inicio <= %s AND data_fim >= %s",
                        (novo.data_fim, novo.data_inicio)).fetchone():
            raise HTTPException(409, "O período sobrepõe-se a um fecho existente")
        try:
            fecho = conn.execute(
                "INSERT INTO fechos_mensais (mes_referencia, data_inicio, data_fim) VALUES (%s::date, %s, %s) RETURNING id",
                (novo.mes_referencia + "-01", novo.data_inicio, novo.data_fim)).fetchone()
        except psycopg.errors.UniqueViolation:
            raise HTTPException(409, "Esse mês já está fechado")
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO saldos_conta (conta_id, fecho_id, saldo) VALUES (%s, %s, %s)",
                            [(s.conta_id, fecho["id"], s.saldo) for s in novo.saldos]
                            + [(c, fecho["id"], total) for c, total in saldos_ativos.items()])
            if novo.ativos:
                cur.executemany("INSERT INTO valores_ativo (ativo_id, fecho_id, valor, depositado) VALUES (%s, %s, %s, %s)",
                                [(a.ativo_id, fecho["id"], a.valor, a.depositado) for a in novo.ativos])
            cur.executemany("INSERT INTO movimentos_categoria (categoria_id, fecho_id, valor) VALUES (%s, %s, %s)",
                            [(m.categoria_id, fecho["id"], m.valor) for m in novo.movimentos])
    return {"id": fecho["id"], "mes": novo.mes_referencia}


@router.delete("/{fecho_id}", status_code=204)
def apagar_fecho(fecho_id: int):
    """Apaga o fecho e (por CASCADE) os saldos e movimentos dele. Serve para refazer um mês errado."""
    with ligar_database() as conn:
        r = conn.execute("DELETE FROM fechos_mensais WHERE id = %s RETURNING id", (fecho_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Fecho não encontrado")
