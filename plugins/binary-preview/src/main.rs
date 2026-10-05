// SPDX-License-Identifier: MIT
use object::{
    FileKind, Object, ObjectSection, ObjectSegment,
    read::macho::{FatArch, MachOFatFile32, MachOFatFile64},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn field(key: &str, value: impl ToString) -> Value {
    json!({"key":key,"value":value.to_string()})
}
fn macho_entry_offset(file: &object::File<'_>) -> Result<Option<u64>, &'static str> {
    let mut commands = match file {
        object::File::MachO32(macho) => macho.macho_load_commands(),
        object::File::MachO64(macho) => macho.macho_load_commands(),
        _ => return Ok(None),
    }
    .map_err(|_| "invalid_binary")?;
    while let Some(command) = commands.next().map_err(|_| "invalid_binary")? {
        if let Some(entry) = command.entry_point().map_err(|_| "invalid_binary")? {
            return Ok(Some(entry.entryoff.get(file.endianness())));
        }
    }
    Ok(None)
}
fn inspect(args: &Value) -> Result<Value, &'static str> {
    let bytes = oxideterm_file_preview_protocol::read_source(args)?;
    let data = bytes.as_slice();
    let index = args["page"]
        .as_u64()
        .filter(|index| *index < 64)
        .ok_or("invalid_page")? as usize;
    let checksum = Sha256::digest(data)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let mut slices = Vec::<(u64, &[u8])>::new();
    let kind = FileKind::parse(data).ok();
    match kind {
        Some(FileKind::MachOFat32) => {
            let fat = MachOFatFile32::parse(data).map_err(|_| "invalid_binary")?;
            if fat.arches().len() > 64 {
                return Err("inspection_limit");
            }
            for arch in fat.arches() {
                slices.push((
                    arch.file_range().0,
                    arch.data(data).map_err(|_| "invalid_binary")?,
                ));
            }
        }
        Some(FileKind::MachOFat64) => {
            let fat = MachOFatFile64::parse(data).map_err(|_| "invalid_binary")?;
            if fat.arches().len() > 64 {
                return Err("inspection_limit");
            }
            for arch in fat.arches() {
                slices.push((
                    arch.file_range().0,
                    arch.data(data).map_err(|_| "invalid_binary")?,
                ));
            }
        }
        Some(
            FileKind::Elf32
            | FileKind::Elf64
            | FileKind::MachO32
            | FileKind::MachO64
            | FileKind::Pe32
            | FileKind::Pe64,
        ) => slices.push((0, data)),
        _ => {
            if index != 0 {
                return Err("invalid_page");
            }
            let format = if data.starts_with(b"\x89PNG\r\n\x1a\n") {
                "PNG"
            } else if data.starts_with(b"%PDF-") {
                "PDF"
            } else if data.starts_with(b"PK\x03\x04") {
                "ZIP"
            } else if data.starts_with(b"\x1f\x8b") {
                "GZIP"
            } else {
                "unknown_format"
            };
            return Ok(
                json!({"kind":"binary","index":0,"objects":[format],"size":data.len(),"fields":[field("format",format),field("file_size",data.len()),field("sha256",checksum)],"sections":[]}),
            );
        }
    }
    if slices.is_empty() || index >= slices.len() {
        return Err("invalid_page");
    }
    let mut objects = Vec::new();
    for (_, data) in &slices {
        let file = object::File::parse(*data).map_err(|_| "invalid_binary")?;
        objects.push(format!("{:?}", file.architecture()));
    }
    let (base, selected) = slices[index];
    let file = object::File::parse(selected).map_err(|_| "invalid_binary")?;
    let format = match FileKind::parse(selected).map_err(|_| "invalid_binary")? {
        FileKind::Elf32 | FileKind::Elf64 => "ELF",
        FileKind::Pe32 | FileKind::Pe64 => "PE",
        FileKind::MachO32 | FileKind::MachO64 => "Mach-O",
        _ => return Err("invalid_binary"),
    };
    let entry_offset = macho_entry_offset(&file)?;
    let entry = if let Some(offset) = entry_offset {
        // LC_MAIN stores a slice-relative file offset, unlike ELF/PE virtual entry addresses.
        file.segments()
            .find_map(|segment| {
                let (start, size) = segment.file_range();
                if offset >= start && offset - start < size {
                    segment.address().checked_add(offset - start)
                } else {
                    None
                }
            })
            .ok_or("invalid_binary")?
    } else {
        file.entry()
    };
    let mut fields = vec![
        field("format", format),
        field("architecture", format!("{:?}", file.architecture())),
        field("bitness", if file.is_64() { 64 } else { 32 }),
        field(
            "byte_order",
            if file.is_little_endian() {
                "little_endian"
            } else {
                "big_endian"
            },
        ),
        field("entry_point", format!("0x{entry:X}")),
        field("file_size", data.len()),
        field("sha256", checksum),
    ];
    if let Some(offset) = entry_offset {
        fields.push(field(
            "entry_file_offset",
            format!("0x{:X}", base.checked_add(offset).ok_or("invalid_binary")?),
        ));
    }
    let mut sections = Vec::new();
    for section in file.sections() {
        if sections.len() >= 1024 {
            return Err("inspection_limit");
        }
        let name = section.name().map_err(|_| "invalid_binary")?;
        if name.len() > 1024 {
            return Err("inspection_limit");
        }
        let (offset, size) = if let Some((offset, size)) = section.file_range() {
            if offset > selected.len() as u64 || size > selected.len() as u64 - offset {
                return Err("invalid_binary");
            }
            (
                Some(base.checked_add(offset).ok_or("invalid_binary")?),
                size,
            )
        } else {
            (None, section.size())
        };
        sections.push(json!({"name":name,"address":section.address(),"offset":offset,"size":size}));
    }
    Ok(
        json!({"kind":"binary","index":index,"objects":objects,"size":data.len(),"fields":fields,"sections":sections}),
    )
}
fn main() {
    oxideterm_file_preview_protocol::run(inspect);
}
