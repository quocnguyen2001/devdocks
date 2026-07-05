//! Launch engine: restores a workspace by launching its tools in Rust.
//!
//! Everything runs Rust-side (processes spawned via `tokio::process::Command`
//! with argv arrays — no shell), so the ONE string-composed path (the terminal
//! AppleScript in `escape`) is the sole injection surface, and `escape` is its
//! audited, tested boundary.

pub mod detect;
pub mod escape;
pub mod launchers;
pub mod orchestrator;
pub mod path_env;
pub mod run_plan;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LaunchError {
    #[error("escaping/validation failed: {0}")]
    Escape(String),
    #[error("path not found: {0}")]
    PathNotFound(String),
    #[error("a launch is already in progress")]
    AlreadyRunning,
}

/// Per-step status streamed to the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StepStatus {
    Pending,
    Running,
    Ok,
    Failed,
    Skipped,
}

/// Terminal apps that support full AppleScript automation (cwd + command).
/// Warp is launch-only and handled separately.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TermApp {
    Iterm2,
    Terminal,
}

/// One step's outcome after execution.
#[derive(Debug, Clone)]
pub struct StepOutcome {
    pub status: StepStatus,
    pub message: Option<String>,
}

impl StepOutcome {
    pub fn ok() -> Self {
        Self {
            status: StepStatus::Ok,
            message: None,
        }
    }
    pub fn failed(msg: impl Into<String>) -> Self {
        Self {
            status: StepStatus::Failed,
            message: Some(msg.into()),
        }
    }
    pub fn skipped(msg: impl Into<String>) -> Self {
        Self {
            status: StepStatus::Skipped,
            message: Some(msg.into()),
        }
    }
}

/// Progress event payload emitted as `launch:progress`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchProgress {
    pub run_id: String,
    pub step_id: String,
    pub kind: String,
    pub label: String,
    pub status: StepStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
