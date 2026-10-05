use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
};

fn le16(bytes: &mut [u8], at: usize, value: u16) {
    bytes[at..at + 2].copy_from_slice(&value.to_le_bytes());
}
fn le32(bytes: &mut [u8], at: usize, value: u32) {
    bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
}
fn le64(bytes: &mut [u8], at: usize, value: u64) {
    bytes[at..at + 8].copy_from_slice(&value.to_le_bytes());
}
fn elf() -> Vec<u8> {
    let mut b = vec![0; 512];
    b[..7].copy_from_slice(b"\x7fELF\x02\x01\x01");
    le16(&mut b, 16, 2);
    le16(&mut b, 18, 62);
    le32(&mut b, 20, 1);
    le64(&mut b, 24, 0x401000);
    le64(&mut b, 40, 128);
    le16(&mut b, 52, 64);
    le16(&mut b, 58, 64);
    le16(&mut b, 60, 3);
    le16(&mut b, 62, 2);
    le32(&mut b, 192, 1);
    le32(&mut b, 196, 1);
    le64(&mut b, 200, 6);
    le64(&mut b, 208, 0x401000);
    le64(&mut b, 216, 384);
    le64(&mut b, 224, 1);
    le32(&mut b, 256, 7);
    le32(&mut b, 260, 3);
    le64(&mut b, 280, 320);
    le64(&mut b, 288, 17);
    b[320..337].copy_from_slice(b"\0.text\0.shstrtab\0");
    b[384] = 0xC3;
    b
}
fn big_elf() -> Vec<u8> {
    let mut b = vec![0; 52];
    b[..7].copy_from_slice(b"\x7fELF\x01\x02\x01");
    b[16..18].copy_from_slice(&2u16.to_be_bytes());
    b[18..20].copy_from_slice(&20u16.to_be_bytes());
    b[20..24].copy_from_slice(&1u32.to_be_bytes());
    b[24..28].copy_from_slice(&0x12345678u32.to_be_bytes());
    b[40..42].copy_from_slice(&52u16.to_be_bytes());
    b[46..48].copy_from_slice(&40u16.to_be_bytes());
    b
}
fn macho(cpu: u32) -> Vec<u8> {
    let mut b = vec![0; 272];
    le32(&mut b, 0, 0xfeedfacf);
    le32(&mut b, 4, cpu);
    le32(&mut b, 12, 2);
    le32(&mut b, 16, 2);
    le32(&mut b, 20, 176);
    le32(&mut b, 32, 0x19);
    le32(&mut b, 36, 152);
    b[40..46].copy_from_slice(b"__TEXT");
    le64(&mut b, 56, 0x100000000);
    le64(&mut b, 64, 4096);
    le64(&mut b, 80, 272);
    le32(&mut b, 88, 7);
    le32(&mut b, 92, 5);
    le32(&mut b, 96, 1);
    b[104..110].copy_from_slice(b"__text");
    b[120..126].copy_from_slice(b"__TEXT");
    le64(&mut b, 136, 0x100000100);
    le64(&mut b, 144, 4);
    le32(&mut b, 152, 256);
    le32(&mut b, 156, 2);
    le32(&mut b, 184, 0x80000028);
    le32(&mut b, 188, 24);
    le64(&mut b, 192, 256);
    b[256..260].copy_from_slice(&[0xc0, 0x03, 0x5f, 0xd6]);
    b
}
fn pe() -> Vec<u8> {
    let mut b = vec![0; 1024];
    b[..2].copy_from_slice(b"MZ");
    le32(&mut b, 60, 128);
    b[128..132].copy_from_slice(b"PE\0\0");
    le16(&mut b, 132, 0x8664);
    le16(&mut b, 134, 1);
    le16(&mut b, 148, 240);
    le16(&mut b, 150, 2);
    le16(&mut b, 152, 0x20b);
    le32(&mut b, 168, 0x1000);
    le64(&mut b, 176, 0x140000000);
    le32(&mut b, 184, 4096);
    le32(&mut b, 188, 512);
    le32(&mut b, 208, 8192);
    le32(&mut b, 212, 512);
    le32(&mut b, 260, 16);
    b[392..397].copy_from_slice(b".text");
    le32(&mut b, 400, 1);
    le32(&mut b, 404, 4096);
    le32(&mut b, 408, 512);
    le32(&mut b, 412, 512);
    le32(&mut b, 428, 0x60000020);
    b[512] = 0xc3;
    b
}
fn fat() -> Vec<u8> {
    let mut b = vec![0; 1280];
    b[..4].copy_from_slice(&0xcafebabeu32.to_be_bytes());
    b[4..8].copy_from_slice(&2u32.to_be_bytes());
    for (i, cpu, offset) in [(0, 0x100000cu32, 256u32), (1, 0x1000007u32, 768u32)] {
        let at = 8 + i * 20;
        b[at..at + 4].copy_from_slice(&cpu.to_be_bytes());
        b[at + 8..at + 12].copy_from_slice(&offset.to_be_bytes());
        b[at + 12..at + 16].copy_from_slice(&272u32.to_be_bytes());
        b[at + 16..at + 20].copy_from_slice(&8u32.to_be_bytes());
        b[offset as usize..offset as usize + 272].copy_from_slice(&macho(cpu));
    }
    b
}

