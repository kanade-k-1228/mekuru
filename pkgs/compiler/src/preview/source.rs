use roxmltree::Node;

pub fn format(xml: &str) -> Option<String> {
    let doc = roxmltree::Document::parse(xml).ok()?;
    let mut out = String::new();
    write(doc.root_element(), xml, 0, &mut out);
    Some(out)
}

fn write(node: Node, xml: &str, depth: usize, out: &mut String) {
    let raw = &xml[node.range()];
    out.push_str(&"  ".repeat(depth));
    if !node.children().any(|n| n.is_element()) || node.children().any(|n| n.is_text() && !n.text().unwrap_or("").trim().is_empty()) || node.attribute("pre").is_some() {
        out.push_str(raw);
        out.push('\n');
        return;
    }
    let mut quote = None;
    let end = raw.char_indices().find_map(|(i, c)| {
        if Some(c) == quote { quote = None; }
        else if quote.is_none() {
            if c == '\'' || c == '"' { quote = Some(c); }
            else if c == '>' { return Some(i + 1); }
        }
        None
    }).expect("start tag");
    out.push_str(&raw[..end]);
    out.push('\n');
    for child in node.children().filter(|n| n.is_element() || n.is_comment() || n.is_pi()) {
        if child.is_element() { write(child, xml, depth + 1, out); }
        else { out.push_str(&"  ".repeat(depth + 1)); out.push_str(&xml[child.range()]); out.push('\n'); }
    }
    out.push_str(&"  ".repeat(depth));
    out.push_str(&raw[raw.rfind("</").expect("end tag")..]);
    out.push('\n');
}
