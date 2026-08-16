use std::{
    cell::{Cell, RefCell},
    mem, ptr,
};

use serde_json::{Value, json};

const PLUGIN_ID: &str = env!("OXIDETERM_PLUGIN_ID");
const TAB_ID: &str = "starter";
const TAB_REGISTRATION_ID: &str = "wasm-starter-tab";
const ACTION_CONTROL_ID: &str = "increment";

thread_local! {
    static INTERACTION_COUNT: Cell<u32> = const { Cell::new(0) };
    static OUTBOUND_MESSAGES: RefCell<Vec<Value>> = const { RefCell::new(Vec::new()) };
    static RESPONSE_BUFFER: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUTBOUND_BUFFER: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Initializes runtime-owned contributions when OxideTerm instantiates the module.
#[unsafe(no_mangle)]
pub extern "C" fn _start() {
    OUTBOUND_MESSAGES.with(|messages| {
        messages
            .borrow_mut()
            .extend([registration_message(), json!({ "type": "runtimeReady" })]);
    });
}

/// Reserves guest memory that the host fills with one JSON request.
#[unsafe(no_mangle)]
pub extern "C" fn oxideterm_plugin_alloc(length: i32) -> i32 {
    if length <= 0 {
        return 0;
    }
    let buffer = vec![0_u8; length as usize].into_boxed_slice();
    Box::into_raw(buffer) as *mut u8 as i32
}

/// Handles command-like requests sent through the WASM guest ABI.
#[unsafe(no_mangle)]
pub extern "C" fn oxideterm_plugin_command(pointer: i32, length: i32) -> i64 {
    let request = take_request(pointer, length);
    respond(&request, json!({ "handled": true }), Vec::new())
}

/// Handles plugin events and republishes the tab after an interaction.
#[unsafe(no_mangle)]
pub extern "C" fn oxideterm_plugin_event(pointer: i32, length: i32) -> i64 {
    let request = take_request(pointer, length);
    let is_increment = request
        .pointer("/kind/event/payload/controlId")
        .and_then(Value::as_str)
        == Some(ACTION_CONTROL_ID);

    let interaction_count = if is_increment {
        INTERACTION_COUNT.with(|count| {
            let next_count = count.get().saturating_add(1);
            count.set(next_count);
            next_count
        })
    } else {
        INTERACTION_COUNT.with(Cell::get)
    };
    let messages = if is_increment {
        vec![registration_message()]
    } else {
        Vec::new()
    };

    respond(
        &request,
        json!({
            "handled": is_increment,
            "interactionCount": interaction_count,
        }),
        messages,
    )
}

/// Returns messages queued during `_start` and clears the queue.
#[unsafe(no_mangle)]
pub extern "C" fn oxideterm_plugin_drain_outbound() -> i64 {
    let messages = OUTBOUND_MESSAGES.with(|queue| mem::take(&mut *queue.borrow_mut()));
    if messages.is_empty() {
        return 0;
    }
    let encoded = serde_json::to_vec(&messages).expect("serialize outbound messages");
    OUTBOUND_BUFFER.with(|buffer| store_buffer(&mut buffer.borrow_mut(), encoded))
}

fn take_request(pointer: i32, length: i32) -> Value {
    if pointer < 0 || length <= 0 {
        return Value::Null;
    }

    // The allocation originated as a boxed slice with this exact length, so
    // reconstructing the box also releases the host-populated input buffer.
    let raw_slice = ptr::slice_from_raw_parts_mut(pointer as usize as *mut u8, length as usize);
    let bytes = unsafe { Box::from_raw(raw_slice) };
    serde_json::from_slice(&bytes).unwrap_or(Value::Null)
}

fn respond(request: &Value, value: Value, messages: Vec<Value>) -> i64 {
    let request_id = request
        .get("requestId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let response = json!({
        "requestId": request_id,
        "result": {
            "status": "ok",
            "value": value,
        }
    });
    let payload = if messages.is_empty() {
        response
    } else {
        json!({ "response": response, "messages": messages })
    };
    let encoded = serde_json::to_vec(&payload).expect("serialize plugin response");
    RESPONSE_BUFFER.with(|buffer| store_buffer(&mut buffer.borrow_mut(), encoded))
}

fn store_buffer(buffer: &mut Vec<u8>, encoded: Vec<u8>) -> i64 {
    *buffer = encoded;
    let pointer = buffer.as_ptr() as usize as u32;
    let length = u32::try_from(buffer.len()).expect("response length fits the ABI");
    ((u64::from(pointer) << 32) | u64::from(length)) as i64
}

fn registration_message() -> Value {
    let interaction_count = INTERACTION_COUNT.with(Cell::get);
    json!({
        "type": "registerContribution",
        "registration": {
            "registrationId": TAB_REGISTRATION_ID,
            "pluginId": PLUGIN_ID,
            "kind": "tab",
            "metadata": {
                "tabId": TAB_ID,
                "schema": {
                    "componentVersion": 1,
                    "kind": "form",
                    "title": "OxideTerm WASM Plugin",
                    "description": "This interface is rendered and themed by OxideTerm.",
                    "sections": [{
                        "id": "wasm-content",
                        "title": "Portable interaction",
                        "controls": [{
                            "kind": "card",
                            "variant": "inspector",
                            "gap": "normal",
                            "children": [
                                {
                                    "kind": "markdown",
                                    "text": "Edit `src/lib.rs` to build a portable OxideTerm plugin."
                                },
                                {
                                    "kind": "keyValue",
                                    "label": "Interactions",
                                    "value": interaction_count.to_string()
                                },
                                {
                                    "kind": "button",
                                    "id": ACTION_CONTROL_ID,
                                    "label": "Increment",
                                    "icon": "plus",
                                    "variant": "default"
                                }
                            ]
                        }]
                    }]
                }
            }
        }
    })
}
