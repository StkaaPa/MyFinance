"""Categorias e subcategorias: listar, criar, editar (nome, mover para outra categoria-mãe), ativar/desativar e apagar.

Regras:
- só dois níveis: categoria > subcategoria;
- os valores do fecho guardam-se na categoria "folha" (a que não tem subcategorias);
  por isso uma categoria que já tem valores não pode receber subcategorias;
- o tipo (despesa/receita) não se muda: o histórico ficava errado. Para mudar, cria outra e apaga esta;
- apagar só se não tiver valores guardados nem subcategorias; senão desativa-se (o histórico fica).
"""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import ligar_database

router = APIRouter(prefix="/api/categorias", tags=["categorias"])


class NovaCategoria(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    tipo: Literal["despesa", "receita"]
    categoria_pai_id: int | None = None


class AtualizarCategoria(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=60)
    categoria_pai_id: int | None = None      # enviar null de propósito = passa a categoria principal
    ativo: bool | None = None


def validar_pai(conn, pai_id, tipo, cat_id=None):
    """A categoria-mãe tem de existir, ser principal, do mesmo tipo e ainda não ter valores."""
    pai = conn.execute("SELECT id, nome, tipo, categoria_pai_id FROM categorias WHERE id = %s", (pai_id,)).fetchone()
    if not pai:
        raise HTTPException(404, "Categoria-mãe não existe")
    if cat_id is not None and pai["id"] == cat_id:
        raise HTTPException(422, "Uma categoria não pode ser mãe dela própria")
    if pai["categoria_pai_id"]:
        raise HTTPException(422, "Só são permitidos dois níveis (categoria > subcategoria)")
    if pai["tipo"] != tipo:
        raise HTTPException(422, "A subcategoria tem de ter o mesmo tipo da categoria-mãe")
    if conn.execute("SELECT 1 FROM movimentos_categoria WHERE categoria_id = %s LIMIT 1", (pai_id,)).fetchone():
        raise HTTPException(409, f"A categoria «{pai['nome']}» já tem valores guardados; "
                                 "move o histórico para uma subcategoria (ex.: 'Outros') primeiro")


def nome_repetido(conn, nome, tipo, pai_id, ignorar_id=None):
    return conn.execute("""SELECT 1 FROM categorias WHERE lower(nome) = lower(%s) AND tipo = %s
                           AND categoria_pai_id IS NOT DISTINCT FROM %s AND id <> %s""",
                        (nome, tipo, pai_id, ignorar_id if ignorar_id is not None else -1)).fetchone()


@router.get("")
def listar():
    with ligar_database() as conn:
        return conn.execute("""
            SELECT c.id, c.nome, c.tipo, c.categoria_pai_id, p.nome AS categoria_pai, c.ativo,
              (SELECT COUNT(*) FROM categorias f WHERE f.categoria_pai_id = c.id)::int AS n_subcategorias,
              (SELECT COUNT(*) FROM movimentos_categoria m WHERE m.categoria_id = c.id)::int AS n_meses_com_valores
            FROM categorias c LEFT JOIN categorias p ON p.id = c.categoria_pai_id
            ORDER BY c.tipo, COALESCE(p.nome, c.nome), c.categoria_pai_id NULLS FIRST, c.nome""").fetchall()


@router.post("", status_code=201)
def criar(cat: NovaCategoria):
    nome = cat.nome.strip()
    if not nome:
        raise HTTPException(422, "Indica o nome da categoria.")
    with ligar_database() as conn:
        if cat.categoria_pai_id:
            validar_pai(conn, cat.categoria_pai_id, cat.tipo)
        if nome_repetido(conn, nome, cat.tipo, cat.categoria_pai_id):
            raise HTTPException(409, "Já existe uma categoria com esse nome" + (" nessa categoria." if cat.categoria_pai_id else "."))
        return conn.execute(
            "INSERT INTO categorias (nome, tipo, categoria_pai_id) VALUES (%s, %s, %s) "
            "RETURNING id, nome, tipo, categoria_pai_id, ativo", (nome, cat.tipo, cat.categoria_pai_id)).fetchone()


@router.patch("/{categoria_id}")
def atualizar(categoria_id: int, corpo: AtualizarCategoria):
    campos = corpo.model_fields_set
    with ligar_database() as conn:
        c = conn.execute("SELECT id, nome, tipo, categoria_pai_id, ativo FROM categorias WHERE id = %s", (categoria_id,)).fetchone()
        if not c:
            raise HTTPException(404, "Categoria não encontrada")
        novos = {}
        if corpo.nome is not None:
            novos["nome"] = corpo.nome.strip()
            if not novos["nome"]:
                raise HTTPException(422, "Indica o nome da categoria.")
        if corpo.ativo is not None:
            novos["ativo"] = corpo.ativo
        if "categoria_pai_id" in campos and corpo.categoria_pai_id != c["categoria_pai_id"]:
            if corpo.categoria_pai_id is not None:
                if conn.execute("SELECT 1 FROM categorias WHERE categoria_pai_id = %s LIMIT 1", (categoria_id,)).fetchone():
                    raise HTTPException(422, "Esta categoria tem subcategorias, por isso não pode passar a ser subcategoria "
                                             "(só há dois níveis). Move primeiro as subcategorias.")
                validar_pai(conn, corpo.categoria_pai_id, c["tipo"], categoria_id)
            novos["categoria_pai_id"] = corpo.categoria_pai_id
        if {"nome", "categoria_pai_id"} & novos.keys() and nome_repetido(
                conn, novos.get("nome", c["nome"]), c["tipo"], novos.get("categoria_pai_id", c["categoria_pai_id"]), categoria_id):
            raise HTTPException(409, "Já existe uma categoria com esse nome nesse sítio.")
        if novos:
            # os nomes das colunas vêm da lista fixa acima (nunca do pedido)
            conn.execute(f"UPDATE categorias SET {', '.join(k + ' = %s' for k in novos)} WHERE id = %s", (*novos.values(), categoria_id))
        return conn.execute("SELECT id, nome, tipo, categoria_pai_id, ativo FROM categorias WHERE id = %s", (categoria_id,)).fetchone()


@router.delete("/{categoria_id}", status_code=204)
def apagar(categoria_id: int):
    with ligar_database() as conn:
        if not conn.execute("SELECT 1 FROM categorias WHERE id = %s", (categoria_id,)).fetchone():
            raise HTTPException(404, "Categoria não encontrada")
        filhas = conn.execute("SELECT COUNT(*) AS n FROM categorias WHERE categoria_pai_id = %s", (categoria_id,)).fetchone()["n"]
        if filhas:
            raise HTTPException(409, f"Esta categoria tem {filhas} {'subcategoria' if filhas == 1 else 'subcategorias'}. "
                                     "Apaga-as ou move-as primeiro.")
        meses = conn.execute("SELECT COUNT(*) AS n FROM movimentos_categoria WHERE categoria_id = %s", (categoria_id,)).fetchone()["n"]
        if meses:
            raise HTTPException(409, f"Esta categoria tem valores em {meses} {'mês fechado' if meses == 1 else 'meses fechados'}. "
                                     "Para não perder o histórico, desativa-a em vez de a apagar.")
        conn.execute("DELETE FROM categorias WHERE id = %s", (categoria_id,))
