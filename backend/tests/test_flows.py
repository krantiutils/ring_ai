from fastapi.testclient import TestClient

from app.models.user import User
from app.services.auth import create_access_token, hash_password

URL_PREVIEW = "/api/v1/flows/sources/url-preview"
MANUAL_TABLE = "/api/v1/flows/sources/manual-table"


def _create_user(db, username: str, email: str) -> User:
    user = User(
        first_name="Flow",
        last_name="Tester",
        username=username,
        email=email,
        password_hash=hash_password("strongpassword123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_headers(user: User) -> dict[str, str]:
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def test_preview_url_source_csv(client: TestClient, db, monkeypatch):
    user = _create_user(db, username="flow_user", email="flow_user@example.com")

    monkeypatch.setattr(
        "app.api.v1.endpoints.flows._validate_external_url",
        lambda raw_url: raw_url,
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.flows._download_source_text",
        lambda _url: "name,phone,age\nRam,+9779800000000,34\nSita,+9779811111111,29",
    )

    resp = client.post(
        URL_PREVIEW,
        json={"url": "https://example.com/data.csv", "source_kind": "source_url_csv"},
        headers=_auth_headers(user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["headers"] == ["name", "phone", "age"]
    assert data["total_rows"] == 2
    assert len(data["preview_rows"]) == 2
    assert "name,phone,age" in data["sample_csv"]


def test_create_get_update_manual_table_source(client: TestClient, db):
    user = _create_user(db, username="manual_source_user", email="manual_source@example.com")
    headers = _auth_headers(user)

    create_resp = client.post(
        MANUAL_TABLE,
        json={
            "name": "Nepal Leads",
            "headers": ["name", "phone"],
            "rows": [["Ram", "+9779800000000"], ["Sita", "+9779811111111"]],
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    source_id = create_resp.json()["id"]
    assert create_resp.json()["row_count"] == 2

    get_resp = client.get(f"{MANUAL_TABLE}/{source_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Nepal Leads"

    update_resp = client.put(
        f"{MANUAL_TABLE}/{source_id}",
        json={
            "name": "Nepal Leads v2",
            "headers": ["name", "phone", "city"],
            "rows": [["Ram", "+9779800000000", "Kathmandu"]],
        },
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["name"] == "Nepal Leads v2"
    assert updated["row_count"] == 1
    assert updated["headers"] == ["name", "phone", "city"]

