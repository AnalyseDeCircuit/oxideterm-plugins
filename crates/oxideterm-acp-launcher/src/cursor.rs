use std::{
    io,
    path::{Path, PathBuf},
};

pub(super) fn resolve(command: &Path, explicit: bool) -> io::Result<(PathBuf, Vec<String>)> {
    let command = if explicit {
        command.to_path_buf()
    } else {
        let executable = if cfg!(windows) {
            "cursor-agent.cmd"
        } else {
            "cursor-agent"
        };
        let from_path = std::env::var_os("PATH").and_then(|path| {
            std::env::split_paths(&path)
                .map(|directory| directory.join(executable))
                .find(|path| path.is_file())
        });
        let installed = if cfg!(windows) {
            std::env::var_os("LOCALAPPDATA")
                .map(|root| PathBuf::from(root).join("cursor-agent/cursor-agent.cmd"))
        } else {
            std::env::var_os("HOME").map(|root| PathBuf::from(root).join(".local/bin/cursor-agent"))
        };
        from_path
            .or(installed.filter(|path| path.is_file()))
            .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?
    };
    if command
        .extension()
        .is_some_and(|extension| extension == "cmd" || extension == "ps1")
    {
        let root = command
            .parent()
            .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?;
        let directory = package_directory(root)?;
        // The official Windows wrapper runs its bundled Node and index.js.
        // Use that same entry directly, preserving argv without a command shell.
        Ok((
            directory.join("node.exe"),
            vec![directory.join("index.js").to_string_lossy().into_owned()],
        ))
    } else {
        Ok((command, Vec::new()))
    }
}

fn package_directory(root: &Path) -> io::Result<PathBuf> {
    let complete = |path: &Path| path.join("node.exe").is_file() && path.join("index.js").is_file();
    if complete(root) {
        return Ok(root.to_path_buf());
    }
    let mut versions = std::fs::read_dir(root.join("versions"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let (date, suffix) = name.split_once('-')?;
            let parts = date
                .split('.')
                .map(str::parse::<u32>)
                .collect::<Result<Vec<_>, _>>()
                .ok()?;
            if parts.len() != 3
                || suffix.is_empty()
                || !suffix
                    .chars()
                    .all(|character| character.is_ascii_hexdigit() || character == '-')
            {
                return None;
            }
            let path = entry.path();
            complete(&path).then_some(((parts, suffix.to_owned()), path))
        })
        .collect::<Vec<_>>();
    versions.sort_by(|left, right| left.0.cmp(&right.0));
    versions
        .pop()
        .map(|(_, path)| path)
        .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_cursor_uses_latest_complete_package_without_interpreting_wrapper_text() {
        let root = std::env::temp_dir().join(format!(
            "cursor-launcher-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        for version in [
            "2026.9.30-abcd",
            "2026.10.01-12-20-01-abcd",
            "2026.10.01-12-20-02-bbbb",
        ] {
            let directory = root.join("versions").join(version);
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(directory.join("node.exe"), []).unwrap();
            std::fs::write(directory.join("index.js"), []).unwrap();
        }
        std::fs::create_dir_all(root.join("versions/2026.10.02-cccc")).unwrap();
        let expected = root.join("versions/2026.10.01-12-20-02-bbbb");
        let (program, prefix) = resolve(&root.join("cursor-agent.cmd"), true).unwrap();
        assert_eq!(program, expected.join("node.exe"));
        assert_eq!(prefix, [expected.join("index.js").to_string_lossy()]);
        let direct = root.join("agent executable");
        assert_eq!(resolve(&direct, true).unwrap(), (direct, vec![]));
        std::fs::remove_dir_all(root).unwrap();
    }
}
