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


class AlterarAtivo(BaseModel):
    """Todos os campos são opcionais: só se altera o que for enviado."""
    nome: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] | None = None
    classe: Literal["etf", "acao", "cripto", "ppr", "outro"] | None = None
    conta_id: int | None = None
    ativo: bool | None = None


@router.get("")
def listar():
    with ligar_database() as conn:
        if not tem_ativos(conn):
            return []
        return conn.execute("""
            SELECT a.id, a.nome, a.classe, a.conta_id, c.nome AS conta, c.ativo AS conta_ativa, a.ativo,
                   (SELECT COUNT(*) FROM valores_ativo v WHERE v.ativo_id = a.id)::int AS n_meses_com_valores
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
def alterar(ativo_id: int, corpo: AlterarAtivo):
    """Renomeia, muda a classe, muda de conta ou (des)ativa. Ativos com histórico não mudam de conta."""
    novos = corpo.model_dump(exclude_unset=True)
    if not novos or any(v is None for v in novos.values()):
        raise HTTPException(422, "Indica o que queres alterar.")
    with ligar_database() as conn:
        if not tem_ativos(conn):
            raise HTTPException(503, SEM_TABELAS)
        a = conn.execute("""SELECT a.*, (SELECT COUNT(*) FROM valores_ativo v WHERE v.ativo_id = a.id) AS n
                            FROM ativos a WHERE a.id = %s""", (ativo_id,)).fetchone()
        if not a:
            raise HTTPException(404, "Ativo não encontrado")
        conta_id = novos.get("conta_id", a["conta_id"])
        if conta_id != a["conta_id"]:
            if a["n"] > 0:   # os saldos dos meses passados ficariam na conta errada
                raise HTTPException(409, "Este ativo já tem meses fechados e não pode mudar de conta. Desativa-o e cria outro na conta nova.")
        conta = conn.execute("SELECT tipo, ativo FROM contas WHERE id = %s", (conta_id,)).fetchone()
        if conta_id != a["conta_id"] or novos.get("ativo") is True:
            if not conta or not conta["ativo"]:
                raise HTTPException(422, "A conta escolhida não existe ou está inativa.")
        if conta_id != a["conta_id"] and conta["tipo"] not in TIPOS_CONTA:
            raise HTTPException(422, "Só as contas de Investimento ou Reforma podem ter ativos.")
        nome, ativo = novos.get("nome", a["nome"]), novos.get("ativo", a["ativo"])
        if ativo and conn.execute("SELECT 1 FROM ativos WHERE conta_id = %s AND lower(nome) = lower(%s) AND ativo AND id <> %s",
                                  (conta_id, nome, ativo_id)).fetchone():
            raise HTTPException(409, "Já existe um ativo com esse nome nessa conta.")
        cols = [c for c in ("nome", "classe", "conta_id", "ativo") if c in novos]      # nomes de colunas fixos, nunca do cliente
        conn.execute(f"UPDATE ativos SET {', '.join(c + ' = %s' for c in cols)} WHERE id = %s",
                     [novos[c] for c in cols] + [ativo_id])
        return conn.execute("SELECT id, nome, classe, conta_id, ativo FROM ativos WHERE id = %s", (ativo_id,)).fetchone()


@router.delete("/{ativo_id}", status_code=204)
def apagar(ativo_id: int):
    """Só apaga ativos que nunca entraram num fecho. Com histórico, desativa-se."""
    with ligar_database() as conn:
        if not tem_ativos(conn):
            raise HTTPException(503, SEM_TABELAS)
        if conn.execute("SELECT 1 FROM valores_ativo WHERE ativo_id = %s LIMIT 1", (ativo_id,)).fetchone():
            raise HTTPException(409, "Este ativo tem valores em meses fechados e não pode ser apagado. Desativa-o para o manter no histórico.")
        if not conn.execute("DELETE FROM ativos WHERE id = %s RETURNING id", (ativo_id,)).fetchone():
            raise HTTPException(404, "Ativo não encontrado")
