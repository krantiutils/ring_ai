def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_api_v1_voice(client):
    response = client.get("/api/v1/voice/")
    assert response.status_code == 200


def test_api_v1_text(client):
    response = client.get("/api/v1/text/")
    assert response.status_code == 200


def test_api_v1_forms(client):
    response = client.get("/api/v1/forms/")
    assert response.status_code == 200


def test_api_v1_campaigns(client):
    response = client.get("/api/v1/campaigns/")
    assert response.status_code == 200


def test_api_v1_templates(client):
    response = client.get("/api/v1/templates/")
    assert response.status_code == 200


def test_api_v1_analytics(client):
    response = client.get("/api/v1/analytics/")
    assert response.status_code == 200
