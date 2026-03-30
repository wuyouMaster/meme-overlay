#[cfg(target_os = "macos")]
use core_foundation::base::TCFType;
#[cfg(target_os = "macos")]
use core_foundation::data::CFData;
#[cfg(target_os = "macos")]
use core_foundation::string::CFString;
#[cfg(target_os = "macos")]
use objc::runtime::{Class, Object, Sel, BOOL, NO, YES};
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};
use std::path::Path;

/// 从文件路径创建 Security-Scoped Bookmark
#[cfg(target_os = "macos")]
pub fn create_bookmark(path: &Path) -> Result<String, String> {
    unsafe {
        let ns_string_cls = Class::get("NSString").ok_or("NSString class not found")?;
        let path_str = path.to_str().ok_or("Invalid path")?;
        let ns_path: *mut Object =
            msg_send![ns_string_cls, stringWithUTF8String: path_str.as_ptr()];
        if ns_path.is_null() {
            return Err("Failed to create NSString".to_string());
        }

        let url_cls = Class::get("NSURL").ok_or("NSURL class not found")?;
        let url: *mut Object = msg_send![url_cls, fileURLWithPath: ns_path];
        if url.is_null() {
            return Err("Failed to create NSURL".to_string());
        }

        let mut error: *mut Object = std::ptr::null_mut();
        // NSURLBookmarkCreationWithSecurityScope = 0x800 (2048)
        let bookmark_data: *mut Object = msg_send![url, bookmarkDataWithOptions:0x800u64
            includingResourceValuesForKeys:std::ptr::null::<Object>()
            relativeToURL:std::ptr::null::<Object>()
            error:&mut error];

        if bookmark_data.is_null() || !error.is_null() {
            let error_desc: *mut Object = msg_send![error, localizedDescription];
            let desc: *const i8 = msg_send![error_desc, UTF8String];
            if !desc.is_null() {
                let desc_str = std::ffi::CStr::from_ptr(desc).to_string_lossy().to_string();
                return Err(format!("Failed to create bookmark: {}", desc_str));
            }
            return Err("Failed to create bookmark: unknown error".to_string());
        }

        let bytes: *const u8 = msg_send![bookmark_data, bytes];
        let length: usize = msg_send![bookmark_data, length];
        let slice = std::slice::from_raw_parts(bytes, length);
        Ok(base64_encode(slice))
    }
}

/// 使用 Security-Scoped Bookmark 获取文件路径并开始访问
#[cfg(target_os = "macos")]
pub fn resolve_bookmark(bookmark_str: &str) -> Result<String, String> {
    unsafe {
        let bookmark_data =
            base64_decode(bookmark_str).map_err(|e| format!("Failed to decode bookmark: {}", e))?;

        let ns_data_cls = Class::get("NSData").ok_or("NSData class not found")?;
        let bookmark: *mut Object = msg_send![ns_data_cls, dataWithBytes: bookmark_data.as_ptr() 
            length: bookmark_data.len()];
        if bookmark.is_null() {
            return Err("Failed to create NSData".to_string());
        }

        let mut is_stale: BOOL = NO;
        let mut error: *mut Object = std::ptr::null_mut();
        let url_cls = Class::get("NSURL").ok_or("NSURL class not found")?;
        // NSURLBookmarkResolutionWithSecurityScope = 0x400 (1024)
        let url: *mut Object = msg_send![url_cls, URLByResolvingBookmarkData:bookmark
            options:0x400u64
            relativeToURL:std::ptr::null::<Object>()
            bookmarkDataIsStale:&mut is_stale
            error:&mut error];

        if url.is_null() || !error.is_null() {
            let error_desc: *mut Object = msg_send![error, localizedDescription];
            let desc: *const i8 = msg_send![error_desc, UTF8String];
            if !desc.is_null() {
                let desc_str = std::ffi::CStr::from_ptr(desc).to_string_lossy().to_string();
                return Err(format!("Failed to resolve bookmark: {}", desc_str));
            }
            return Err("Failed to resolve bookmark: unknown error".to_string());
        }

        // 开始访问安全范围资源
        let access_granted: BOOL = msg_send![url, startAccessingSecurityScopedResource];
        if access_granted == NO {
            return Err("Failed to start accessing security scoped resource".to_string());
        }

        // 获取文件路径
        let path_str: *mut Object = msg_send![url, path];
        let c_str: *const i8 = msg_send![path_str, UTF8String];
        if c_str.is_null() {
            let _: () = msg_send![url, stopAccessingSecurityScopedResource];
            return Err("Failed to get path from URL".to_string());
        }

        Ok(std::ffi::CStr::from_ptr(c_str)
            .to_string_lossy()
            .to_string())
    }
}

