from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.database import ligar_database

router = APIRouter(prefix="/api/categorias", tags=["categorias"])


class NovaCategoria(BaseModel):
    nome: str = Field(min_length=1)
    tipo: Literal["despesa", "receita"]
    categoria_pai_id: int | None = None


class EstadoCategoria(BaseModel):
    ativo: bool


@router.get("")
def listar():
    with ligar_database() as conn:
        return conn.execute("""
            SELECT c.id, c.nome, c.tipo, c.categoria_pai_id, p.nome AS categoria_pai, c.ativo
            FROM categorias c LEFT JOIN categorias p ON p.id = c.categoria_pai_id
            ORDER BY c.tipo, COALESCE(p.nome, c.nome), c.categoria_pai_id NULLS FIRST, c.nome""").fetchall()


@router.post("", status_code=201)
def criar(cat: NovaCategoria):
    with ligar_database() as conn:
        if cat.categoria_pai_id:
            pai = conn.execute("SELECT tipo, categoria_pai_id FROM categorias WHERE id = %s",
                               (cat.categoria_pai_id,)).fetchone()
            if not pai:
                raise HTTPException(404, "Categoria-mãe não existe")
            if pai["categoria_pai_id"]:
                raise HTTPException(422, "Só são permitidos dois níveis (categoria > subcategoria)")
            if pai["tipo"] != cat.tipo:
                raise HTTPException(422, "A subcategoria tem de ter o mesmo tipo da categoria-mãe")
            if conn.execute("SELECT 1 FROM movimentos_categoria WHERE categoria_id = %s LIMIT 1",
                            (cat.categoria_pai_id,)).fetchone():
                raise HTTPException(409, "A categoria-mãe já tem valores guardados; "
                                         "move o histórico para uma subcategoria (ex.: 'Outros') primeiro")
        return conn.execute(
            "INSERT INTO categorias (nome, tipo, categoria_pai_id) VALUES (%s, %s, %s) "
            "RETURNING id, nome, tipo, categoria_pai_id, ativo",
            (cat.nome, cat.tipo, cat.categoria_pai_id)).fetchone()


@router.patch("/{categoria_id}")
def alterar_estado(categoria_id: int, corpo: EstadoCategoria):
    with ligar_database() as conn:
        c = conn.execute("UPDATE categorias SET ativo = %s WHERE id = %s RETURNING id, nome, ativo",
                         (corpo.ativo, categoria_id)).fetchone()
    if not c:
        raise HTTPException(404, "Categoria não encontrada")
    return c
