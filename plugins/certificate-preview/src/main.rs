// SPDX-License-Identifier: MIT
use base64::Engine;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use x509_parser::prelude::*;
use zeroize::Zeroizing;

fn fingerprint(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(":")
}
fn field(key: &str, value: impl ToString) -> Value {
    json!({"key":key,"value":value.to_string()})
}

fn algorithm(oid: &x509_parser::der_parser::oid::Oid<'_>) -> String {
    match oid2sn(oid, oid_registry()) {
        Ok(name) => format!("{name} ({oid})"),
        Err(_) => oid.to_id_string(),
    }
}

fn certificates(bytes: &[u8]) -> Result<Vec<Zeroizing<Vec<u8>>>, &'static str> {
    const BEGIN: &[u8] = b"-----BEGIN CERTIFICATE-----";
    const END: &[u8] = b"-----END CERTIFICATE-----";
    let mut result = Vec::new();
    let mut remaining = bytes;
    while let Some(start) = remaining
        .windows(BEGIN.len())
        .position(|part| part == BEGIN)
    {
        let body = &remaining[start + BEGIN.len()..];
        let end = body
            .windows(END.len())
            .position(|part| part == END)
            .ok_or("invalid_certificate")?;
        // Never decode other PEM labels: a mixed file may contain private keys.
        let encoded = Zeroizing::new(
            body[..end]
                .iter()
                .copied()
                .filter(|byte| !byte.is_ascii_whitespace())
                .collect::<Vec<_>>(),
        );
        let der = base64::engine::general_purpose::STANDARD
            .decode(&*encoded)
            .map_err(|_| "invalid_certificate")?;
        result.push(Zeroizing::new(der));
        if result.len() > 64 {
            return Err("inspection_limit");
        }
        remaining = &body[end + END.len()..];
    }
    if !result.is_empty() {
        return Ok(result);
    }
    if bytes.windows(11).any(|part| part == b"-----BEGIN ") {
        return Err("no_certificates");
    }
    remaining = bytes;
    while !remaining.is_empty() {
        let (rest, _) = parse_x509_certificate(remaining).map_err(|_| "invalid_certificate")?;
        if rest.len() >= remaining.len() {
            return Err("invalid_certificate");
        }
        result.push(Zeroizing::new(
            remaining[..remaining.len() - rest.len()].to_vec(),
        ));
        if result.len() > 64 {
            return Err("inspection_limit");
        }
        remaining = rest;
    }
    if result.is_empty() {
        return Err("no_certificates");
    }
    Ok(result)
}

fn inspect(args: &Value) -> Result<Value, &'static str> {
    let bytes = oxideterm_file_preview_protocol::read_source(args)?;
    let certificates = certificates(&bytes)?;
    let index = args["page"].as_u64().ok_or("invalid_request")? as usize;
    if index >= certificates.len() {
        return Err("invalid_page");
    }
    let mut objects = Vec::new();
    for der in &certificates {
        let (rest, cert) = parse_x509_certificate(der).map_err(|_| "invalid_certificate")?;
        if !rest.is_empty() {
            return Err("invalid_certificate");
        }
        let label = cert
            .subject()
            .iter_common_name()
            .next()
            .and_then(|name| name.as_str().ok())
            .map(str::to_string)
            .unwrap_or_else(|| cert.subject().to_string());
        if label.len() > 1024 {
            return Err("inspection_limit");
        }
        objects.push(label);
    }
    let der = &certificates[index];
    let (_, cert) = parse_x509_certificate(der).map_err(|_| "invalid_certificate")?;
    let not_before = cert.validity().not_before.timestamp();
    let not_after = cert.validity().not_after.timestamp();
    if not_before > not_after {
        return Err("invalid_certificate");
    }
    let mut domains = Vec::new();
    if let Some(san) = cert
        .subject_alternative_name()
        .map_err(|_| "invalid_certificate")?
    {
        for name in &san.value.general_names {
            let value = match name {
                GeneralName::DNSName(name) => format!("DNS: {name}"),
                GeneralName::RFC822Name(name) => format!("email: {name}"),
                GeneralName::URI(name) => format!("URI: {name}"),
                GeneralName::IPAddress(bytes) if bytes.len() == 4 => format!(
                    "IP: {}",
                    std::net::Ipv4Addr::new(bytes[0], bytes[1], bytes[2], bytes[3])
                ),
                GeneralName::IPAddress(bytes) if bytes.len() == 16 => format!(
                    "IP: {}",
                    std::net::Ipv6Addr::from(
                        <[u8; 16]>::try_from(*bytes).map_err(|_| "invalid_certificate")?
                    )
                ),
                _ => continue,
            };
            domains.push(value);
        }
    }
    let mut fields = vec![
        field("subject", cert.subject()),
        field("issuer", cert.issuer()),
        field("not_before", cert.validity().not_before),
        field("not_after", cert.validity().not_after),
        field("domains", domains.join("\n")),
        field(
            "public_key_algorithm",
            algorithm(&cert.public_key().algorithm.algorithm),
        ),
        field(
            "signature_algorithm",
            algorithm(&cert.signature_algorithm.algorithm),
        ),
        field("sha256", fingerprint(Sha256::digest(&**der))),
    ];
    if let Some(usage) = cert.key_usage().map_err(|_| "invalid_certificate")? {
        fields.push(field("key_usage", usage.value));
    }
    if let Some(usage) = cert
        .extended_key_usage()
        .map_err(|_| "invalid_certificate")?
    {
        let mut purposes = Vec::new();
        for (present, name) in [
            (usage.value.any, "anyExtendedKeyUsage"),
            (usage.value.server_auth, "serverAuth"),
            (usage.value.client_auth, "clientAuth"),
            (usage.value.code_signing, "codeSigning"),
            (usage.value.email_protection, "emailProtection"),
            (usage.value.time_stamping, "timeStamping"),
            (usage.value.ocsp_signing, "OCSPSigning"),
        ] {
            if present {
                purposes.push(name.to_string());
            }
        }
        purposes.extend(usage.value.other.iter().map(|oid| oid.to_id_string()));
        fields.push(field("extended_key_usage", purposes.join(", ")));
    }
    let mut details = vec![
        field("version", cert.version().0 + 1),
        field("serial", cert.raw_serial_as_string()),
        field("sha1", fingerprint(sha1::Sha1::digest(&**der))),
    ];
    if let Some(constraints) = cert
        .basic_constraints()
        .map_err(|_| "invalid_certificate")?
    {
        details.push(field(
            "constraints",
            format!(
                "CA={}, pathLen={}",
                constraints.value.ca,
                constraints
                    .value
                    .path_len_constraint
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "—".into())
            ),
        ));
    }
    details.push(field(
        "extensions",
        cert.extensions()
            .iter()
            .map(|extension| extension.oid.to_id_string())
            .collect::<Vec<_>>()
            .join("\n"),
    ));
    details.push(field(
        "critical_extensions",
        cert.extensions()
            .iter()
            .filter(|extension| extension.critical)
            .map(|extension| extension.oid.to_id_string())
            .collect::<Vec<_>>()
            .join("\n"),
    ));
    if fields
        .iter()
        .chain(&details)
        .any(|field| field["value"].as_str().unwrap_or_default().len() > 16384)
    {
        return Err("inspection_limit");
    }
    Ok(
        json!({"kind":"certificate","index":index,"objects":objects,"fields":fields,"details":details,"notBefore":not_before,"notAfter":not_after}),
    )
}

fn main() {
    oxideterm_file_preview_protocol::run(inspect);
}
