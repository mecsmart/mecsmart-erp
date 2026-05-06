"""Module/role permission catalog.

The single source of truth for what modules exist in the app and which actions
each role can perform on them by default. `get_current_user` overlays per-user
and per-role-group permissions on top of these defaults.
"""

# Module permission definitions.
# NOTE: `bom_process_cost` supports only [view, edit]; `bom_rollup_cost` supports only [view].
# Pseudo-modules `inventory_sale_price` / `inventory_purchase_price` /
# `inventory_configuration` only have [view] and gate price-column visibility
# and access to the Inventory Configuration screen respectively. Every other
# module supports the full CRUD set (`ALL_ACTIONS`).
ALL_MODULES = [
    "dashboard", "items", "bom", "routings", "bom_process_cost", "bom_rollup_cost",
    "mrp", "production", "manufacturing",
    "quality", "inventory", "inventory_sale_price", "inventory_purchase_price",
    "inventory_configuration",
    "suppliers", "customers",
    "purchase_orders", "purchase_invoices", "delivery_challan", "job_work",
    "stores", "settings",
    "crm_marketing", "crm_support",
    "marketing_configuration", "support_configuration",
]

ALL_ACTIONS = ["view", "create", "edit", "delete"]

# Per-module allowed action set (override). If a module isn't listed here, it
# uses ALL_ACTIONS.
MODULE_ACTIONS = {
    "bom_process_cost": ["view", "edit"],
    "bom_rollup_cost": ["view"],
    "inventory_sale_price": ["view"],
    "inventory_purchase_price": ["view"],
    # Configuration modules use [view, edit] only — `view` reveals the page in
    # the sidebar; `edit` permits saving changes. There's no separate create/
    # delete since these are "single document" config screens.
    "inventory_configuration": ["view", "edit"],
    "marketing_configuration": ["view", "edit"],
    "support_configuration": ["view", "edit"],
}


def allowed_actions_for(module: str) -> list:
    return MODULE_ACTIONS.get(module, ALL_ACTIONS)


# Default permissions by role.
DEFAULT_PERMISSIONS = {
    "admin": {m: allowed_actions_for(m).copy() for m in ALL_MODULES},
    "production_manager": {
        "dashboard": ["view"], "items": ["view", "create", "edit"], "bom": ["view", "create", "edit"],
        "routings": ["view", "create", "edit"],
        "bom_process_cost": ["view", "edit"], "bom_rollup_cost": [],
        "mrp": ["view"], "production": ["view", "create", "edit", "delete"],
        "manufacturing": ["view", "create", "edit", "delete"], "quality": ["view"],
        "inventory": ["view"], "suppliers": ["view", "create", "edit"],
        "customers": ["view", "create", "edit"],
        "purchase_orders": ["view", "create", "edit"],
        "purchase_invoices": ["view", "create", "edit"],
        "delivery_challan": ["view", "create", "edit", "delete"],
        "job_work": ["view", "create", "edit", "delete"],
        "stores": ["view"], "settings": ["view"],
    },
    "quality_inspector": {
        "dashboard": ["view"], "items": ["view"], "bom": ["view"], "routings": ["view"],
        "bom_process_cost": [], "bom_rollup_cost": [],
        "mrp": [], "production": ["view"],
        "manufacturing": ["view"], "quality": ["view", "create", "edit"],
        "inventory": ["view"], "suppliers": [],
        "customers": [], "purchase_orders": [], "purchase_invoices": [],
        "delivery_challan": ["view"], "job_work": ["view"],
        "stores": ["view"], "settings": ["view"],
    },
    "inventory_manager": {
        "dashboard": ["view"], "items": ["view", "create", "edit"], "bom": ["view"], "routings": ["view"],
        "bom_process_cost": [], "bom_rollup_cost": [],
        "mrp": ["view"], "production": ["view"],
        "manufacturing": ["view"], "quality": ["view"],
        "inventory": ["view", "create", "edit", "delete"], "suppliers": ["view"],
        "customers": ["view"],
        "purchase_orders": ["view", "create", "edit"],
        "purchase_invoices": ["view", "create", "edit"],
        "delivery_challan": ["view", "create", "edit"],
        "job_work": ["view"],
        "stores": ["view", "create", "edit", "delete"], "settings": ["view"],
    },
}


def get_default_permissions(role: str) -> dict:
    return DEFAULT_PERMISSIONS.get(role, DEFAULT_PERMISSIONS["inventory_manager"])