/// 停止访问安全范围资源
#[cfg(target_os = "macos")]
pub fn stop_accessing(path: &str) {
    unsafe {
        let ns_string_cls = Class::get("NSString").unwrap();
        let ns_path: *mut Object = msg_send![ns_string_cls, stringWithUTF8String: path.as_ptr()];
        let url_cls = Class::get("NSURL").unwrap();
        let url: *mut Object = msg_send![url_cls, fileURLWithPath: ns_path];
        let _: () = msg_send![url, stopAccessingSecurityScopedResource];
    }
}

/// 读取文件内容（通过 Bookmark）
#[cfg(target_os = "macos")]
pub fn read_via_bookmark(bookmark_str: &str) -> Result<Vec<u8>, String> {
    unsafe {
        let bookmark_data =
            base64_decode(bookmark_str).map_err(|e| format!("Failed to decode bookmark: {}", e))?;

        let ns_data_cls = Class::get("NSData").ok_or("NSData class not found")?;
        let bookmark: *mut Object = msg_send![ns_data_cls, dataWithBytes: bookmark_data.as_ptr() 
            length: bookmark_data.len()];
        if bookmark.is_null() {
            return Err("Failed to create NSData".to_string());
        }

        let mut is_stale: BOOL = NO;
        let mut error: *mut Object = std::ptr::null_mut();
        let url_cls = Class::get("NSURL").ok_or("NSURL class not found")?;
        // NSURLBookmarkResolutionWithSecurityScope = 0x400 (1024)
        let url: *mut Object = msg_send![url_cls, URLByResolvingBookmarkData:bookmark
            options:0x400u64
            relativeToURL:std::ptr::null::<Object>()
            bookmarkDataIsStale:&mut is_stale
            error:&mut error];

        if url.is_null() || !error.is_null() {
            let error_desc: *mut Object = msg_send![error, localizedDescription];
            let desc: *const i8 = msg_send![error_desc, UTF8String];
            if !desc.is_null() {
                let desc_str = std::ffi::CStr::from_ptr(desc).to_string_lossy().to_string();
                return Err(format!("Failed to resolve bookmark: {}", desc_str));
            }
            return Err("Failed to resolve bookmark: unknown error".to_string());
        }

        // 开始访问安全范围资源
        let access_granted: BOOL = msg_send![url, startAccessingSecurityScopedResource];
        if access_granted == NO {
            return Err("Failed to start accessing security scoped resource".to_string());
        }

        // 读取文件内容
        let mut read_error: *mut Object = std::ptr::null_mut();
        let file_data: *mut Object = msg_send![ns_data_cls, dataWithContentsOfURL:url
            options:0
            error:&mut read_error];

        // 停止访问
        let _: () = msg_send![url, stopAccessingSecurityScopedResource];

        if file_data.is_null() || !read_error.is_null() {
            let error_desc: *mut Object = msg_send![read_error, localizedDescription];
            let desc: *const i8 = msg_send![error_desc, UTF8String];
            if !desc.is_null() {
                let desc_str = std::ffi::CStr::from_ptr(desc).to_string_lossy().to_string();
                return Err(format!("Failed to read file: {}", desc_str));
            }
            return Err("Failed to read file: unknown error".to_string());
        }

        let bytes: *const u8 = msg_send![file_data, bytes];
        let length: usize = msg_send![file_data, length];
        let slice = std::slice::from_raw_parts(bytes, length);
        Ok(slice.to_vec())
    }
}

#[cfg(not(target_os = "macos"))]
pub fn create_bookmark(path: &Path) -> Result<String, String> {
    Ok(path.to_string_lossy().to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn resolve_bookmark(bookmark_str: &str) -> Result<String, String> {
    Ok(bookmark_str.to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn stop_accessing(_path: &str) {}

#[cfg(not(target_os = "macos"))]
pub fn read_via_bookmark(bookmark_str: &str) -> Result<Vec<u8>, String> {
    std::fs::read(bookmark_str).map_err(|e| format!("Failed to read file: {}", e))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let mut buf = [0u8; 3];
        for (i, &b) in chunk.iter().enumerate() {
            buf[i] = b;
        }
        result.push(CHARS[(buf[0] >> 2) as usize] as char);
        result.push(CHARS[(((buf[0] & 0x03) << 4) | (buf[1] >> 4)) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[(((buf[1] & 0x0f) << 2) | (buf[2] >> 6)) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(buf[2] & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0u32;

    for c in s.bytes() {
        if c == b'=' {
            continue;
        }
        let val = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => continue,
        };
        buf = (buf << 6) | val as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            result.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(result)
}
