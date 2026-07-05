//! Error types for workspace storage and commands.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("workspace not found: {0}")]
    NotFound(String),
    #[error("invalid workspace: {0}")]
    Validation(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Serde(#[from] serde_json::Error),
}
