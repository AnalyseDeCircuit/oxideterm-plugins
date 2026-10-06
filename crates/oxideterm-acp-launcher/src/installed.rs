use std::{
    io,
    path::{Component, Path, PathBuf},
};

fn from_path(names: &[String]) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|path| {
        std::env::split_paths(&path).find_map(|directory| {
            names
                .iter()
                .map(|name| directory.join(name))
                .find(|path| path.is_file())
        })
    })
}

pub(super) fn resolve(
    command: &Path,
    explicit: bool,
    package: Option<(&str, &str)>,
) -> io::Result<(PathBuf, Vec<String>)> {
    let command = if explicit {
        command.to_path_buf()
    } else {
        let name = command.to_string_lossy();
        let names = if cfg!(windows) {
            if package.is_some() {
                vec![format!("{name}.exe"), format!("{name}.cmd")]
            } else {
                vec![format!("{name}.exe")]
            }
        } else {
            vec![name.into_owned()]
        };
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" });
        from_path(&names)
            .or_else(|| {
                home.and_then(|home| {
                    let bin = PathBuf::from(home).join(".local").join("bin");
                    names
                        .iter()
                        .map(|name| bin.join(name))
                        .find(|path| path.is_file())
                })
            })
            .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?
    };
    let extension = command
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let script = if extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("ps1") {
        let (package, bin) = package.ok_or_else(|| io::Error::from(io::ErrorKind::Unsupported))?;
        let directory = command
            .parent()
            .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?;
        // Read the installed package's declared entry, never the command wrapper's text.
        let global = directory.join("node_modules").join(package);
        let root = if global.is_dir() {
            global
        } else if directory.file_name().is_some_and(|name| name == ".bin") {
            directory
                .parent()
                .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?
                .join(package)
        } else {
            return Err(io::Error::from(io::ErrorKind::NotFound));
        };
        Some(package_entry(&root, package, bin)?)
    } else if ["js", "mjs", "cjs"]
        .iter()
        .any(|suffix| extension.eq_ignore_ascii_case(suffix))
    {
        Some(command.clone())
    } else {
        None
    };
    if let Some(script) = script {
        let node_name = if cfg!(windows) { "node.exe" } else { "node" };
        let bundled = command
            .parent()
            .map(|parent| parent.join(node_name))
            .filter(|path| path.is_file());
        let node = bundled
            .or_else(|| from_path(&[node_name.to_owned()]))
            .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?;
        Ok((node, vec![script.to_string_lossy().into_owned()]))
    } else {
        Ok((command, Vec::new()))
    }
}

fn package_entry(root: &Path, package: &str, bin: &str) -> io::Result<PathBuf> {
    let metadata: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join("package.json"))?)
            .map_err(|_| io::Error::from(io::ErrorKind::InvalidData))?;
    if metadata["name"].as_str() != Some(package) {
        return Err(io::Error::from(io::ErrorKind::InvalidData));
    }
    let entry = metadata["bin"]
        .as_str()
        .or_else(|| metadata["bin"][bin].as_str())
        .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidData))?;
    let entry = PathBuf::from(entry.replace('\\', "/"));
    if !entry
        .components()
        .all(|part| matches!(part, Component::Normal(_) | Component::CurDir))
        || entry.as_os_str().is_empty()
        || entry.to_string_lossy().contains(':')
    {
        return Err(io::Error::from(io::ErrorKind::InvalidData));
    }
    let root = root.canonicalize()?;
    let script = root.join(entry).canonicalize()?;
    if !script.starts_with(root) || !script.is_file() {
        return Err(io::Error::from(io::ErrorKind::InvalidData));
    }
    Ok(script)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn npm_shim_uses_the_packages_entry_without_interpreting_shell_text() {
        let root = std::env::temp_dir().join(format!(
            "acp-npm-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let package = root
            .join("node_modules")
            .join("@qwen-code")
            .join("qwen-code");
        std::fs::create_dir_all(package.join("dist")).unwrap();
        std::fs::write(
            package.join("package.json"),
            r#"{"name":"@qwen-code/qwen-code","bin":{"qwen":"dist/cli.js"}}"#,
        )
        .unwrap();
        std::fs::write(package.join("dist").join("cli.js"), "fixture").unwrap();
        let node = root.join(if cfg!(windows) { "node.exe" } else { "node" });
        std::fs::write(&node, []).unwrap();
        let shim = root.join("qwen.cmd");
        std::fs::write(&shim, "This shell wrapper must never be executed.").unwrap();
        let (program, args) = resolve(&shim, true, Some(("@qwen-code/qwen-code", "qwen"))).unwrap();
        assert_eq!(program, node);
        assert_eq!(
            args,
            [package
                .join("dist")
                .join("cli.js")
                .canonicalize()
                .unwrap()
                .to_string_lossy()]
        );
        let local_bin = root.join("node_modules").join(".bin");
        std::fs::create_dir_all(&local_bin).unwrap();
        std::fs::copy(&node, local_bin.join(node.file_name().unwrap())).unwrap();
        std::fs::write(
            package.join("package.json"),
            r#"{"name":"@qwen-code/qwen-code","bin":"./dist/cli.js"}"#,
        )
        .unwrap();
        let (program, local_args) = resolve(
            &local_bin.join("qwen.ps1"),
            true,
            Some(("@qwen-code/qwen-code", "qwen")),
        )
        .unwrap();
        assert_eq!(program, local_bin.join(node.file_name().unwrap()));
        assert_eq!(local_args, args);
        for entry in [
            "../outside.js",
            "C:/outside.js",
            "/outside.js",
            "..\\outside.js",
        ] {
            std::fs::write(
                package.join("package.json"),
                serde_json::json!({"name":"@qwen-code/qwen-code", "bin":{"qwen":entry}})
                    .to_string(),
            )
            .unwrap();
            assert_eq!(
                resolve(&shim, true, Some(("@qwen-code/qwen-code", "qwen")))
                    .unwrap_err()
                    .kind(),
                io::ErrorKind::InvalidData
            );
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
