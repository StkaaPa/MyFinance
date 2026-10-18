"""Fecho mensal: criar, ver, corrigir e apagar um mês.

Criar e corrigir usam as MESMAS regras (função validar) e a mesma gravação (função gravar_valores),
para um fecho corrigido ficar exatamente como se tivesse sido bem feito à primeira.
"""
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


FOLHA = "NOT EXISTS (SELECT 1 FROM categorias f WHERE f.categoria_pai_id = categorias.id)"


@router.get("")
def listar_fechos():
    """Lista de meses fechados, com os totais de cada um (para a página Fechos)."""
    with ligar_database() as conn:
        rows = conn.execute("""
            SELECT f.id, to_char(f.mes_referencia, 'YYYY-MM') AS mes, f.data_inicio, f.data_fim, f.fechado_em,
              (SELECT COALESCE(SUM(s.saldo), 0) FROM saldos_conta s WHERE s.fecho_id = f.id) AS patrimonio,
              (SELECT COALESCE(SUM(m.valor), 0) FROM movimentos_categoria m JOIN categorias c ON c.id = m.categoria_id
                WHERE m.fecho_id = f.id AND c.tipo = 'receita') AS receitas,
              (SELECT COALESCE(SUM(m.valor), 0) FROM movimentos_categoria m JOIN categorias c ON c.id = m.categoria_id
                WHERE m.fecho_id = f.id AND c.tipo = 'despesa') AS despesas
            FROM fechos_mensais f ORDER BY f.mes_referencia DESC""").fetchall()
    for r in rows:
        for k in ("patrimonio", "receitas", "despesas"):
            r[k] = float(r[k])
    return rows


@router.get("/formulario")
def dados_formulario(fecho_id: int | None = None):
    """O que o pop-up de fecho precisa.

    Sem fecho_id (fechar um mês novo): contas, categorias e ativos ATIVOS, comparados com o último fecho.
    Com fecho_id (corrigir um mês): também o que já tinha valores nesse fecho, comparado com o mês anterior a ele.
    """
    with ligar_database() as conn:
        editar = None
        if fecho_id is not None:
            editar = conn.execute("SELECT * FROM fechos_mensais WHERE id = %s", (fecho_id,)).fetchone()
            if not editar:
                raise HTTPException(404, "Fecho não encontrado")
            ref = conn.execute("SELECT id FROM fechos_mensais WHERE mes_referencia < %s ORDER BY mes_referencia DESC LIMIT 1",
                               (editar["mes_referencia"],)).fetchone()
            ref_id, ultimo = (ref["id"] if ref else None), None
        else:
            ultimo = conn.execute("SELECT id, data_fim FROM fechos_mensais ORDER BY mes_referencia DESC LIMIT 1").fetchone()
            ref_id = ultimo["id"] if ultimo else None
        edit_id = fecho_id if fecho_id is not None else -1      # -1 não existe: "nenhum fecho em edição"

        contas = conn.execute("""
            SELECT c.id, c.nome, c.tipo, s.saldo AS saldo_anterior
            FROM contas c LEFT JOIN saldos_conta s ON s.conta_id = c.id AND s.fecho_id = %s
            WHERE c.ativo OR EXISTS (SELECT 1 FROM saldos_conta e WHERE e.conta_id = c.id AND e.fecho_id = %s)
            ORDER BY c.id""", (ref_id, edit_id)).fetchall()
        # só categorias "folha" (sem subcategorias): é nelas que se guardam valores
        cats = conn.execute("""
            SELECT categorias.id, categorias.nome, categorias.tipo, p.nome AS categoria_pai, m.valor AS valor_anterior
            FROM categorias
            LEFT JOIN categorias p ON p.id = categorias.categoria_pai_id
            LEFT JOIN movimentos_categoria m ON m.categoria_id = categorias.id AND m.fecho_id = %s
            WHERE (categorias.ativo OR EXISTS (SELECT 1 FROM movimentos_categoria e WHERE e.categoria_id = categorias.id AND e.fecho_id = %s))
              AND """ + FOLHA + """
            ORDER BY categorias.tipo, COALESCE(p.nome, categorias.nome), categorias.nome""", (ref_id, edit_id)).fetchall()
        dia = conn.execute("SELECT valor FROM configuracoes WHERE chave = 'dia_inicio'").fetchone()
        ativos = []
        if tem_ativos(conn):
            if editar:   # ao corrigir: só os ativos que já tinham valor neste fecho (não se inventam aberturas a zero)
                filtro, params = "EXISTS (SELECT 1 FROM valores_ativo e WHERE e.ativo_id = a.id AND e.fecho_id = %s)", (ref_id, edit_id)
            else:
                filtro, params = "a.ativo AND c.ativo", (ref_id,)
            ativos = conn.execute(f"""
                SELECT a.id, a.nome, a.classe, a.conta_id, c.nome AS conta, v.valor AS valor_anterior
                FROM ativos a JOIN contas c ON c.id = a.conta_id
                LEFT JOIN valores_ativo v ON v.ativo_id = a.id AND v.fecho_id = %s
                WHERE {filtro} ORDER BY c.id, a.nome""", params).fetchall()
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


