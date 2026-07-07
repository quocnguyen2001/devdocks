//! File-backed workflow repository: one JSON file per workflow under
//! `<root>/workflows/<id>.json`. `root` is the app config dir at runtime;
//! tests pass a temp dir. Writes are atomic (temp file + rename). Structurally
//! mirrors `WorkspaceRepo`.
//!
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::RepoError;
use crate::models::workflow::{Workflow, WorkflowRunStatus};
use crate::storage::migrations::migrate_workflow;

pub struct WorkflowRepo {
    root: PathBuf,
}

impl WorkflowRepo {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    fn dir(&self) -> PathBuf {
        self.root.join("workflows")
    }

    fn file(&self, id: &str) -> PathBuf {
        self.dir().join(format!("{id}.json"))
    }

    /// List all valid workflows. Corrupt/unreadable files are skipped + logged.
    pub fn list(&self) -> Result<Vec<Workflow>, RepoError> {
        let dir = self.dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut out = Vec::new();
        for entry in fs::read_dir(&dir)? {
            let path = entry?.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            match Self::read_file(&path) {
                Ok(wf) => out.push(wf),
                Err(e) => tracing::warn!(?path, error = %e, "skipping unreadable workflow"),
            }
        }
        Ok(out)
    }

    pub fn get(&self, id: &str) -> Result<Workflow, RepoError> {
        let path = self.file(id);
        if !path.exists() {
            return Err(RepoError::NotFound(id.to_string()));
        }
        Self::read_file(&path)
    }

    /// Persist atomically (temp file + rename). Validates and bumps `updated_at`.
    pub fn save(&self, wf: &mut Workflow) -> Result<(), RepoError> {
        wf.validate()?;
        wf.touch();
        self.write_file(wf)
    }

