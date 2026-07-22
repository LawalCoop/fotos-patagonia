# -*- coding: utf-8 -*-
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone

# Import models and services
from models.order import PaymentMethod, PaymentStatus, OrderStatus
from models.user import User
from models.photographer import Photographer
from models.album import Album
from models.photo_session import PhotoSession
from models.photo import Photo
from models.order import Order, OrderItem
from models.earning import Earning
from services.orders import process_earnings_for_order_item

# --- Helper Fixtures for Test Setup ---

@pytest.fixture(scope="function")
def test_photographer(db_session: Session, user_factory) -> Photographer:
    """Creates a photographer user and profile for tests."""
    user = user_factory("Photographer", "photographer.orders@test.com")
    return user.photographer

@pytest.fixture(scope="function")
def test_photo(db_session: Session, test_photographer: Photographer, monkeypatch) -> Photo:
    """Creates a complete photo entity (photographer, album, session, photo) for use in tests."""
    # Mock the storage service to avoid actual S3 calls
    mock_get_url = "http://minio:9000/fotopatagonia/mocked_order_photo.jpg"
    monkeypatch.setattr(
        "app.services.storage.StorageService.generate_presigned_get_url",
        lambda self, object_name: mock_get_url
    )

    album = Album(
        name="Test Album Order",
        description="An album for order tests"
    )
    db_session.add(album)

    photo_session = PhotoSession(
        event_name="Test Session Order",
        event_date=datetime.now(timezone.utc),
        location="Test Location Order",
        photographer_id=test_photographer.id,
        album_id=album.id
    )
    db_session.add(photo_session)

    photo = Photo(
        filename="test_photo_order.jpg", # Use filename instead of object_name
        description="Test Photo Order",
        price=15.0,
        url="http://example.com/photos/order-test-photo.jpg", # Provide a dummy URL
        watermark_url="http://example.com/photos/order-test-photo-watermark.jpg", # Provide a dummy watermark URL
        photographer_id=test_photographer.id,
        session_id=photo_session.id
    )
    db_session.add(photo)
    db_session.flush() # Use flush instead of commit to make objects available
    db_session.refresh(album)
    db_session.refresh(photo_session)
    db_session.refresh(photo)
    return photo

@pytest.fixture(scope="function")
def test_order(db_session: Session, test_photo: Photo, user_factory) -> Order:
    """Creates a regular user and an order with one item for that user."""
    customer_user = user_factory("Customer", "customer.orders@test.com")
    
    order = Order(
        user_id=customer_user.id,
        total=15.0,
        payment_method=PaymentMethod.MP,
        payment_status=PaymentStatus.PENDING,
        order_status=OrderStatus.PENDING,
    )
    db_session.add(order)

    order_item = OrderItem(
        order_id=order.id,
        photo_id=test_photo.id,
        quantity=1,
        price=test_photo.price
    )
    db_session.add(order_item)
    order.items.append(order_item)
    db_session.flush() # Use flush instead of commit to make objects available
    db_session.refresh(order)
    db_session.refresh(order_item)
    # Ensure relationships are loaded for the returned order object
    order = db_session.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.photo).joinedload(Photo.photographer)
    ).filter(Order.id == order.id).one()
    return order

# --- Service Layer Tests ---

def test_process_earnings_for_order_item(db_session: Session, test_order: Order):
    """
    Tests the core business logic of calculating and creating an earning record.
    """
    order_item = test_order.items[0]
    photographer = order_item.photo.photographer
    photographer.commission_percentage = 20.0 # Set a clear commission for the test
    db_session.flush() # Use flush instead of commit to make objects available

    # Execute the service function
    earning = process_earnings_for_order_item(db_session, order_item)
    db_session.commit() # Commit the earning to the database

    # Assertions
    assert earning is not None
    assert earning.photographer_id == photographer.id
    assert earning.order_item_id == order_item.id
    assert earning.commission_applied == 20.0
    
    item_price = order_item.price * order_item.quantity
    expected_amount = item_price * (1 - 0.20) # 15.0 * 0.80
    assert earning.amount == expected_amount

    # Verify it's in the database
    db_earning = db_session.query(Earning).filter_by(id=earning.id).one()
    assert db_earning.amount == expected_amount

