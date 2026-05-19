Idempotent SQL and Alembic migrations for python-services.

The app still runs `db.ensure_service_tables()` on startup for backward compatibility.
Apply legacy `.sql` files in `versions/` in lexical order for production deployments.
Apply Alembic revisions with `python -m alembic upgrade head`.
