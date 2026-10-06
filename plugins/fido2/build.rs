fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        pkg_config::Config::new()
            .statik(true)
            .probe("libcbor")
            .expect("libcbor build dependency");
        pkg_config::Config::new()
            .probe("libudev")
            .expect("libudev build dependency");
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
