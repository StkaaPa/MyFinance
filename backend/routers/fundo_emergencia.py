from fastapi import APIRouter, HTTPException
from backend.database import ligar_database
from backend.routers.objetivos import formatar
from backend.utils import eur

router = APIRouter(prefix="/api/fundo-emergencia", tags=["fundo de emergência"])


@router.get("")
def fundo():
    """O fundo de emergência é o objetivo marcado com fundo_emergencia = true (só pode haver um)."""
    with ligar_database() as conn:
        o = conn.execute("SELECT * FROM objetivos WHERE fundo_emergencia").fetchone()
    if not o:
        raise HTTPException(404, "Ainda não criaste o fundo de emergência (POST /api/objetivos com fundo_emergencia=true)")
    f = formatar(o)
    return {"percentagem": f["percentagem_texto"], "atual": eur(f["valor_atual"]), "objetivo": eur(f["valor_alvo"]),
            "contribuicao": eur(f["contribuicao_mensal"]),
            "tempo": f"{f['meses_restantes']} meses" if f["meses_restantes"] is not None else "—",
            "dica": "Mantém o teu fundo de emergência entre 3 e 6 meses de despesas."}
