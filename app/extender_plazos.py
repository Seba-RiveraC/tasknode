"""Vista previa y extensión puntual de órdenes sin plazo explícito."""

import argparse
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, update

from app.core.database import SessionLocal
from app.models.operational import OrdenTrabajo


def dias_positivos(valor):
    dias = int(valor)
    if dias <= 0:
        raise argparse.ArgumentTypeError("Los días deben ser mayores que cero")
    return dias


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dias", required=True, type=dias_positivos)
    parser.add_argument("--aplicar", action="store_true", help="Solicitar confirmación y guardar")
    parser.add_argument("--codigo", action="append", help="Limitar a este código; se puede repetir")
    args = parser.parse_args()

    # Las fechas existentes se interpretan como hora local en el panel.
    limite = (datetime.now(ZoneInfo("America/Santiago")) + timedelta(days=args.dias)).replace(tzinfo=None)
    condiciones = [
        OrdenTrabajo.fecha_limite.is_(None),
        OrdenTrabajo.estado_actual.not_in(("OT COMPLETADA", "ORDEN FINALIZADA")),
        OrdenTrabajo.codigo_ot != "OT-2026-PRUEBA-DUOC",
    ]
    if args.codigo:
        condiciones.append(OrdenTrabajo.codigo_ot.in_(args.codigo))
    with SessionLocal() as db:
        consulta = select(OrdenTrabajo.id, OrdenTrabajo.codigo_ot, OrdenTrabajo.estado_actual).where(
            *condiciones
        ).order_by(OrdenTrabajo.id)
        if args.aplicar:
            consulta = consulta.with_for_update()
        ordenes = db.execute(consulta).all()
        if args.codigo and set(args.codigo) != {orden.codigo_ot for orden in ordenes}:
            raise SystemExit("Los códigos solicitados no coinciden con órdenes elegibles; no se modificó nada.")
        print(f"Fecha límite propuesta (hora de Santiago): {limite.isoformat(sep=' ', timespec='seconds')}")
        for orden in ordenes:
            print(f"{orden.codigo_ot} | {orden.estado_actual}")
        print(f"Total: {len(ordenes)}. Se omiten órdenes cerradas, de prueba o con plazo explícito.")
        if not args.aplicar or not ordenes:
            return
        if input("Escribe APLICAR para guardar estos cambios: ").strip() != "APLICAR":
            raise SystemExit("Cancelado; no se modificaron órdenes.")
        resultado = db.execute(
            update(OrdenTrabajo)
            .where(OrdenTrabajo.id.in_([orden.id for orden in ordenes]), *condiciones)
            .values(fecha_limite=limite)
        )
        if resultado.rowcount != len(ordenes):
            raise RuntimeError("Las órdenes cambiaron durante la operación; no se guardaron cambios.")
        db.commit()
        print(f"Actualizadas: {resultado.rowcount}")


if __name__ == "__main__":
    main()
