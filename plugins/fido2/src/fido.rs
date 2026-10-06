// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: MIT

use crate::protocol::*;
use libfido2_sys::*;
use sha2::{Digest, Sha256};
use std::{
    ffi::{CStr, CString},
    io::{Read, Write},
    ptr,
};
use zeroize::Zeroizing;

struct Device(*mut fido_dev_t);
impl Drop for Device {
    fn drop(&mut self) {
        unsafe {
            fido_dev_close(self.0);
            fido_dev_free(&mut self.0);
        }
    }
}
struct Assertion(*mut fido_assert_t);
impl Drop for Assertion {
    fn drop(&mut self) {
        unsafe {
            fido_assert_free(&mut self.0);
        }
    }
}
struct Devices(*mut fido_dev_info_t);
impl Drop for Devices {
    fn drop(&mut self) {
        unsafe {
            fido_dev_info_free(&mut self.0, 64);
        }
    }
}

pub fn sign(
    request: SecurityKeyRequest,
    input: &mut impl Read,
    output: &mut impl Write,
) -> Result<SecurityKeyResponse, SecurityKeyError> {
    let SecurityKeyRequest::Sign {
        algorithm,
        application,
        key_handle,
        flags,
        challenge,
    } = request
    else {
        return Err(SecurityKeyError::InvalidRequest);
    };
    if !matches!(
        algorithm.as_str(),
        "sk-ssh-ed25519@openssh.com" | "sk-ecdsa-sha2-nistp256@openssh.com"
    ) || application.is_empty()
        || application.len() > 1024
        || application.contains('\0')
        || key_handle.is_empty()
        || key_handle.len() > 255
        || challenge.is_empty()
        || challenge.len() > 16 * 1024
        || flags & !0x25 != 0
    {
        return Err(SecurityKeyError::InvalidRequest);
    }
    let rp = CString::new(application).map_err(|_| SecurityKeyError::InvalidRequest)?;
    let digest = Sha256::digest(&challenge);
    // libfido2 logging stays disabled. The process owns every device and assertion
    // until completion; cancellation is a host-owned kill-and-reap operation.
    unsafe {
        fido_init(0);
    }
    let devices = Devices(unsafe { fido_dev_info_new(64) });
    if devices.0.is_null() {
        return Err(SecurityKeyError::DeviceFailure);
    }
    let mut count = 0;
    if unsafe { fido_dev_info_manifest(devices.0, 64, &mut count) } != FIDO_OK {
        return Err(SecurityKeyError::DeviceFailure);
    }
    if count == 0 {
        return Err(SecurityKeyError::NoDevice);
    }
    let mut failure = SecurityKeyError::CredentialNotFound;
    for index in 0..count {
        let info = unsafe { fido_dev_info_ptr(devices.0, index) };
        let path = unsafe { fido_dev_info_path(info) };
        if path.is_null() {
            continue;
        }
        let device = Device(unsafe { fido_dev_new() });
        if device.0.is_null() {
            return Err(SecurityKeyError::DeviceFailure);
        }
        if unsafe { fido_dev_open(device.0, CStr::from_ptr(path).as_ptr()) } != FIDO_OK {
            failure = SecurityKeyError::DeviceFailure;
            continue;
        }
        if unsafe { fido_dev_set_timeout(device.0, 30_000) } != FIDO_OK {
            return Err(SecurityKeyError::DeviceFailure);
        }
        let assertion = Assertion(unsafe { fido_assert_new() });
        if assertion.0.is_null() {
            return Err(SecurityKeyError::DeviceFailure);
        }
        for result in unsafe {
            [
                fido_assert_set_rp(assertion.0, rp.as_ptr()),
                fido_assert_set_clientdata_hash(assertion.0, digest.as_ptr(), digest.len()),
                fido_assert_allow_cred(assertion.0, key_handle.as_ptr(), key_handle.len()),
                fido_assert_set_up(
                    assertion.0,
                    if flags & 1 != 0 {
                        fido_opt_t_FIDO_OPT_TRUE
                    } else {
                        fido_opt_t_FIDO_OPT_FALSE
                    },
                ),
                fido_assert_set_uv(
                    assertion.0,
                    if flags & 4 != 0 {
                        fido_opt_t_FIDO_OPT_TRUE
                    } else {
                        fido_opt_t_FIDO_OPT_OMIT
                    },
                ),
            ]
        } {
            if result != FIDO_OK {
                return Err(SecurityKeyError::DeviceFailure);
            }
        }
        let mut pin: Option<Zeroizing<Vec<u8>>> = None;
        loop {
            if flags & 0x05 != 0 {
                write_message(output, &SecurityKeyResponse::Touch)
                    .map_err(|_| SecurityKeyError::DeviceFailure)?;
            }
            let result = unsafe {
                fido_dev_get_assert(
                    device.0,
                    assertion.0,
                    pin.as_ref().map_or(ptr::null(), |pin| pin.as_ptr().cast()),
                )
            };
            match result {
                FIDO_OK => {
                    if unsafe { fido_assert_count(assertion.0) } != 1 {
                        return Err(SecurityKeyError::InvalidSignature);
                    }
                    let length = unsafe { fido_assert_sig_len(assertion.0, 0) };
                    let signature_ptr = unsafe { fido_assert_sig_ptr(assertion.0, 0) };
                    if length == 0 || length > 1024 || signature_ptr.is_null() {
                        return Err(SecurityKeyError::InvalidSignature);
                    }
                    let raw = unsafe { std::slice::from_raw_parts(signature_ptr, length) };
                    let signature = if algorithm == "sk-ssh-ed25519@openssh.com" {
                        if raw.len() != 64 {
                            return Err(SecurityKeyError::InvalidSignature);
                        }
                        raw.to_vec()
                    } else {
                        let parsed = openssl::ecdsa::EcdsaSig::from_der(raw)
                            .map_err(|_| SecurityKeyError::InvalidSignature)?;
                        let mut encoded = Vec::new();
                        for number in [parsed.r(), parsed.s()] {
                            encode_mpint(&mut encoded, &number.to_vec());
                        }
                        encoded
                    };
                    return Ok(SecurityKeyResponse::Signature {
                        signature,
                        flags: unsafe { fido_assert_flags(assertion.0, 0) },
                        counter: unsafe { fido_assert_sigcount(assertion.0, 0) },
                    });
                }
                FIDO_ERR_PIN_REQUIRED | FIDO_ERR_PIN_INVALID | FIDO_ERR_UV_BLOCKED => {
                    let retry = result == FIDO_ERR_PIN_INVALID;
                    if result == FIDO_ERR_UV_BLOCKED && pin.is_some() {
                        return Err(SecurityKeyError::PinBlocked);
                    }
                    // A wrong PIN is retried only after another explicit native
                    // prompt. Never guess or cache the authenticator's PIN.
                    write_message(output, &SecurityKeyResponse::PinRequired { retry })
                        .map_err(|_| SecurityKeyError::DeviceFailure)?;
                    let SecurityKeyRequest::Pin { value } =
                        read_message(input).map_err(|_| SecurityKeyError::InvalidRequest)?
                    else {
                        return Err(SecurityKeyError::InvalidRequest);
                    };
                    if value.is_empty() || value.len() > 63 || value.contains('\0') {
                        return Err(SecurityKeyError::InvalidRequest);
                    }
                    let mut bytes = Zeroizing::new(value.as_bytes().to_vec());
                    bytes.push(0);
                    pin = Some(bytes);
                    if unsafe { fido_assert_set_uv(assertion.0, fido_opt_t_FIDO_OPT_OMIT) }
                        != FIDO_OK
                    {
                        return Err(SecurityKeyError::DeviceFailure);
                    }
                }
                FIDO_ERR_PIN_BLOCKED | FIDO_ERR_PIN_AUTH_BLOCKED => {
                    return Err(SecurityKeyError::PinBlocked);
                }
                FIDO_ERR_NO_CREDENTIALS => break,
                FIDO_ERR_ACTION_TIMEOUT | FIDO_ERR_USER_ACTION_TIMEOUT => {
                    return Err(SecurityKeyError::Timeout);
                }
                _ => {
                    failure = SecurityKeyError::DeviceFailure;
                    break;
                }
            }
        }
    }
    Err(failure)
}

fn encode_mpint(output: &mut Vec<u8>, value: &[u8]) {
    let bytes = value
        .iter()
        .position(|byte| *byte != 0)
        .map_or(&[][..], |index| &value[index..]);
    let leading_zero = bytes.first().is_some_and(|byte| byte & 0x80 != 0);
    output.extend(((bytes.len() + usize::from(leading_zero)) as u32).to_be_bytes());
    if leading_zero {
        output.push(0);
    }
    output.extend(bytes);
}
