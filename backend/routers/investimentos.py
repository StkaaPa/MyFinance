from fastapi import APIRouter
from backend.database import ligar_database
from backend.utils import MES, eur, variacao, obter_fecho, fecho_anterior, total_saldos, distribuicao

router = APIRouter(prefix="/api/investimentos", tags=["investimentos"])
TIPOS = ["investimento", "reforma"]


@router.get("")
def investimentos(mes: str | None = MES):
    with ligar_database() as conn:
        f = obter_fecho(conn, mes)
        ant = fecho_anterior(conn, f)
        contas = conn.execute("""
            SELECT c.nome, c.tipo, s.saldo AS valor FROM saldos_conta s JOIN contas c ON c.id = s.conta_id
            WHERE s.fecho_id = %s AND c.tipo = ANY(%s) ORDER BY s.saldo DESC""", (f["id"], TIPOS)).fetchall()
        for c in contas:
            c["valor"] = float(c["valor"])
        total = total_saldos(conn, f["id"], TIPOS)
        total_ant = total_saldos(conn, ant["id"], TIPOS) if ant else None
    return {"mes": f["mes_referencia"].strftime("%Y-%m"), "total": eur(total, 2), "centro": eur(total),
            "variacao": variacao(total, total_ant),
            "rendimento": "—",  # precisa dos depósitos mensais (opção A); ainda não guardamos esse dado
            "distribuicao": distribuicao(contas), "movimentos": contas}
