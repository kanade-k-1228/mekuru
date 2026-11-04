use super::ast::*;

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

pub fn value(s: &str) -> Result<ValKind, String> {
    match s {
        "true" => return Ok(ValKind::Bool(true)),
        "false" => return Ok(ValKind::Bool(false)),
        _ => {}
    }
    if s.starts_with('#') {
        return parse_color(s)
            .map(ValKind::Color)
            .ok_or_else(|| format!("invalid color `{s}` (write #rgb, #rrggbb or #rrggbbaa)"));
    }
    let num = |p: &str| match p.strip_suffix('%') {
        Some(n) => number(n).map(|v| ValKind::Num(v, Unit::Pct)),
        None => number(p).map(|v| ValKind::Num(v, Unit::None)),
    };
    let parts: Vec<&str> = s.split(' ').filter(|p| !p.is_empty()).collect();
    match parts.as_slice() {
        [one] if one.len() == s.len() => Ok(num(one).unwrap_or_else(|| ValKind::Str(s.to_string()))),
        [_, _, ..] if parts.iter().all(|p| num(p).is_some()) => Ok(ValKind::List(parts.iter().filter_map(|p| num(p)).collect())),
        _ => Ok(ValKind::Str(s.to_string())),
    }
}
