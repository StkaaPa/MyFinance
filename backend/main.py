from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.routers import (ativos, configuracao, contas, categorias, dashboard, despesas, despesas_anuais,
                             fechos, fundo_emergencia, investimentos, objetivos, patrimonio_historico, receitas, relatorios)

app = FastAPI(title="MyFinance")


@app.get("/api/saude")
def saude():
    return {"estado": "ok"}


for modulo in (contas, categorias, fechos, ativos, dashboard, despesas, receitas, investimentos,
               fundo_emergencia, objetivos, despesas_anuais, relatorios, configuracao, patrimonio_historico):
    app.include_router(modulo.router)

# Tem de ficar no FIM: serve o frontend em tudo o que não for /api
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
