fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        pkg_config::Config::new()
            .statik(true)
            .probe("libcbor")
            .expect("libcbor build dependency");
        let udev = pkg_config::Config::new()
            .cargo_metadata(false)
            .probe("libudev")
            .expect("libudev build dependency");
        for directory in udev.link_paths {
            println!("cargo:rustc-link-search=native={}", directory.display());
        }
        // Keep udev after libfido2's bundled archive so --as-needed does not
        // discard it before the HID and NFC objects introduce their references.
        println!("cargo:rustc-link-arg=-ludev");
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        // libfido2's Homebrew pkg-config file omits its static HID frameworks
        // and CBOR dependency. Keep them confined to this provider executable.
        pkg_config::Config::new()
            .statik(true)
            .probe("libcbor")
            .expect("libcbor build dependency");
        println!("cargo:rustc-link-lib=framework=CoreFoundation");
        println!("cargo:rustc-link-lib=framework=IOKit");
    }
}
