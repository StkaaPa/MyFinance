from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel, Field
from backend.database import ligar_database

router = APIRouter(prefix="/api/configuracao", tags=["configuração"])


class Configuracao(BaseModel):
    dia_inicio: int = Field(ge=1, le=28)
    moeda: Literal["EUR"] = "EUR"
    idioma: Literal["pt"] = "pt"


@router.get("")
def obter():
    with ligar_database() as conn:
        rows = conn.execute("SELECT chave, valor FROM configuracoes").fetchall()
    d = {r["chave"]: r["valor"] for r in rows}
    return {"dia_inicio": int(d.get("dia_inicio", 27)), "moeda": d.get("moeda", "EUR"), "idioma": d.get("idioma", "pt")}


@router.put("")
def guardar(c: Configuracao):
    with ligar_database() as conn:
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO configuracoes (chave, valor) VALUES (%s, %s) "
                            "ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor",
                            [("dia_inicio", str(c.dia_inicio)), ("moeda", c.moeda), ("idioma", c.idioma)])
    return c
