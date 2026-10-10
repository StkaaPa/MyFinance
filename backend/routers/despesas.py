from fastapi import APIRouter
from backend.database import ligar_database
from backend.utils import MES, pagina_categorias

router = APIRouter(prefix="/api/despesas", tags=["despesas"])


@router.get("")
def despesas(mes: str | None = MES):
    with ligar_database() as conn:
        return pagina_categorias(conn, mes, "despesa")
