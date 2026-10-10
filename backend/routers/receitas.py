from fastapi import APIRouter
from backend.database import ligar_database
from backend.utils import MES, pagina_categorias

router = APIRouter(prefix="/api/receitas", tags=["receitas"])


@router.get("")
def receitas(mes: str | None = MES):
    with ligar_database() as conn:
        return pagina_categorias(conn, mes, "receita")
