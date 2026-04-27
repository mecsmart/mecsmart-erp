"""Shared, framework-agnostic building blocks for the ERP backend.

These modules are the dependency-free foundation that route modules import from:
- `core.db`          — MongoDB client + database handle
- `core.permissions` — Permission constants & role defaults
- `core.auth`        — Password hashing, JWT issuing, current-user dependency
"""
