export function PermissionGate({ permission, can, children, fallback = null }) {
  if (!can || !permission) return fallback
  return can(permission) ? children : fallback
}

export function RoleGate({ minRole, hasMinRole, children, fallback = null }) {
  if (!hasMinRole || !minRole) return fallback
  return hasMinRole(minRole) ? children : fallback
}