@router.get("/{fecho_id}")
def ver_fecho(fecho_id: int):
    """Os valores guardados num fecho (para o pop-up abrir já preenchido)."""
    with ligar_database() as conn:
        f = conn.execute("SELECT id, to_char(mes_referencia, 'YYYY-MM') AS mes, data_inicio, data_fim FROM fechos_mensais WHERE id = %s",
                         (fecho_id,)).fetchone()
        if not f:
            raise HTTPException(404, "Fecho não encontrado")
        ativos = []
        if tem_ativos(conn):
            ativos = conn.execute("SELECT ativo_id, valor, depositado FROM valores_ativo WHERE fecho_id = %s ORDER BY ativo_id",
                                  (fecho_id,)).fetchall()
        # os saldos das contas com ativos são calculados: não fazem parte do que se escreve
        saldos = conn.execute("""
            SELECT s.conta_id, s.saldo FROM saldos_conta s WHERE s.fecho_id = %s
              AND (NOT %s OR NOT EXISTS (SELECT 1 FROM valores_ativo v JOIN ativos a ON a.id = v.ativo_id
                                         WHERE v.fecho_id = s.fecho_id AND a.conta_id = s.conta_id))
            ORDER BY s.conta_id""", (fecho_id, tem_ativos(conn))).fetchall()
        movimentos = conn.execute("SELECT categoria_id, valor FROM movimentos_categoria WHERE fecho_id = %s ORDER BY categoria_id",
                                  (fecho_id,)).fetchall()
    f["saldos"] = [{"conta_id": s["conta_id"], "saldo": float(s["saldo"])} for s in saldos]
    f["movimentos"] = [{"categoria_id": m["categoria_id"], "valor": float(m["valor"])} for m in movimentos]
    f["ativos"] = [{"ativo_id": a["ativo_id"], "valor": float(a["valor"]), "depositado": float(a["depositado"])} for a in ativos]
    return f


