# Relay (unrouted until WP-4.R)

`RelayPage`, `SupportAuditPage` and `RelayNotificationCenter` moved here from the legacy `AdminLayout` in WP-1.6.
They are deliberately not mounted by any route: the relay API still answers the console with 401, and a live service
must not own routes that fail. WP-4.R wires them to console auth and routes them under `customer.support`.