#[test]
fn native_protocol_inspects_formats_and_preserves_absolute_section_offsets() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("binary");
    let executable = std::env::var_os("FILE_PREVIEW_PACKAGE_BIN")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_binary-preview").into());
    let mut child = Command::new(executable)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut inspect = |data: &[u8], index: u32| {
        std::fs::write(&path, data).unwrap();
        writeln!(input,"{}",json!({"protocolVersion":1,"payload":{"requestId":"inspect","kind":{"type":"dispatchCommand","command":"preview.render","args":{"path":path,"page":index}}}})).unwrap();
        input.flush().unwrap();
        let mut line = String::new();
        output.read_line(&mut line).unwrap();
        let result: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(result["requestId"], "inspect");
        result["payload"]["result"].clone()
    };
    let value = |page: &Value, key: &str| {
        page["value"]["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|field| field["key"] == key)
            .unwrap()["value"]
            .as_str()
            .unwrap()
            .to_string()
    };
    for (bytes, format, arch, bits, endian, entry, section_offset) in [
        (
            elf(),
            "ELF",
            "X86_64",
            "64",
            "little_endian",
            "0x401000",
            Some(384),
        ),
        (
            big_elf(),
            "ELF",
            "PowerPc",
            "32",
            "big_endian",
            "0x12345678",
            None,
        ),
        (
            pe(),
            "PE",
            "X86_64",
            "64",
            "little_endian",
            "0x140001000",
            Some(512),
        ),
        (
            macho(0x100000c),
            "Mach-O",
            "Aarch64",
            "64",
            "little_endian",
            "0x100000100",
            Some(256),
        ),
    ] {
        let page = inspect(&bytes, 0);
        assert_eq!(page["status"], "ok", "{format}");
        for (key, expected) in [
            ("format", format),
            ("architecture", arch),
            ("bitness", bits),
            ("byte_order", endian),
            ("entry_point", entry),
        ] {
            assert_eq!(value(&page, key), expected, "{format}:{key}");
        }
        if let Some(offset) = section_offset {
            assert_eq!(page["value"]["sections"][0]["offset"], offset);
        }
    }
    let page = inspect(&fat(), 1);
    assert_eq!(page["value"]["objects"], json!(["Aarch64", "X86_64"]));
    assert_eq!(page["value"]["sections"][0]["offset"], 1024);
    assert_eq!(value(&page, "entry_file_offset"), "0x400");
    assert_eq!(inspect(&fat(), 2)["error"]["code"], "invalid_page");
    let page = inspect(b"abc", 0);
    assert_eq!(
        value(&page, "sha256"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert_eq!(value(&page, "format"), "unknown_format");
    drop(input);
    child.wait().unwrap();
}