def validar(conn, novo: NovoFecho, editar_id: int | None = None):
    """Todas as regras de um fecho. Devolve {conta_id: soma dos ativos} para gravar como saldo dessas contas."""
    if novo.data_fim < novo.data_inicio:
        raise HTTPException(422, "A data de fim é anterior à de início")
    # Convenção: o mês leva o nome do mês em que o período TERMINA (27/08 a 26/09 = setembro)
    if novo.data_fim.strftime("%Y-%m") != novo.mes_referencia:
        raise HTTPException(422, "O mês de referência tem de ser o mês em que o período termina "
                                 f"(a data de fim é {novo.data_fim.strftime('%d/%m/%Y')}).")
    ids_c = [s.conta_id for s in novo.saldos]
    ids_m = [m.categoria_id for m in novo.movimentos]
    ids_a = [a.ativo_id for a in novo.ativos]
    if len(set(ids_c)) != len(ids_c) or len(set(ids_m)) != len(ids_m):
        raise HTTPException(422, "Há contas ou categorias repetidas")
    if len(set(ids_a)) != len(ids_a):
        raise HTTPException(422, "Há ativos repetidos")
    eid = editar_id if editar_id is not None else -1      # -1 não existe: "nenhum fecho em edição"

    # Contas e categorias: ativas (ao corrigir, também as que já tinham valor neste fecho)
    ok = conn.execute("""SELECT id FROM contas WHERE id = ANY(%s) AND (ativo OR EXISTS
                         (SELECT 1 FROM saldos_conta s WHERE s.conta_id = contas.id AND s.fecho_id = %s))""", (ids_c, eid)).fetchall()
    if len(ok) != len(ids_c):
        raise HTTPException(422, "Há contas inexistentes ou inativas")
    ok = conn.execute("""SELECT id FROM categorias WHERE id = ANY(%s) AND (ativo OR EXISTS
                         (SELECT 1 FROM movimentos_categoria m WHERE m.categoria_id = categorias.id AND m.fecho_id = %s))
                         AND """ + FOLHA, (ids_m, eid)).fetchall()
    if len(ok) != len(ids_m):
        raise HTTPException(422, "Só se guardam valores em categorias ativas sem subcategorias")

    # Ativos: o saldo de uma conta com ativos é a SOMA dos valores dos seus ativos
    saldos_ativos, contas_dos_ativos = {}, set()
    if tem_ativos(conn):
        if editar_id is None:   # fecho novo: todos os ativos ativos têm de ter valor
            permitidos = conn.execute("""SELECT a.id, a.nome, a.conta_id FROM ativos a JOIN contas c ON c.id = a.conta_id
                                         WHERE a.ativo AND c.ativo""").fetchall()
            obrigatorios = permitidos
        else:                   # corrigir: os que já estavam neste fecho (não se pode largar nenhum por engano)
            permitidos = conn.execute("""SELECT a.id, a.nome, a.conta_id FROM ativos a WHERE a.ativo OR EXISTS
                                         (SELECT 1 FROM valores_ativo v WHERE v.ativo_id = a.id AND v.fecho_id = %s)""", (eid,)).fetchall()
            obrigatorios = conn.execute("""SELECT a.id, a.nome, a.conta_id FROM ativos a JOIN valores_ativo v ON v.ativo_id = a.id
                                           WHERE v.fecho_id = %s""", (eid,)).fetchall()
        conta_de = {r["id"]: r["conta_id"] for r in permitidos}
        if any(i not in conta_de for i in ids_a):
            raise HTTPException(422, "Há ativos inexistentes ou inativos")
        em_falta = [r["nome"] for r in obrigatorios if r["id"] not in ids_a]
        if em_falta:
            raise HTTPException(422, "Falta o valor de: " + ", ".join(em_falta) + " (0 se já não tens).")
        contas_dos_ativos = {conta_de[i] for i in ids_a}
        if any(c in contas_dos_ativos for c in ids_c):
            raise HTTPException(422, "Uma conta com ativos não leva saldo próprio: o saldo é a soma dos ativos.")
        for a in novo.ativos:
            c = conta_de[a.ativo_id]
            saldos_ativos[c] = saldos_ativos.get(c, Decimal("0")) + a.valor
    elif ids_a:
        raise HTTPException(503, "Ainda não criaste as tabelas dos ativos. Corre o ficheiro database/ativos.sql no psql.")

    if editar_id is not None:   # ao corrigir, nenhuma conta que tinha saldo pode ficar de fora
        antes = conn.execute("""SELECT c.nome FROM saldos_conta s JOIN contas c ON c.id = s.conta_id
                                WHERE s.fecho_id = %s AND NOT (s.conta_id = ANY(%s))""",
                             (eid, list(set(ids_c) | contas_dos_ativos))).fetchall()
        if antes:
            raise HTTPException(422, "Falta o saldo de: " + ", ".join(r["nome"] for r in antes) + ".")

    if conn.execute("SELECT 1 FROM fechos_mensais WHERE mes_referencia = %s::date AND id <> %s",
                    (novo.mes_referencia + "-01", eid)).fetchone():
        raise HTTPException(409, "Esse mês já está fechado")
    if conn.execute("SELECT 1 FROM fechos_mensais WHERE data_inicio <= %s AND data_fim >= %s AND id <> %s",
                    (novo.data_fim, novo.data_inicio, eid)).fetchone():
        raise HTTPException(409, "O período sobrepõe-se a um fecho existente")
    return saldos_ativos