# --- API Layer Tests ---

def test_list_all_orders_as_supervisor(supervisor_client: TestClient, test_order: Order):
    """Supervisors should be able to list all orders."""
    response = supervisor_client.get("/orders/")
    assert response.status_code == 200, response.text
    orders = response.json()
    assert len(orders) >= 1
    assert orders[0]["id"] == test_order.id

def test_list_all_orders_permission_denied(photographer_client: TestClient, test_order: Order):
    """Photographers should not be able to list all orders."""
    response = photographer_client.get("/orders/")
    assert response.status_code == 403, response.text

def test_list_my_orders_as_customer(client: TestClient, db_session: Session, user_factory, test_photo: Photo):
    """A customer should be able to list their own orders."""
    # Create and authenticate a specific customer for this test
    customer_user = user_factory("Customer", "customer.myorders@test.com")
    from conftest import get_auth_headers
    client.headers = get_auth_headers(client, customer_user.email)

    # Create an order for this specific user
    order = Order(
        user_id=customer_user.id,
        total=15.0,
        payment_method=PaymentMethod.MP,
        payment_status=PaymentStatus.PENDING,
        order_status=OrderStatus.PENDING,
    )
    db_session.add(order)
    order_item = OrderItem(order_id=order.id, photo_id=test_photo.id, quantity=1, price=15.0)
    db_session.add(order_item)
    db_session.flush() # Use flush instead of commit to make objects available
    db_session.refresh(order)
    db_session.refresh(order_item)

    response = client.get("/orders/my-orders")
    assert response.status_code == 200, response.text
    orders = response.json()
    assert len(orders) == 1
    assert orders[0]["id"] == order.id
    assert orders[0]["user"]["id"] == customer_user.id

def test_get_order_details_as_supervisor(supervisor_client: TestClient, test_order: Order):
    """Supervisors should be able to get details of any order."""
    response = supervisor_client.get(f"/orders/{test_order.id}")
    assert response.status_code == 200, response.text
    order_details = response.json()
    assert order_details["id"] == test_order.id
    assert len(order_details["items"]) == 1

def test_update_order_status_as_supervisor(supervisor_client: TestClient, test_order: Order):
    """Supervisors can change the order status."""
    url = f"/orders/{test_order.id}/status"
    params = {
        "new_status": OrderStatus.COMPLETED.value,
        "payment_method": PaymentMethod.EFECTIVO.value
    }
    response = supervisor_client.put(url, params=params)
    assert response.status_code == 200, response.text
    assert response.json()["order_status"] == OrderStatus.PAID.value

def test_update_order_status_permission_denied(photographer_client: TestClient, test_order: Order):
    """Photographers cannot change the order status."""
    url = f"/orders/{test_order.id}/status?new_status={OrderStatus.COMPLETED.value}"
    response = photographer_client.put(url)
    assert response.status_code == 403, response.text

