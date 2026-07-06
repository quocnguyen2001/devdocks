//! File-backed workspace repository: one JSON file per workspace under
//! `<root>/workspaces/<id>.json`. `root` is the app config dir at runtime; tests
//! pass a temp dir. Writes are atomic (temp file + rename).

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::RepoError;
use crate::models::workspace::Workspace;
use crate::storage::migrations::migrate;

pub struct WorkspaceRepo {
    root: PathBuf,
}

impl WorkspaceRepo {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    fn dir(&self) -> PathBuf {
        self.root.join("workspaces")
    }

    fn file(&self, id: &str) -> PathBuf {
        self.dir().join(format!("{id}.json"))
    }

    /// List all valid workspaces. Corrupt/unreadable files are skipped + logged.
    pub fn list(&self) -> Result<Vec<Workspace>, RepoError> {
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
                Ok(ws) => out.push(ws),
                Err(e) => tracing::warn!(?path, error = %e, "skipping unreadable workspace"),
            }
        }
        Ok(out)
    }

    pub fn get(&self, id: &str) -> Result<Workspace, RepoError> {
        let path = self.file(id);
        if !path.exists() {
            return Err(RepoError::NotFound(id.to_string()));
        }
        Self::read_file(&path)
    }

    /// Persist atomically (temp file + rename). Validates and bumps `updated_at`.
    pub fn save(&self, ws: &mut Workspace) -> Result<(), RepoError> {
        ws.validate()?;
        ws.touch();
        self.write_file(ws)
    }

    /// Record a launch timestamp WITHOUT bumping `updated_at` or re-validating —
    /// launch bookkeeping is orthogonal to edit tracking (review H2).
    pub fn record_launched(&self, id: &str, timestamp: String) -> Result<(), RepoError> {
        let mut ws = self.get(id)?;
        ws.metadata.last_launched = Some(timestamp);
        self.write_file(&ws)
    }

    /// Atomic write (temp file + rename) with no validation/timestamp side effects.
    fn write_file(&self, ws: &Workspace) -> Result<(), RepoError> {
        let dir = self.dir();
        fs::create_dir_all(&dir)?;
        let json = serde_json::to_string_pretty(ws)?;
        let tmp = dir.join(format!("{}.json.tmp", ws.id));
        fs::write(&tmp, json)?;
        fs::rename(&tmp, self.file(&ws.id))?;
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

    /// Duplicate a workspace under a fresh id and "(copy)" name.
    pub fn duplicate(&self, id: &str) -> Result<Workspace, RepoError> {
        let mut ws = self.get(id)?;
        ws.id = uuid::Uuid::new_v4().to_string();
        ws.name = format!("{} (copy)", ws.name);
        ws.metadata.created_at = Some(chrono::Utc::now().to_rfc3339());
        ws.metadata.last_launched = None;
        self.save(&mut ws)?;
        Ok(ws)
    }

    fn read_file(path: &Path) -> Result<Workspace, RepoError> {
        let s = fs::read_to_string(path)?;
        let value = serde_json::from_str(&s)?;
        migrate(value)
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
        let repo = WorkspaceRepo::new(&root);
        let mut ws = Workspace::new("Alpha", "/tmp/alpha");
        repo.save(&mut ws).unwrap();

        let got = repo.get(&ws.id).unwrap();
        assert_eq!(got.name, "Alpha");
        assert_eq!(got, ws); // persisted == in-memory after save
        assert_eq!(repo.list().unwrap().len(), 1);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn list_skips_corrupt_files() {
        let root = temp_root();
        let repo = WorkspaceRepo::new(&root);
        let mut ws = Workspace::new("Alpha", "/tmp/alpha");
        repo.save(&mut ws).unwrap();
        fs::write(root.join("workspaces").join("broken.json"), "{ not json").unwrap();

        assert_eq!(repo.list().unwrap().len(), 1); // corrupt one skipped, valid kept
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn save_leaves_no_temp_file() {
        let root = temp_root();
        let repo = WorkspaceRepo::new(&root);
        let mut ws = Workspace::new("Alpha", "/tmp/alpha");
        repo.save(&mut ws).unwrap();

        let tmp = root.join("workspaces").join(format!("{}.json.tmp", ws.id));
        assert!(!tmp.exists());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn duplicate_gets_new_id_and_copy_name() {
        let root = temp_root();
        let repo = WorkspaceRepo::new(&root);
        let mut ws = Workspace::new("Alpha", "/tmp/alpha");
        repo.save(&mut ws).unwrap();

        let dup = repo.duplicate(&ws.id).unwrap();
        assert_ne!(dup.id, ws.id);
        assert!(dup.name.contains("copy"));
        assert_eq!(repo.list().unwrap().len(), 2);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn delete_removes_and_get_errors() {
        let root = temp_root();
        let repo = WorkspaceRepo::new(&root);
        let mut ws = Workspace::new("Alpha", "/tmp/alpha");
        repo.save(&mut ws).unwrap();

        repo.delete(&ws.id).unwrap();
        assert!(repo.get(&ws.id).is_err());
        assert!(repo.delete(&ws.id).is_err()); // deleting again → NotFound
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn save_rejects_invalid() {
        let root = temp_root();
        let repo = WorkspaceRepo::new(&root);
        let mut ws = Workspace::new("", "/tmp/alpha"); // empty name
        assert!(repo.save(&mut ws).is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn save_advances_updated_at() {
        let root = temp_root();
        let repo = WorkspaceRepo::new(&root);
        let mut ws = Workspace::new("Alpha", "/tmp/alpha");
        let before = ws.metadata.updated_at.clone();
        std::thread::sleep(std::time::Duration::from_millis(2));
        repo.save(&mut ws).unwrap();
        assert_ne!(ws.metadata.updated_at, before);
        assert!(ws.metadata.updated_at.is_some());
        fs::remove_dir_all(&root).ok();
    }
}
