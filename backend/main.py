from fastapi import FastAPI
from typing import Literal
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles

from backend.database import ligar_database

app = FastAPI()

@app.get("/api/saude")
def saude():
    return {"estado": "ok!"}

@app.get("/api/contas")
def listar_contas():
    with ligar_database() as conn:
        linhas = conn.execute(
            "SELECT id, nome, instituicao, tipo, ativo FROM contas ORDER BY id"
        ).fetchall()
    return linhas

class NovaConta(BaseModel):
    nome: str
    instituicao: str
    tipo: Literal["Conta Ordem", "Poupança", "Investimento", "Reforma"]

@app.post("/api/contas", status_code=201)
def criar_conta(conta: NovaConta):
    with ligar_database() as conn:
        nova = conn.execute(
            "INSERT INTO contas (nome, instituicao, tipo) VALUES (%s, %s, %s)"
            "RETURNING id, nome, instituicao, tipo, ativo",
            (conta.nome, conta.instituicao, conta.tipo),
        ).fetchone()
    return nova

#isto faz a API servir as páginas
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

#python -m uvicorn backend.main:app --reload