    /// Record a run outcome WITHOUT re-validating or bumping `updated_at`.
    /// Re-reads the file at write time and patches ONLY the two run-status
    /// fields on the fresh JSON, so a concurrent `save_workflow` is not
    /// clobbered by a stale in-memory document.
    pub fn record_run(
        &self,
        id: &str,
        at: String,
        status: WorkflowRunStatus,
    ) -> Result<(), RepoError> {
        let path = self.file(id);
        if !path.exists() {
            return Err(RepoError::NotFound(id.to_string()));
        }
        let mut value: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path)?)?;
        let meta = value
            .get_mut("metadata")
            .and_then(serde_json::Value::as_object_mut)
            .ok_or_else(|| RepoError::Validation("workflow metadata missing".into()))?;
        meta.insert("lastRunAt".into(), serde_json::Value::String(at));
        meta.insert("lastRunStatus".into(), serde_json::to_value(status)?);
        self.write_raw(id, &value)
    }

    /// Atomic write (temp file + rename) with no validation/timestamp side effects.
    fn write_file(&self, wf: &Workflow) -> Result<(), RepoError> {
        let json = serde_json::to_string_pretty(wf)?;
        self.write_raw_json(&wf.id, json)
    }

    /// Atomic write of an arbitrary `serde_json::Value` sibling of `write_file`,
    /// used by `record_run` to patch only the run-status fields without
    /// re-serializing the whole (possibly stale) in-memory `Workflow`.
    fn write_raw(&self, id: &str, value: &serde_json::Value) -> Result<(), RepoError> {
        let json = serde_json::to_string_pretty(value)?;
        self.write_raw_json(id, json)
    }

    fn write_raw_json(&self, id: &str, json: String) -> Result<(), RepoError> {
        let dir = self.dir();
        fs::create_dir_all(&dir)?;
        let tmp = dir.join(format!("{id}.json.tmp"));
        fs::write(&tmp, json)?;
        fs::rename(&tmp, self.file(id))?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), RepoError> {
        let path = self.file(id);
        if !path.exists() {
            return Err(RepoError::NotFound(id.to_string()));
        }
        fs::remove_file(path)?;
        Ok(())
    }

    /// Duplicate a workflow under a fresh id and "(copy)" name.
    pub fn duplicate(&self, id: &str) -> Result<Workflow, RepoError> {
        let mut wf = self.get(id)?;
        wf.id = uuid::Uuid::new_v4().to_string();
        wf.name = format!("{} (copy)", wf.name);
        wf.metadata.created_at = Some(chrono::Utc::now().to_rfc3339());
        wf.metadata.last_run_at = None;
        wf.metadata.last_run_status = None;
        self.save(&mut wf)?;
        Ok(wf)
    }

    fn read_file(path: &Path) -> Result<Workflow, RepoError> {
        let s = fs::read_to_string(path)?;
        let value = serde_json::from_str(&s)?;
        migrate_workflow(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let d = std::env::temp_dir().join(format!("devdock-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn save_get_list_roundtrip() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new("Alpha");
        repo.save(&mut wf).unwrap();

        let got = repo.get(&wf.id).unwrap();
        assert_eq!(got.name, "Alpha");
        assert_eq!(got, wf); // persisted == in-memory after save
        assert_eq!(repo.list().unwrap().len(), 1);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn list_skips_corrupt_files() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new("Alpha");
        repo.save(&mut wf).unwrap();
        fs::write(root.join("workflows").join("broken.json"), "{ not json").unwrap();

        assert_eq!(repo.list().unwrap().len(), 1); // corrupt one skipped, valid kept
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn save_leaves_no_temp_file() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new("Alpha");
        repo.save(&mut wf).unwrap();

        let tmp = root.join("workflows").join(format!("{}.json.tmp", wf.id));
        assert!(!tmp.exists());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn duplicate_gets_new_id_and_copy_name() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new("Alpha");
        repo.save(&mut wf).unwrap();

        let dup = repo.duplicate(&wf.id).unwrap();
        assert_ne!(dup.id, wf.id);
        assert!(dup.name.contains("copy"));
        assert_eq!(repo.list().unwrap().len(), 2);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn delete_removes_and_get_errors() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new("Alpha");
        repo.save(&mut wf).unwrap();

        repo.delete(&wf.id).unwrap();
        assert!(repo.get(&wf.id).is_err());
        assert!(repo.delete(&wf.id).is_err()); // deleting again -> NotFound
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn save_rejects_invalid() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new(""); // empty name
        assert!(repo.save(&mut wf).is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn save_advances_updated_at() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new("Alpha");
        let before = wf.metadata.updated_at.clone();
        std::thread::sleep(std::time::Duration::from_millis(2));
        repo.save(&mut wf).unwrap();
        assert_ne!(wf.metadata.updated_at, before);
        assert!(wf.metadata.updated_at.is_some());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn record_run_patches_only_run_status_fields() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new("Alpha");
        repo.save(&mut wf).unwrap();
        let updated_at_before = wf.metadata.updated_at.clone();

        repo.record_run(
            &wf.id,
            "2026-07-07T00:00:00Z".into(),
            WorkflowRunStatus::Completed,
        )
        .unwrap();

        let got = repo.get(&wf.id).unwrap();
        assert_eq!(
            got.metadata.last_run_at,
            Some("2026-07-07T00:00:00Z".into())
        );
        assert_eq!(
            got.metadata.last_run_status,
            Some(WorkflowRunStatus::Completed)
        );
        // updated_at must NOT change (record_run is orthogonal to edit tracking).
        assert_eq!(got.metadata.updated_at, updated_at_before);
        assert_eq!(got.name, "Alpha");

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn record_run_preserves_a_concurrently_saved_edit() {
        // Simulate: run started against `wf` in memory, then a `save_workflow`
        // for the SAME workflow lands on disk (renamed field) BEFORE
        // `record_run` re-reads + writes. `record_run` must patch the fresh
        // (edited) document, not clobber it with the stale in-memory one.
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        let mut wf = Workflow::new("Alpha");
        repo.save(&mut wf).unwrap();

        let mut edited = repo.get(&wf.id).unwrap();
        edited.name = "Alpha (edited)".into();
        repo.save(&mut edited).unwrap();

        repo.record_run(
            &wf.id,
            "2026-07-07T00:00:00Z".into(),
            WorkflowRunStatus::Failed,
        )
        .unwrap();

        let got = repo.get(&wf.id).unwrap();
        assert_eq!(got.name, "Alpha (edited)"); // edit survives
        assert_eq!(
            got.metadata.last_run_status,
            Some(WorkflowRunStatus::Failed)
        );

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn record_run_errors_on_missing_workflow() {
        let root = temp_root();
        let repo = WorkflowRepo::new(&root);
        assert!(repo
            .record_run("missing", "now".into(), WorkflowRunStatus::Completed)
            .is_err());
        fs::remove_dir_all(&root).ok();
    }
}
