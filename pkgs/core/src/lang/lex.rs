pub fn number(s: &str) -> Option<f64> {
    let body = s.strip_prefix('-').unwrap_or(s);
    let digits = body.bytes().filter(u8::is_ascii_digit).count();
    let dots = body.bytes().filter(|&b| b == b'.').count();
    (digits > 0 && dots <= 1 && digits + dots == body.len()).then(|| s.parse().ok()).flatten()
}

pub fn parse_color(s: &str) -> Option<[u8; 4]> {
    let hex = s.strip_prefix('#')?;
    if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let nib = |i: usize| u8::from_str_radix(&hex[i..i + 1], 16).ok().map(|v| v * 17);
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    match hex.len() {
        3 => Some([nib(0)?, nib(1)?, nib(2)?, 255]),
        4 => Some([nib(0)?, nib(1)?, nib(2)?, nib(3)?]),
        6 => Some([byte(0)?, byte(2)?, byte(4)?, 255]),
        8 => Some([byte(0)?, byte(2)?, byte(4)?, byte(6)?]),
        _ => None,
    }
}
