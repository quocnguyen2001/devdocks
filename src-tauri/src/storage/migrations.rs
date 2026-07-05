//! Forward-migration seam for persisted workspace JSON.
//!
//! v1 is the baseline (no-op). A future breaking change bumps
//! `WORKSPACE_SCHEMA_VERSION` and adds an arm below that transforms the raw
//! `Value` before it is deserialized into the current `Workspace` shape.

use serde_json::Value;

use crate::error::RepoError;
use crate::models::workspace::{Workspace, WORKSPACE_SCHEMA_VERSION};

pub fn migrate(value: Value) -> Result<Workspace, RepoError> {
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(WORKSPACE_SCHEMA_VERSION as u64);

    // Forward migrations go here as the schema evolves, e.g.
    //   if version < 2 { v1_to_v2(&mut value); }
    if version > WORKSPACE_SCHEMA_VERSION as u64 {
        tracing::warn!(
            file_version = version,
            supported = WORKSPACE_SCHEMA_VERSION,
            "workspace schema is newer than supported; parsing as-is"
        );
    }

    let ws: Workspace = serde_json::from_value(value)?;
    Ok(ws)
}
