// SPDX-License-Identifier: MIT

use base64::Engine;
use pdfium_render::prelude::*;
use serde_json::{Value, json};
use std::io::{self, BufRead, Cursor, Write};

fn load_engine() -> Result<Pdfium, &'static str> {
    let executable = std::env::current_exe().map_err(|_| "renderer_unavailable")?;
    let directory = executable
        .parent()
        .and_then(|path| path.parent())
        .ok_or("renderer_unavailable")?;
    let library = directory
        .join("lib")
        .join(Pdfium::pdfium_platform_library_name());
    // Only load the bundled, checksum-verified engine; never search system libraries.
    Ok(Pdfium::new(
        Pdfium::bind_to_library(library).map_err(|_| "renderer_unavailable")?,
    ))
}

fn render(pdfium: &Pdfium, args: &Value) -> Result<Value, &'static str> {
    let path = args["path"].as_str().ok_or("invalid_request")?;
    let page_index = args["page"]
        .as_u64()
        .filter(|value| *value < 65_535)
        .ok_or("invalid_page")?;
    let width = args["width"]
        .as_u64()
        .filter(|value| (256..=2048).contains(value))
        .ok_or("invalid_width")?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|_| "document_unreadable")?;
    let pages = document.pages();
    let page = pages.get(page_index as i32).map_err(|_| "invalid_page")?;
    let bitmap = page
        .render_with_config(
            &PdfRenderConfig::new()
                .set_target_width(width as i32)
                .set_maximum_height(3906),
        )
        .map_err(|_| "render_failed")?;
    let image = bitmap.as_image().map_err(|_| "render_failed")?;
    if u64::from(image.width()) * u64::from(image.height()) > 8_000_000 {
        return Err("page_too_large");
    }
    let mut png = Cursor::new(Vec::new());
    image
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|_| "render_failed")?;
    if png.get_ref().len() > 12 * 1024 * 1024 {
        return Err("page_too_large");
    }
    Ok(json!({"pageCount": pages.len(), "page": page_index,
        "png": base64::engine::general_purpose::STANDARD.encode(png.into_inner())}))
}

fn handle(request: &Value, engine: &Result<Pdfium, &'static str>) -> Result<Value, &'static str> {
    let kind = &request["kind"];
    match kind["type"].as_str() {
        Some("activate") => engine
            .as_ref()
            .map(|_| json!({"ready": true}))
            .map_err(|error| *error),
        Some("health") => Ok(json!({"ok": true})),
        Some("deactivate" | "kill") => Ok(json!({"stopped": true})),
        Some("dispatchCommand") if kind["command"] == "preview.render" => {
            render(engine.as_ref().map_err(|error| *error)?, &kind["args"])
        }
        _ => Err("unsupported_request"),
    }
}

fn main() {
    // Pdfium bindings are process-global and must be initialized exactly once.
    let engine = load_engine();
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            break;
        };
        let Ok(envelope) = serde_json::from_str::<Value>(&line) else {
            break;
        };
        if envelope["protocolVersion"] != 1 {
            break;
        }
        let request = &envelope["payload"];
        let result = match handle(request, &engine) {
            Ok(value) => json!({"status": "ok", "value": value}),
            // Neither paths nor parser diagnostics belong in protocol errors.
            Err(code) => {
                json!({"status": "error", "error": {"code": code, "message": "Document preview failed", "recoverable": true}})
            }
        };
        let response = json!({"protocolVersion": 1, "requestId": request["requestId"],
            "payload": {"requestId": request["requestId"], "result": result}});
        if writeln!(stdout, "{response}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
        if matches!(
            request["kind"]["type"].as_str(),
            Some("deactivate" | "kill")
        ) {
            break;
        }
    }
}
