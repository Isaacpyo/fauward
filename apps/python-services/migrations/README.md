Idempotent SQL migrations for python-services.

The app still runs `db.ensure_service_tables()` on startup for backward compatibility.
Apply files in `versions/` in lexical order for production deployments.