def test_mark_order_as_paid_creates_earning(supervisor_client: TestClient, db_session: Session, test_order: Order):
    """
    When a supervisor marks an order as PAID, an Earning record should be created.
    """
    # Ensure photographer has a specific commission
    photographer = test_order.items[0].photo.photographer
    photographer.commission_percentage = 15.0
    db_session.flush() # Use flush instead of commit to make objects available

    # The order starts as PENDING
    assert test_order.payment_status == PaymentStatus.PENDING
    
    # API call to mark as PAID
    url = f"/orders/{test_order.id}/status"
    params = {
        "new_status": OrderStatus.PAID.value,
        "payment_status": PaymentStatus.PAID.value,
        "payment_method": PaymentMethod.EFECTIVO.value # Required when marking as paid
    }
    response = supervisor_client.put(url, params=params)
    
    # Assert API response
    assert response.status_code == 200, response.text
    updated_order = response.json()
    assert updated_order["payment_status"] == PaymentStatus.PAID.value
    assert updated_order["order_status"] == OrderStatus.PAID.value
    assert updated_order["payment_method"] == PaymentMethod.EFECTIVO.value

    # Assert database state
    db_session.refresh(test_order)
    assert test_order.payment_status == PaymentStatus.PAID
    
    # Verify that the Earning record was created
    earning = db_session.query(Earning).filter_by(order_item_id=test_order.items[0].id).one_or_none()
    assert earning is not None
    assert earning.photographer_id == photographer.id
    assert earning.commission_applied == 15.0
    
    item_price = test_order.items[0].price
    expected_amount = item_price * (1 - 0.15) # 15.0 * 0.85
    assert earning.amount == pytest.approx(expected_amount)

def test_mark_order_as_paid_requires_payment_method(supervisor_client: TestClient, test_order: Order):
    """
    Test that the 'payment_method' query parameter is required when updating
    payment_status to PAID.
    """
    url = f"/orders/{test_order.id}/status"
    params = {
        "new_status": OrderStatus.PAID.value,
        "payment_status": PaymentStatus.PAID.value,
        # Missing payment_method
    }    
    response = supervisor_client.put(url, params=params)

    assert response.status_code == 400
    # FastAPI validation errors return a list of dicts, not a single string.
    # Check if 'payment_method' is mentioned in any of the error details.
    detail = response.json()["detail"]
    if isinstance(detail, list):
        assert any("payment_method" in str(err).lower() for err in detail)
    else:
        assert "payment method" in detail.lower()

# --- ZIP de descarga (regresion del bug de 'place') ---

def test_download_zip_contains_photos(client, db_session, user_factory, test_photographer, monkeypatch):
    """
    El zip debe contener las fotos del pedido. Antes, generate_order_zip leia
    photo.place (inexistente) y descartaba cada foto: el zip salia vacio.
    """
    import io
    import zipfile
    from models.album import Album
    from models.photo_session import PhotoSession
    from models.photo import Photo
    from models.order import Order, OrderItem, PaymentMethod, PaymentStatus, OrderStatus

    # S3 falso: devuelve bytes de imagen sin salir a la red.
    fake_body = type("Body", (), {"read": lambda self: b"IMG-BYTES"})()
    monkeypatch.setattr(
        "app.services.orders.storage_service.s3_client.get_object",
        lambda **kwargs: {"Body": fake_body},
    )

    album = Album(name="Zip Album", description="d")
    db_session.add(album)
    db_session.flush()
    session = PhotoSession(
        event_name="Zip Session", event_date=datetime.now(timezone.utc),
        location="loc", photographer_id=test_photographer.id, album_id=album.id,
    )
    db_session.add(session)
    db_session.flush()

    photos = [
        Photo(
            filename=f"z{i}.jpg", description=f"foto {i}", price=10.0,
            object_name=f"photos/zip-{i}.jpg",
            photographer_id=test_photographer.id, session_id=session.id,
        )
        for i in range(3)
    ]
    db_session.add_all(photos)
    db_session.flush()

    customer = user_factory("Customer", "customer.zip@test.com")
    order = Order(
        user_id=customer.id, total=30.0, payment_method=PaymentMethod.MP,
        payment_status=PaymentStatus.PAID, order_status=OrderStatus.PAID,
    )
    db_session.add(order)
    db_session.flush()
    for p in photos:
        db_session.add(OrderItem(order_id=order.id, photo_id=p.id, quantity=1, price=p.price))
    db_session.flush()
    db_session.refresh(order)

    response = client.get(f"/orders/public/{order.public_id}/download-zip")

    assert response.status_code == 200, response.text
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        names = zf.namelist()
    # El bug dejaba names == []; ahora deben estar las 3 fotos.
    assert len(names) == 3, f"El zip deberia tener 3 fotos, tiene {len(names)}: {names}"
