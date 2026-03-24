from db.session import SessionLocal
from models.earning import Earning
from models.order import OrderItem
from sqlalchemy import func

def check_db():
    db = SessionLocal()
    order_id = 175 # Usamos la 175 de ejemplo que dio 0

    print(f"--- Datos crudos en tabla 'earnings' para Orden {order_id} ---")
    results = db.query(Earning).filter(Earning.order_id == order_id).all()

    if not results:
        print("No se encontraron registros de ganancias para esta orden.")
    else:
        for e in results:
            print(f"ID Ganancia: {e.id} | Amount: {e.amount} | Real Photos: {e.real_photos_sold} | Photographer ID: {e.photographer_id} | Item ID: {e.order_item_id}")

    print("\n--- Verificando la relación con OrderItem ---")
    for e in results:
        item = db.query(OrderItem).filter(OrderItem.id == e.order_item_id).first()
        if item:
            print(f"Item ID {item.id}: Cantidad={item.quantity}, Precio Unitario={item.price}")
        else:
            print(f"Item ID {e.order_item_id} NO ENCONTRADO en order_items")

    print("\n--- Resultado de la suma directa SQL ---")
    total = db.query(func.sum(Earning.amount)).filter(Earning.order_id == order_id).scalar()
    print(f"Suma total 'amount' para orden {order_id}: {total}")

if __name__ == "__main__":
    check_db()
