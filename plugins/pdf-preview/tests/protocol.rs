use base64::Engine;
use serde_json::{Value, json};
use std::{
    io::Write,
    process::{Command, Stdio},
};

fn document() -> Vec<u8> {
    let red = "1 0 0 rg 0 0 200 100 re f";
    let green = "0 1 0 rg 0 0 200 100 re f";
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>".into(),
        "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>".into(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 4 0 R >>"
            .into(),
        format!("<< /Length {} >>\nstream\n{red}\nendstream", red.len()),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 6 0 R >>"
            .into(),
        format!("<< /Length {} >>\nstream\n{green}\nendstream", green.len()),
    ];
    let mut pdf = "%PDF-1.4\n".to_string();
    let mut offsets = Vec::new();
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.push_str(&format!("{} 0 obj\n{object}\nendobj\n", index + 1));
    }
    let xref = pdf.len();
    pdf.push_str("xref\n0 7\n0000000000 65535 f \n");
    for offset in offsets {
        pdf.push_str(&format!("{offset:010} 00000 n \n"));
    }
    pdf.push_str(&format!(
        "trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ));
    pdf.into_bytes()
}

#[test]
fn packaged_renderer_renders_distinct_pages_and_rejects_invalid_documents() {
    let root = std::env::var_os("PDF_PREVIEW_PACKAGE_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("two pages.pdf");
    std::fs::write(&file, document()).unwrap();
    let broken = temp.path().join("broken.pdf");
    std::fs::write(&broken, b"not a PDF").unwrap();
    let binary = root.join("bin").join(if cfg!(windows) {
        "pdf-preview.exe"
    } else {
        "pdf-preview"
    });
    let mut child = Command::new(binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let commands = [
        json!({"type":"activate"}),
        json!({"type":"dispatchCommand", "command":"preview.render", "args":{"path":file,"page":0,"width":256}}),
        json!({"type":"dispatchCommand", "command":"preview.render", "args":{"path":file,"page":1,"width":512}}),
        json!({"type":"dispatchCommand", "command":"preview.render", "args":{"path":file,"page":2,"width":256}}),
        json!({"type":"dispatchCommand", "command":"preview.render", "args":{"path":broken,"page":0,"width":256}}),
        json!({"type":"dispatchCommand", "command":"preview.render", "args":{"path":file,"page":0,"width":100_000}}),
        json!({"type":"kill"}),
    ];
    for (id, kind) in commands.into_iter().enumerate() {
        writeln!(
            input,
            "{}",
            json!({"protocolVersion":1,"payload":{"requestId":id.to_string(),"kind":kind}})
        )
        .unwrap();
    }
    drop(input);
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    let responses: Vec<Value> = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(
        responses[0]["payload"]["result"]["value"],
        json!({"ready":true})
    );
    for (response, width, color) in [
        (&responses[1], 256, [255, 0, 0, 255]),
        (&responses[2], 512, [0, 255, 0, 255]),
    ] {
        assert_eq!(
            response["payload"]["result"]["status"], "ok",
            "{}",
            response["payload"]["result"]["error"]
        );
        let value = &response["payload"]["result"]["value"];
        assert_eq!(value["pageCount"], 2);
        let png = base64::engine::general_purpose::STANDARD
            .decode(value["png"].as_str().unwrap())
            .unwrap();
        let image = image::load_from_memory(&png).unwrap().to_rgba8();
        assert_eq!(image.dimensions(), (width, width / 2));
        assert_eq!(image.get_pixel(width / 2, width / 4).0, color);
    }
    for (response, code) in [
        (&responses[3], "invalid_page"),
        (&responses[4], "document_unreadable"),
        (&responses[5], "invalid_width"),
    ] {
        assert_eq!(response["payload"]["result"]["error"]["code"], code);
        assert!(!response.to_string().contains(temp.path().to_str().unwrap()));
    }
    assert_eq!(
        responses[6]["payload"]["result"]["value"],
        json!({"stopped":true})
    );
}
