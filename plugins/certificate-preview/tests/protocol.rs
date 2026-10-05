use rcgen::{
    CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, KeyPair, KeyUsagePurpose,
};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
};

#[test]
fn selected_certificates_are_exposed_without_private_keys_or_trust_claims() {
    let directory = tempfile::tempdir().unwrap();
    let key = KeyPair::generate().unwrap();
    let mut params =
        CertificateParams::new(vec!["example.test".into(), "www.example.test".into()]).unwrap();
    params.distinguished_name = DistinguishedName::new();
    params
        .distinguished_name
        .push(DnType::CommonName, "Example certificate");
    params.not_before = time::OffsetDateTime::from_unix_timestamp(1577836800).unwrap();
    params.not_after = time::OffsetDateTime::from_unix_timestamp(1609459200).unwrap();
    params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let first = params.self_signed(&key).unwrap();
    params.distinguished_name = DistinguishedName::new();
    params
        .distinguished_name
        .push(DnType::CommonName, "Second certificate");
    let second = params.self_signed(&key).unwrap();
    let pem = directory.path().join("bundle.pem");
    let private = key.serialize_pem();
    std::fs::write(
        &pem,
        format!("{}\n{}\n{}", private, first.pem(), second.pem()),
    )
    .unwrap();
    let der = directory.path().join("first.der");
    std::fs::write(&der, first.der()).unwrap();
    let executable = std::env::var_os("FILE_PREVIEW_PACKAGE_BIN")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_certificate-preview").into());
    let mut child = Command::new(executable)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut request = |path: &std::path::Path, index: u32| {
        writeln!(input,"{}",json!({"protocolVersion":1,"payload":{"requestId":"inspect","kind":{"type":"dispatchCommand","command":"preview.render","args":{"path":path,"page":index}}}})).unwrap();
        input.flush().unwrap();
        let mut line = String::new();
        output.read_line(&mut line).unwrap();
        assert!(!line.contains("PRIVATE KEY"));
        assert!(!line.contains(private.lines().nth(1).unwrap()));
        let response: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(response["requestId"], "inspect");
        response["payload"]["result"].clone()
    };
    let result = request(&pem, 0);
    assert_eq!(result["status"], "ok");
    let page = &result["value"];
    assert_eq!(
        page["objects"],
        json!(["Example certificate", "Second certificate"])
    );
    assert_eq!(page["notBefore"], 1577836800i64);
    assert_eq!(page["notAfter"], 1609459200i64);
    let fields = page["fields"].as_array().unwrap();
    assert_eq!(
        fields
            .iter()
            .find(|field| field["key"] == "subject")
            .unwrap()["value"],
        "CN=Example certificate"
    );
    assert_eq!(
        fields
            .iter()
            .find(|field| field["key"] == "domains")
            .unwrap()["value"],
        "DNS: example.test\nDNS: www.example.test"
    );
    assert_eq!(
        fields
            .iter()
            .find(|field| field["key"] == "extended_key_usage")
            .unwrap()["value"],
        "serverAuth"
    );
    assert!(!page.to_string().contains("trusted"));
    assert_eq!(request(&der, 0)["value"]["fields"], page["fields"]);
    assert_eq!(
        request(&pem, 1)["value"]["fields"][0]["value"],
        "CN=Second certificate"
    );
    assert_eq!(request(&pem, 2)["error"]["code"], "invalid_page");
    std::fs::write(&pem, &private).unwrap();
    assert_eq!(request(&pem, 0)["error"]["code"], "no_certificates");
    std::fs::write(&der, b"corrupt certificate").unwrap();
    assert_eq!(request(&der, 0)["error"]["code"], "invalid_certificate");
    drop(input);
    child.wait().unwrap();
}
