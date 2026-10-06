// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: MIT

mod fido;
#[allow(dead_code)]
mod protocol;
use protocol::*;

fn main() {
    if std::env::args().skip(1).collect::<Vec<_>>() != ["--stdio"] {
        eprintln!("Use --stdio for the private OxideTerm signing protocol.");
        std::process::exit(2);
    }
    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    let result = (|| {
        write_message(
            &mut output,
            &SecurityKeyResponse::Ready {
                protocol_version: SECURITY_KEY_PROTOCOL_VERSION,
            },
        )
        .map_err(|_| SecurityKeyError::DeviceFailure)?;
        let request = read_message(&mut input).map_err(|_| SecurityKeyError::InvalidRequest)?;
        fido::sign(request, &mut input, &mut output)
    })();
    match result {
        Ok(response) => {
            let _ = write_message(&mut output, &response);
        }
        Err(code) => {
            let _ = write_message(&mut output, &SecurityKeyResponse::Failure { code });
        }
    }
}
