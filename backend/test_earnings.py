from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.photographers import PhotographerService
from app.models.user import User
from app.models.photographer import Photographer

def test():
    db = SessionLocal()
    service = PhotographerService(db)
    
    # get a photographer
    p = db.query(Photographer).first()
    if p:
        print(f"Testing photographer ID: {p.id}")
        # we need a valid user instance to bypass permissions check or an admin
        u = db.query(User).filter(User.role_id == 1).first() # Admin
        if u:
            try:
                res = service.get_earnings_summary_by_order(p.id, current_user=u)
                print(f"Total items found: {res.total}")
                for item in res.items:
                    print(f"Order: {item.order_id}, Total Earnings: {item.total_earnings}, Real Photos: {item.real_photos_sold}")
            except Exception as e:
                print(f"Error calling function: {e}")
        else:
            print("Admin user not found to test.")
    else:
        print("No photographer found.")

if __name__ == "__main__":
    test()