def gravar_valores(conn, fecho_id: int, novo: NovoFecho, saldos_ativos: dict):
    with conn.cursor() as cur:
        cur.executemany("INSERT INTO saldos_conta (conta_id, fecho_id, saldo) VALUES (%s, %s, %s)",
                        [(s.conta_id, fecho_id, s.saldo) for s in novo.saldos]
                        + [(c, fecho_id, total) for c, total in saldos_ativos.items()])
        if novo.ativos:
            cur.executemany("INSERT INTO valores_ativo (ativo_id, fecho_id, valor, depositado) VALUES (%s, %s, %s, %s)",
                            [(a.ativo_id, fecho_id, a.valor, a.depositado) for a in novo.ativos])
        cur.executemany("INSERT INTO movimentos_categoria (categoria_id, fecho_id, valor) VALUES (%s, %s, %s)",
                        [(m.categoria_id, fecho_id, m.valor) for m in novo.movimentos])


@router.post("", status_code=201)
def fechar_mes(novo: NovoFecho):
    """Grava o fecho, os saldos e os movimentos numa só transação: ou fica tudo, ou nada."""
    with ligar_database() as conn:
        saldos_ativos = validar(conn, novo)
        try:
            fecho = conn.execute(
                "INSERT INTO fechos_mensais (mes_referencia, data_inicio, data_fim) VALUES (%s::date, %s, %s) RETURNING id",
                (novo.mes_referencia + "-01", novo.data_inicio, novo.data_fim)).fetchone()
        except psycopg.errors.UniqueViolation:
            raise HTTPException(409, "Esse mês já está fechado")
        gravar_valores(conn, fecho["id"], novo, saldos_ativos)
    return {"id": fecho["id"], "mes": novo.mes_referencia}


@router.put("/{fecho_id}")
def corrigir_fecho(fecho_id: int, novo: NovoFecho):
    """Corrige um mês já fechado: troca o período e TODOS os valores, numa só transação (ou fica tudo, ou nada)."""
    with ligar_database() as conn:
        if not conn.execute("SELECT 1 FROM fechos_mensais WHERE id = %s", (fecho_id,)).fetchone():
            raise HTTPException(404, "Fecho não encontrado")
        saldos_ativos = validar(conn, novo, fecho_id)
        conn.execute("UPDATE fechos_mensais SET mes_referencia = %s::date, data_inicio = %s, data_fim = %s WHERE id = %s",
                     (novo.mes_referencia + "-01", novo.data_inicio, novo.data_fim, fecho_id))
        for tabela in ("saldos_conta", "movimentos_categoria") + (("valores_ativo",) if tem_ativos(conn) else ()):
            conn.execute(f"DELETE FROM {tabela} WHERE fecho_id = %s", (fecho_id,))     # nomes fixos acima, nunca do pedido
        gravar_valores(conn, fecho_id, novo, saldos_ativos)
    return {"id": fecho_id, "mes": novo.mes_referencia}


@router.delete("/{fecho_id}", status_code=204)
def apagar_fecho(fecho_id: int):
    """Apaga o fecho e (por CASCADE) os saldos, movimentos e valores dos ativos dele."""
    with ligar_database() as conn:
        r = conn.execute("DELETE FROM fechos_mensais WHERE id = %s RETURNING id", (fecho_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Fecho não encontrado")
