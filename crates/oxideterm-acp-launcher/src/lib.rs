// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Launch installed ACP programs with inherited streams and bounded process ownership.

use std::{path::PathBuf, process::Command};
use zeroize::{Zeroize, Zeroizing};
mod cursor;
mod installed;

#[derive(Clone, Copy)]
pub enum Provider {
    OpenCode,
    Antigravity,
    Grok,
    Cursor,
    Copilot,
    QwenCode,
    Kimi,
}

impl Provider {
    fn command(self) -> &'static str {
        match self {
            Self::OpenCode => {
                if cfg!(windows) {
                    "opencode.exe"
                } else {
                    "opencode"
                }
            }
            Self::Antigravity => {
                if cfg!(windows) {
                    "agy_acp_server.exe"
                } else {
                    "agy_acp_server.par"
                }
            }
            Self::Grok => {
                if cfg!(windows) {
                    "grok.exe"
                } else {
                    "grok"
                }
            }
            Self::Cursor => "cursor-agent",
            Self::Copilot => "copilot",
            Self::QwenCode => "qwen",
            Self::Kimi => "kimi",
        }
    }

    fn args(self) -> &'static [&'static str] {
        match self {
            Self::OpenCode => &["acp"],
            Self::Antigravity if cfg!(target_os = "linux") => &["--uid="],
            Self::Antigravity => &[],
            Self::Grok => &["agent", "stdio"],
            Self::Cursor => &["acp"],
            Self::Copilot => &["--acp", "--stdio"],
            Self::QwenCode => &["--acp"],
            Self::Kimi => &["acp"],
        }
    }
}

struct LaunchOptions {
    command: PathBuf,
    args: Zeroizing<Vec<String>>,
    prefix_args: Vec<String>,
}

fn launch_options(
    provider: Provider,
    mut args: Zeroizing<Vec<String>>,
) -> Result<LaunchOptions, std::io::Error> {
    let explicit = args.first().is_some_and(|arg| arg == "--command");
    let command = if explicit {
        if args.len() < 2 || args[1].is_empty() {
            return Err(std::io::Error::from(std::io::ErrorKind::InvalidInput));
        }
        args.remove(0);
        PathBuf::from(args.remove(0))
    } else {
        PathBuf::from(provider.command())
    };
    let (command, prefix_args) = if matches!(provider, Provider::Cursor) {
        cursor::resolve(&command, explicit)?
    } else if matches!(
        provider,
        Provider::Copilot | Provider::QwenCode | Provider::Kimi
    ) {
        let package = match provider {
            Provider::Copilot => Some(("@github/copilot", "copilot")),
            Provider::QwenCode => Some(("@qwen-code/qwen-code", "qwen")),
            _ => None,
        };
        installed::resolve(&command, explicit, package)?
    } else {
        (command, Vec::new())
    };
    Ok(LaunchOptions {
        command,
        args,
        prefix_args,
    })
}

pub fn run(provider: Provider) -> ! {
    let options = launch_options(provider, Zeroizing::new(std::env::args().skip(1).collect()));
    let mut options = match options {
        Ok(options) => options,
        Err(error) => {
            if error.kind() == std::io::ErrorKind::InvalidInput {
                eprintln!("ACP launcher requires an executable path after --command.");
            } else {
                report_launch_error(error.kind());
            }
            std::process::exit(2);
        }
    };
    let mut command = Command::new(&options.command);
    if matches!(provider, Provider::Cursor) && !options.prefix_args.is_empty() {
        command.env("CURSOR_INVOKED_AS", "cursor-agent");
    }
    command
        .args(&options.prefix_args)
        .args(provider.args())
        .args(&*options.args);
    // No protocol proxy: stdin, stdout and stderr remain connected directly to the host.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let error = command.exec();
        options.args.zeroize();
        report_launch_error(error.kind());
        std::process::exit(1);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
        // Assign the launcher before spawning. Its children inherit the job, with no race
        // between child creation and assignment. The OS closes this handle on any exit.
        let _job = match windows_job() {
            Ok(job) => job,
            Err(()) => {
                eprintln!("ACP launcher could not establish process ownership.");
                std::process::exit(1);
            }
        };
        let child = command.spawn();
        drop(command);
        options.args.zeroize();
        let mut child = match child {
            Ok(child) => child,
            Err(error) => {
                report_launch_error(error.kind());
                std::process::exit(1);
            }
        };
        let code = child
            .wait()
            .ok()
            .and_then(|status| status.code())
            .unwrap_or(1);
        std::process::exit(code);
    }
}

fn report_launch_error(kind: std::io::ErrorKind) {
    if kind == std::io::ErrorKind::NotFound {
        eprintln!(
            "ACP upstream executable not found. Install the official agent or configure --command with its executable path."
        );
    } else {
        eprintln!("ACP upstream executable could not be started.");
    }
}

#[cfg(windows)]
fn windows_job() -> Result<windows_sys::Win32::Foundation::HANDLE, ()> {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::{JobObjects::*, Threading::GetCurrentProcess},
    };
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return Err(());
        }
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const _,
            std::mem::size_of_val(&limits) as u32,
        ) == 0
            || AssignProcessToJobObject(job, GetCurrentProcess()) == 0
        {
            CloseHandle(job);
            return Err(());
        }
        Ok(job)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executable_override_keeps_argument_boundaries_and_missing_value_is_rejected() {
        let options = launch_options(
            Provider::OpenCode,
            Zeroizing::new(vec![
                "--command".into(),
                "/Applications/My Agent/opencode".into(),
                "--model".into(),
                "provider/model with spaces".into(),
                "$(touch forbidden)".into(),
            ]),
        )
        .unwrap();
        assert_eq!(
            options.command,
            PathBuf::from("/Applications/My Agent/opencode")
        );
        assert_eq!(
            &*options.args,
            &[
                "--model",
                "provider/model with spaces",
                "$(touch forbidden)"
            ]
        );
        assert!(
            launch_options(Provider::OpenCode, Zeroizing::new(vec!["--command".into()])).is_err()
        );
    }
}
