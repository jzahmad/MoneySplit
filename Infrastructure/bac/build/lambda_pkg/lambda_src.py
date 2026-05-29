import os
import json
from mangum import Mangum
from Backend.asgi import application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "Backend.settings")

_asgi_handler = Mangum(application, lifespan="off")

def handler(event, context):
    # HTTP API v2 path
    path = event.get("rawPath") or event.get("requestContext", {}).get("http", {}).get("path") or ""

    # ✅ bypass Django/Middleware redirects completely
    if path in ("/health", "/health/"):
        return {
            "statusCode": 200,
            "headers": {"content-type": "application/json"},
            "body": json.dumps({"status": "ok"}),
        }

    return _asgi_handler(event, context)
